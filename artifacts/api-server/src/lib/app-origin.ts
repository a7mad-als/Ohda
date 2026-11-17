/**
 * Public origin of the deployed app, used for payment return URLs.
 * Order: APP_ORIGIN (explicit) → Vercel production/preview domain → Replit domains.
 */
export function getAppOrigin(): string | null {
  const explicit = process.env.APP_ORIGIN?.trim();
  const vercel =
    process.env.VERCEL_ENV === "production"
      ? process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
      : process.env.VERCEL_URL?.trim();
  const replit =
    process.env.NODE_ENV === "production"
      ? process.env.REPLIT_DOMAINS?.split(",")[0]?.trim() || process.env.REPLIT_DEV_DOMAIN?.trim()
      : process.env.REPLIT_DEV_DOMAIN?.trim() || process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  const candidate = explicit || vercel || replit;
  if (!candidate) return null;
  try {
    return new URL(candidate.startsWith("http") ? candidate : `https://${candidate}`).origin;
  } catch {
    return null;
  }
}
