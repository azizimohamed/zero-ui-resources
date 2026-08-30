// Reliably pin a chat transcript scroller to the latest message.
// Avoid scrollIntoView (fights padding/ancestors and often stops a few px short).

const recentPins = new WeakMap();

export function scrollChatToEnd(el, { pinImages = true } = {}) {
  if (!el) return;

  const pin = () => {
    // Overshoot; the engine clamps to the true max and absorbs subpixel/padding lag.
    el.scrollTop = el.scrollHeight + 1000;
  };

  pin();
  requestAnimationFrame(() => {
    pin();
    requestAnimationFrame(pin);
  });

  if (!pinImages) return;

  const now = Date.now();
  const last = recentPins.get(el) || 0;
  if (now - last < 120) return;
  recentPins.set(el, now);

  el.querySelectorAll("img").forEach((img) => {
    if (img.complete) return;
    img.addEventListener("load", pin, { once: true });
    img.addEventListener("error", pin, { once: true });
  });
}

export function armChatScrollPin(el, { ms = 600, onPin = scrollChatToEnd } = {}) {
  if (!el) return () => {};

  onPin(el);
  const observer = new ResizeObserver(() => onPin(el, { pinImages: false }));
  observer.observe(el);
  const timer = window.setTimeout(() => observer.disconnect(), ms);
  return () => {
    window.clearTimeout(timer);
    observer.disconnect();
  };
}
