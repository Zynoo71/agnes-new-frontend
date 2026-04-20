/**
 * Sanitize user/server-provided strings for use as an external link href.
 * Only http / https are allowed; blocks javascript:, data:, etc.
 */
export function safeExternalHref(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    const u = new URL(t);
    if (u.protocol === "https:" || u.protocol === "http:") {
      return u.href;
    }
  } catch {
    return null;
  }
  return null;
}
