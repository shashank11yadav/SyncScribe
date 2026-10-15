/**
 * Builds the Content-Security-Policy for a page response. Scripts need the
 * per-request nonce; the only other origin the browser may talk to is the
 * sync server.
 */
export function buildCsp(options: { nonce: string; syncUrl: string | undefined; dev: boolean }): string {
  const { nonce, syncUrl, dev } = options;
  let syncOrigin = "";
  if (syncUrl) {
    try {
      const url = new URL(syncUrl);
      syncOrigin = `${url.protocol}//${url.host}`;
    } catch {
      syncOrigin = "";
    }
  }

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])],
    // The dev server injects styles without a nonce, so only development relaxes this.
    "style-src": dev ? ["'self'", "'unsafe-inline'"] : ["'self'", `'nonce-${nonce}'`],
    // Collaboration carets colour themselves through style attributes.
    "style-src-attr": ["'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https://avatars.githubusercontent.com"],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...(syncOrigin ? [syncOrigin] : [])],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    // Sign-in posts to Auth.js, which redirects to GitHub; form-action covers that redirect.
    "form-action": ["'self'", "https://github.com"],
    "frame-ancestors": ["'none'"],
    "manifest-src": ["'self'"],
    "worker-src": ["'self'", "blob:"],
  };

  const parts = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`);
  if (!dev) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}
