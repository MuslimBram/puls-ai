async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function requireLeahWorker(req: Request): Promise<void> {
  const configured = Deno.env.get("LEAH_WORKER_SECRET")?.trim() ?? "";
  const supplied = req.headers.get("X-Leah-Worker-Secret")?.trim() ?? "";
  if (configured.length < 32 || supplied.length < 32) throw new Error("Worker authentication failed");
  const [expected, actual] = await Promise.all([sha256(configured), sha256(supplied)]);
  if (!constantTimeEqual(expected, actual)) throw new Error("Worker authentication failed");
}
