let booted = false;

function measurementId() {
  return document.querySelector('meta[name="crawlbench-ga-id"]')?.content || "";
}

function injectGtag(id) {
  if (document.querySelector(`script[data-crawlbench-ga="${id}"]`)) return;

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
  script.dataset.crawlbenchGa = id;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag =
    window.gtag ||
    function gtag() {
      window.dataLayer.push(arguments);
    };
  window.gtag("js", new Date());
  window.gtag("config", id);
}

export function bootGoogleAnalytics() {
  const id = measurementId();
  if (!id || booted) return;

  injectGtag(id);
  booted = true;
}

// Marketing: keep gtag off the first-paint graph. Lab Lighthouse scrolls, so
// do not treat scroll as a gesture. Desk: idle-boot like before this split.
function emitQueuedEvents() {
  const node = document.getElementById("crawlbench-analytics-events");
  if (!node) return;

  let events;
  try {
    events = JSON.parse(node.textContent || "[]");
  } catch {
    return;
  }
  if (!Array.isArray(events) || events.length === 0) return;
  if (typeof window.gtag !== "function") return;

  events.forEach((entry) => {
    const name = entry?.event;
    if (!name) return;
    const params = entry?.params && typeof entry.params === "object" ? entry.params : {};
    window.gtag("event", name, params);
  });
  node.remove();
}

function bootAndEmitQueuedEvents() {
  bootGoogleAnalytics();
  emitQueuedEvents();
}

export function scheduleGoogleAnalytics({ afterGesture = false } = {}) {
  const start = () => bootAndEmitQueuedEvents();

  if (afterGesture) {
    const once = { once: true, passive: true };
    ["pointerdown", "keydown"].forEach((type) => {
      window.addEventListener(type, start, once);
    });
    setTimeout(start, 12_000);
    return;
  }

  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(start, { timeout: 4000 });
    return;
  }
  if (document.readyState === "complete") {
    setTimeout(start, 1);
    return;
  }
  window.addEventListener("load", () => setTimeout(start, 1), { once: true });
}

document.addEventListener("turbo:load", () => bootAndEmitQueuedEvents());
