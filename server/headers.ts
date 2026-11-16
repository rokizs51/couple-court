/** Security headers applied to every response (static assets and API) by the Worker. */
export const SECURITY_HEADERS: Record<string, string> = {
  // The app is same-origin: bundled scripts/fonts, API under /api, QR images as data:, share cards as blob:.
  "content-security-policy": [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'", // React inline style props
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    "upgrade-insecure-requests",
  ].join("; "),
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "permissions-policy": "geolocation=(), camera=(), microphone=()",
  "cross-origin-opener-policy": "same-origin",
};

/** Returns a copy of the response with the security headers added. */
export function withSecurityHeaders(res: Response): Response {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) out.headers.set(k, v);
  return out;
}
