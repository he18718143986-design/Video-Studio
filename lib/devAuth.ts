export function normalizeHostname(rawHost: string): string {
  const trimmed = rawHost.trim().toLowerCase();
  if (!trimmed) return '';

  const bracketedIpv6Match = trimmed.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketedIpv6Match) {
    return bracketedIpv6Match[1] ?? '';
  }

  const maybeHostAndPort = trimmed.split(':');
  if (maybeHostAndPort.length === 2 && /^\d+$/.test(maybeHostAndPort[1] ?? '')) {
    return maybeHostAndPort[0] ?? '';
  }

  return trimmed;
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return false;
  }

  const firstOctet = parts[0];
  const secondOctet = parts[1];
  if (firstOctet === undefined || secondOctet === undefined) return false;

  if (firstOctet === 10) return true;
  if (firstOctet === 192 && secondOctet === 168) return true;
  if (firstOctet === 172 && secondOctet >= 16 && secondOctet <= 31) return true;
  return false;
}

export function isLocalOrPrivateHost(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  if (!normalized) return false;

  if (normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1') {
    return true;
  }

  return isPrivateIpv4(normalized);
}

export function isDevDirectRegisterAllowed(hostHeader: string | null | undefined): boolean {
  if (process.env.NODE_ENV === 'production') return false;

  const flag = process.env.DEV_AUTH_BYPASS?.trim();
  if (flag === '0') return false;
  if (flag === '1') return true;

  if (!hostHeader) return false;
  return isLocalOrPrivateHost(hostHeader);
}
