import http from "node:http";
import net from "node:net";
import crypto from "node:crypto";

const HTTP_PORT = Number(process.env.PORT || 8080);
const CLAMD_HOST = process.env.CLAMD_HOST || "clamd";
const CLAMD_PORT = Number(process.env.CLAMD_PORT || 3310);
const SCANNER_SHARED_SECRET = process.env.SCANNER_SHARED_SECRET || "";
const MAX_SCAN_BYTES = Number(process.env.MAX_SCAN_BYTES || 104_857_600);
const CLAMD_TIMEOUT_MS = Number(process.env.CLAMD_TIMEOUT_MS || 60_000);
const SHA256_RE = /^[0-9a-f]{64}$/i;

function json(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(JSON.stringify(body));
}

function safeEqual(a, b) {
  const left = crypto.createHash("sha256").update(String(a)).digest();
  const right = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(left, right);
}

function authenticate(req) {
  if (!SCANNER_SHARED_SECRET) return false;
  return safeEqual(req.headers["x-scanner-secret"] || "", SCANNER_SHARED_SECRET);
}

function parseClamdResult(raw) {
  const line = raw.replace(/\0/g, "").trim();
  if (/^stream:\s+OK$/i.test(line)) {
    return { status: "clean", detection_name: null };
  }
  const found = line.match(/^stream:\s+(.+)\s+FOUND$/i);
  if (found) {
    return { status: "infected", detection_name: found[1].slice(0, 300) };
  }
  throw new Error("Unexpected clamd response");
}

async function clamdCommand(command) {
  return await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: CLAMD_HOST, port: CLAMD_PORT });
    const chunks = [];
    const timer = setTimeout(() => socket.destroy(new Error("clamd timeout")), CLAMD_TIMEOUT_MS);
    socket.once("error", reject);
    socket.on("data", (chunk) => chunks.push(chunk));
    socket.once("close", () => {
      clearTimeout(timer);
      resolve(Buffer.concat(chunks).toString("utf8").replace(/\0/g, "").trim());
    });
    socket.once("connect", () => socket.end(Buffer.from(`z${command}\0`)));
  });
}

async function scanStream(req, expectedSha256) {
  return await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: CLAMD_HOST, port: CLAMD_PORT });
    const responseChunks = [];
    const hash = crypto.createHash("sha256");
    let total = 0;
    let actualSha256 = null;
    let settled = false;

    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve(value);
    };

    const timer = setTimeout(() => {
      socket.destroy();
      req.destroy();
      finish(new Error("clamd scan timeout"));
    }, CLAMD_TIMEOUT_MS);

    socket.once("error", (error) => finish(error));
    socket.on("data", (chunk) => responseChunks.push(chunk));
    socket.once("close", () => {
      if (settled) return;
      try {
        if (!actualSha256) throw new Error("request stream ended without digest");
        if (!safeEqual(actualSha256, expectedSha256)) {
          finish(Object.assign(new Error("content hash mismatch"), { code: "CONTENT_HASH_MISMATCH" }));
          return;
        }
        const verdict = parseClamdResult(Buffer.concat(responseChunks).toString("utf8"));
        finish(null, {
          ...verdict,
          content_sha256: actualSha256,
          bytes_scanned: total,
        });
      } catch (error) {
        finish(error);
      }
    });

    req.once("error", (error) => {
      socket.destroy();
      finish(error);
    });

    socket.once("connect", () => {
      socket.write(Buffer.from("zINSTREAM\0"));
      req.on("data", (chunk) => {
        if (settled) return;
        total += chunk.length;
        if (total > MAX_SCAN_BYTES) {
          req.destroy();
          socket.destroy();
          finish(Object.assign(new Error("scan payload too large"), { code: "PAYLOAD_TOO_LARGE" }));
          return;
        }
        hash.update(chunk);
        const size = Buffer.allocUnsafe(4);
        size.writeUInt32BE(chunk.length, 0);
        socket.write(size);
        socket.write(chunk);
      });
      req.once("end", () => {
        if (settled) return;
        actualSha256 = hash.digest("hex");
        socket.write(Buffer.alloc(4));
      });
    });
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    if (!authenticate(req)) return json(res, 401, { ok: false, error: "unauthorized" });
    try {
      const [ping, version] = await Promise.all([clamdCommand("PING"), clamdCommand("VERSION")]);
      return json(res, ping === "PONG" ? 200 : 503, {
        ok: ping === "PONG",
        engine: "ClamAV",
        version: version.slice(0, 300),
      });
    } catch {
      return json(res, 503, { ok: false, error: "scanner_unavailable" });
    }
  }

  if (req.method !== "POST" || req.url !== "/scan") {
    return json(res, 404, { error: "not_found" });
  }
  if (!authenticate(req)) return json(res, 401, { error: "unauthorized" });

  const expectedSha256 = String(req.headers["x-content-sha256"] || "").toLowerCase();
  if (!SHA256_RE.test(expectedSha256)) {
    return json(res, 400, { error: "content_sha256_required" });
  }

  const declaredLength = Number(req.headers["content-length"] || 0);
  if (!Number.isFinite(declaredLength) || declaredLength < 0) {
    return json(res, 400, { error: "invalid_content_length" });
  }
  if (declaredLength > MAX_SCAN_BYTES) return json(res, 413, { error: "payload_too_large" });

  try {
    const verdict = await scanStream(req, expectedSha256);
    let version = "unknown";
    try { version = await clamdCommand("VERSION"); } catch { /* scan verdict remains authoritative */ }
    return json(res, 200, {
      scanner: "clamav",
      engine_version: version.slice(0, 300),
      status: verdict.status,
      detection_name: verdict.detection_name,
      content_sha256: verdict.content_sha256,
      bytes_scanned: verdict.bytes_scanned,
    });
  } catch (error) {
    if (error?.code === "PAYLOAD_TOO_LARGE") return json(res, 413, { error: "payload_too_large" });
    if (error?.code === "CONTENT_HASH_MISMATCH") return json(res, 409, { error: "content_hash_mismatch" });
    return json(res, 503, { error: "scanner_unavailable" });
  }
});

server.listen(HTTP_PORT, "0.0.0.0", () => {
  console.log(`[clamav-gateway] listening on ${HTTP_PORT}; clamd=${CLAMD_HOST}:${CLAMD_PORT}`);
});
