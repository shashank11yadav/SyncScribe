/** Only same-site relative paths, so the sign-in flow cannot become an open redirect. */
export function safeRedirectPath(value: string | string[] | undefined, fallback = "/documents"): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  return raw;
}
