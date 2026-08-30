// Single authority for "an overlay is open, so the page behind it must not scroll".
// Ref counted.
//
// Desk/admin: html is overflow:hidden; #turbo-main-pane (or an inner feed) is
// the scrollport. Pin that node. Do not position:fixed the body and do not
// mutate scrollbar-gutter: that combination jumped the chrome left.
//
// Marketing / onboarding: html is the scrollport (scrollbar-gutter: stable).
// Pin the document with body { position:fixed } and keep the reserved gutter
// via --scroll-lock-gutter on body padding. Never set gutter to auto.

const LOCK_CLASS = "is-scroll-locked";
const GUTTER_PROPERTY = "--scroll-lock-gutter";
const BODY_PROPS = ["position", "top", "left", "right", "width"];
const INNER_SCROLLPORT_SELECTORS = [".alerts-body", ".wiz-body"];

const holders = new Set();
let snapshot = null;

function paneElement() {
  return document.getElementById("turbo-main-pane");
}

function paneUsesInnerScrollport(pane) {
  return (
    pane?.classList.contains("turbo-main-pane--inbox") ||
    pane?.classList.contains("turbo-main-pane--profile-form") ||
    pane?.classList.contains("monitor-main-pane")
  );
}

function innerScrollport(pane) {
  if (!pane) return null;

  if (pane.classList.contains("turbo-main-pane--inbox")) {
    const feed = pane.querySelector("#matches_feed_scroll, #monitors_feed_scroll");
    if (feed) return feed;
  }

  if (pane.classList.contains("monitor-main-pane")) {
    return pane.querySelector(".mh-mp__scroll");
  }

  for (const selector of INNER_SCROLLPORT_SELECTORS) {
    const el = pane.querySelector(selector);
    if (el) return el;
  }

  return null;
}

function measureDocumentGutter() {
  return Math.max(window.innerWidth - document.documentElement.clientWidth, 0);
}

function pinScrollTop(element) {
  const pinnedY = element.scrollTop;
  const onScroll = () => {
    if (element.scrollTop !== pinnedY) element.scrollTop = pinnedY;
  };
  element.addEventListener("scroll", onScroll, { passive: true });
  return { element, onScroll };
}

function engage() {
  const html = document.documentElement;
  const { body } = document;
  const pane = paneElement();
  const usesInner = paneUsesInnerScrollport(pane);
  const inner = usesInner ? innerScrollport(pane) : null;
  const pinDocument = !pane;
  const scrollY = window.scrollY;
  const scrollBehavior = html.style.scrollBehavior;

  const scrollPins = [];
  if (inner) scrollPins.push(pinScrollTop(inner));
  else if (pane) scrollPins.push(pinScrollTop(pane));

  snapshot = {
    scrollY,
    scrollBehavior,
    pinDocument,
    body: pinDocument
      ? Object.fromEntries(BODY_PROPS.map((prop) => [prop, body.style[prop]]))
      : null,
    scrollPins,
  };

  html.style.scrollBehavior = "auto";

  if (pinDocument) {
    html.style.setProperty(GUTTER_PROPERTY, `${measureDocumentGutter()}px`);
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
  }

  html.classList.add(LOCK_CLASS);
}

function release() {
  if (!snapshot) return;
  const html = document.documentElement;
  const { body } = document;
  const { scrollY, scrollBehavior, pinDocument, body: bodyStyles, scrollPins } = snapshot;

  scrollPins.forEach(({ element, onScroll }) => {
    element.removeEventListener("scroll", onScroll);
  });

  html.classList.remove(LOCK_CLASS);

  if (pinDocument) {
    BODY_PROPS.forEach((prop) => {
      body.style[prop] = bodyStyles[prop];
    });
    html.style.removeProperty(GUTTER_PROPERTY);
    html.style.scrollBehavior = "auto";
    window.scrollTo(0, scrollY);
  }

  html.style.scrollBehavior = scrollBehavior;
  snapshot = null;
}

export function lockScroll(holder) {
  if (!holder || holders.has(holder)) return;
  holders.add(holder);
  if (holders.size === 1) engage();
}

export function unlockScroll(holder) {
  if (!holders.delete(holder)) return;
  if (holders.size === 0) release();
}

export function scrollLocked() {
  return holders.size > 0;
}
