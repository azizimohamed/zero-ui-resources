// Reconcile auth-dependent header CTAs against the client-visible `cb_member`
// cookie and the server-rendered `data-auth-member` hint on <body>. The marketing
// header is server-rendered and Turbo/Cloudflare cache the anonymous snapshot,
// so after login/logout a restored snapshot shows stale buttons until reconciled.
// Never downgrade a fresh authenticated HTML snapshot just because `cb_member` is
// missing (common in PWA standalone when the httponly session cookie outlives the
// client-readable marker after a cold start). Do not trust the body hint on Turbo
// or bfcache restores — those snapshots can keep a stale member marker after logout.
function isMember(root = document, { trustBodyHint = true } = {}) {
  if (/(?:^|;\s*)cb_member=1(?:;|$)/.test(document.cookie)) return true;
  if (!trustBodyHint) return false;

  const body = root.body || root.querySelector?.("body");
  return body?.dataset?.authMember === "true";
}

// Toggle CTA variants inside `root` to match auth state. `root` is the incoming
// <body> during a Turbo render, or the live document on first load / bfcache.
function syncAuthChrome(root = document, options = {}) {
  const member = isMember(root, options);
  root.querySelectorAll("[data-auth-cta]").forEach((el) => {
    const forMember = el.dataset.authCta === "member";
    el.hidden = forMember !== member;
  });
  if (!member) return;

  root.querySelectorAll("[data-member-href]").forEach((el) => {
    const href = el.dataset.memberHref;
    if (href) el.setAttribute("href", href);
  });
}

// Reconcile the incoming snapshot BEFORE Turbo paints it. Doing this on
// turbo:load instead flips the CTAs a frame after the cached (stale) snapshot
// has already painted — the visible flicker on back/forward and restore visits.
document.addEventListener("turbo:before-render", (event) => {
  syncAuthChrome(event.detail.newBody);
});

// Drop the server hint before Turbo snapshots the page so back/forward restores
// cannot resurrect a logged-out member chrome from a stale body attribute.
document.addEventListener("turbo:before-cache", () => {
  document.body?.removeAttribute("data-auth-member");
});

// Safari bfcache restores a painted snapshot without firing turbo:before-render.
// Cookie-only reconcile — the cached body may still carry data-auth-member="true".
window.addEventListener("pageshow", (event) => {
  if (event.persisted) syncAuthChrome(document, { trustBodyHint: false });
});

// First load: server HTML already matches auth state, but reconcile once in case
// the initial paint came from an edge/browser-cached snapshot.
syncAuthChrome();
