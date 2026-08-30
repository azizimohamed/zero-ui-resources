// First-party cookie consent preference (essential). Written only after a
// user choice so anonymous marketing GETs never get a consent Set-Cookie
// on first paint (MarketingEdgeCache / Cloudflare HTML cache).
//
// The banner toggle is UI-only for now. Analytics (GA + first-party) stays
// enabled in the background regardless of the stored preference bit.

export const COOKIE_NAME = "crawlbench_consent";
export const VERSION = 1;
export const MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
export const CHANGED_EVENT = "cookie-consent:changed";

/**
 * @returns {{ version: number, analytics: boolean } | null}
 */
export function readConsent() {
  const raw = readRawCookie(COOKIE_NAME);
  if (!raw) return null;
  return parseConsentValue(raw);
}

/** Stored toggle state for the preferences UI. Defaults on before any choice. */
export function analyticsPreference() {
  const consent = readConsent();
  if (!consent) return true;
  return Boolean(consent.analytics);
}

/**
 * @param {{ analytics: boolean }} prefs
 */
export function writeConsent({ analytics }) {
  const value = serializeConsentValue({
    version: VERSION,
    analytics: Boolean(analytics),
  });
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${MAX_AGE_SECONDS}`,
    "SameSite=Lax",
    secure,
  ]
    .filter(Boolean)
    .join("; ");

  window.dispatchEvent(
    new CustomEvent(CHANGED_EVENT, {
      detail: { analytics: Boolean(analytics) },
    }),
  );
}

function parseConsentValue(raw) {
  const value = decodeURIComponent(String(raw));
  const match = /^v(\d+)\.a([01])$/.exec(value);
  if (!match) return null;
  return { version: Number(match[1]), analytics: match[2] === "1" };
}

function serializeConsentValue({ version, analytics }) {
  return `v${version}.a${analytics ? 1 : 0}`;
}

function readRawCookie(name) {
  const prefix = `${name}=`;
  const parts = document.cookie.split("; ");
  for (const part of parts) {
    if (part.startsWith(prefix)) return part.slice(prefix.length);
  }
  return null;
}
