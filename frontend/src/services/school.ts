// Each school reaches the app at <slug>.<platform domain>; locally <slug>.localhost:5173.
// ponytail: subdomain-only. For path-based URLs (domain/<slug>) change just this function.
export function schoolSlugFromHost(host: string = window.location.hostname): string | null {
  const parts = host.toLowerCase().split('.');
  if (/^\d+$/.test(parts[parts.length - 1])) return null; // raw IP address
  const minParts = parts[parts.length - 1] === 'localhost' ? 2 : 3;
  return parts.length >= minParts ? parts[0] : null;
}
