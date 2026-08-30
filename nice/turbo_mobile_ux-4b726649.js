// Mobile-focused Turbo Drive tuning: faster progress feedback, touch prefetch for sidebar nav,
// main-pane loading snapshot hygiene (turbo:before-cache), subtle post-render motion.

import { mobileDriveSurface, onMobileShellSignalsChange } from "mobile_shell";

function applyDriveDelay() {
  const turbo = window.Turbo;
  if (!turbo?.config?.drive) return;
  turbo.config.drive.progressBarDelay = mobileDriveSurface() ? 90 : 480;
}

applyDriveDelay();
onMobileShellSignalsChange(applyDriveDelay);

const MAIN_PANE_ID = "turbo-main-pane";
const BUSY_CLASS = "turbo-main-pane--busy";
const ANIM_CLASS = "turbo-main-pane--anim";
const FEED_SCROLL_IDS = ["matches_feed_scroll", "monitors_feed_scroll"];

function mainPane() {
  return document.getElementById(MAIN_PANE_ID);
}

// Turbo Drive only resets window scroll — not #turbo-main-pane (overflow container)
// or inbox feed scrollports. Without this, a scrolled page leaves the next visit
// painted mid-pane so headers/tabs look shifted down.
function resetMainScrollports() {
  const pane = mainPane();
  if (pane) pane.scrollTop = 0;
  FEED_SCROLL_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.scrollTop = 0;
  });
}

document.addEventListener("turbo:before-cache", () => {
  mainPane()?.classList.remove(BUSY_CLASS, ANIM_CLASS);
});

// Only mark busy once Turbo commits to the visit. turbo:before-visit also fires
// when wizard-leave (or other guards) cancel navigation; leaving busy on the pane
// then hides the wizard behind the shimmer with no modal.
document.addEventListener("turbo:visit", () => {
  if (!mobileDriveSurface()) return;
  mainPane()?.classList.add(BUSY_CLASS);
});

export function clearMainPaneBusy() {
  mainPane()?.classList.remove(BUSY_CLASS);
}

export function clearTurboBusyState() {
  clearMainPaneBusy();
  document.documentElement.removeAttribute("aria-busy");
}

document.addEventListener("turbo:render", () => {
  const pane = mainPane();
  if (!pane) return;
  pane.classList.remove(BUSY_CLASS);
  resetMainScrollports();
  if (!mobileDriveSurface()) return;
  pane.classList.remove(ANIM_CLASS);
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      pane.classList.add(ANIM_CLASS);
    });
  });
});

document.addEventListener("turbo:load", () => {
  resetMainScrollports();
});

const prefetchRecent = new Map();
const PREFETCH_COOLDOWN_MS = 4000;

document.addEventListener(
  "touchstart",
  (event) => {
    if (!mobileDriveSurface()) return;
    const anchor = event.target.closest?.("a[href]");
    if (
      !anchor ||
      anchor.getAttribute("data-turbo") === "false" ||
      anchor.getAttribute("target") === "_blank" ||
      anchor.hasAttribute("download")
    ) {
      return;
    }
    if (!anchor.closest("aside#app-sidebar nav, aside#admin-sidebar nav")) return;

    let url;
    try {
      url = new URL(anchor.href, window.location.href);
    } catch {
      return;
    }
    if (url.origin !== window.location.origin) return;

    const key = url.pathname + url.search;
    const now = Date.now();
    const last = prefetchRecent.get(key);
    if (last && now - last < PREFETCH_COOLDOWN_MS) return;
    prefetchRecent.set(key, now);
    if (prefetchRecent.size > 64) prefetchRecent.clear();

    if (document.querySelector(`link[rel="prefetch"][href="${anchor.href}"]`)) return;

    const link = document.createElement("link");
    link.rel = "prefetch";
    link.href = anchor.href;
    document.head.appendChild(link);
  },
  { capture: true, passive: true },
);
