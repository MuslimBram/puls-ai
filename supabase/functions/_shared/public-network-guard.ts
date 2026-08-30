function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b, c] = parts;

  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0 && c === 0)
    || (a === 192 && b === 0 && c === 2)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113)
    || a >= 224;
}

function isBlockedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mappedIpv4) return isBlockedIpv4(mappedIpv4);

  return normalized === "::"
    || normalized === "::1"
    || normalized.startsWith("fc")
    || normalized.startsWith("fd")
    || /^fe[89ab]/.test(normalized)
    || normalized.startsWith("ff")
    || normalized.startsWith("2001:db8:");
}

export function isPublicNetworkAddress(address: string): boolean {
  return address.includes(":") ? !isBlockedIpv6(address) : !isBlockedIpv4(address);
}

export function validatePublicHostnameSyntax(host: string): string {
  const normalized = host.trim().toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(normalized)
    || normalized.length > 253
    || normalized === "localhost"
    || normalized.endsWith(".localhost")
    || normalized.endsWith(".local")
    || !normalized.includes(".")) {
    throw new Error("Host must be a public DNS hostname");
  }
  return normalized;
}

export async function resolvePublicAddresses(host: string): Promise<string[]> {
  const normalized = validatePublicHostnameSyntax(host);
  const lookups = await Promise.allSettled([
    Deno.resolveDns(normalized, "A"),
    Deno.resolveDns(normalized, "AAAA"),
  ]);
  const addresses = [...new Set(
    lookups.flatMap((result) => result.status === "fulfilled" ? result.value : []),
  )];

  if (addresses.length === 0) throw new Error("Host could not be resolved");
  if (addresses.some((address) => !isPublicNetworkAddress(address))) {
    throw new Error("Host resolves to a private or reserved network");
  }
  return addresses;
}

/**
 * Pins the TCP connection to an already validated public IP, then upgrades the
 * same socket to TLS using the original hostname for certificate/SNI checks.
 * This avoids a second DNS lookup between validation and credential exchange.
 */
export async function connectTlsToPublicHostname(host: string, port: number): Promise<Deno.TlsConn> {
  const normalized = validatePublicHostnameSyntax(host);
  const addresses = await resolvePublicAddresses(normalized);
  let lastError: unknown = null;

  for (const address of addresses) {
    let tcp: Deno.TcpConn | null = null;
    try {
      tcp = await Deno.connect({ hostname: address, port });
      const remoteAddress = tcp.remoteAddr.hostname;
      if (!isPublicNetworkAddress(remoteAddress)) {
        tcp.close();
        throw new Error("Connected peer is not a public network address");
      }
      return await Deno.startTls(tcp, { hostname: normalized, alpnProtocols: [] });
    } catch (error) {
      lastError = error;
      try { tcp?.close(); } catch { /* noop */ }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Unable to establish secure public connection");
}
