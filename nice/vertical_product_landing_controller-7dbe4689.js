import { Controller } from "@hotwired/stimulus";

// Vertical product landings (`products/vehicles`, `products/real-estate`): section spy + same-page jumps.
// scrollIntoView + scroll-margin — window.scrollTo does not hit this page’s effective scroll container.
const SECTION_SPY_ROOT_MARGIN = "-30% 0px -60% 0px";

function jumpTargetIdFromHref(href) {
  if (!href?.startsWith("#")) return "";
  return href.slice(1);
}

/** Decorative coverage panel: toggle `vp-coverage-feed--inview` for CSS play-state only. */
function connectCoverageFeedObserver(rootEl) {
  const coverageFeed = rootEl.querySelector("[data-vp-coverage-feed]");
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (!coverageFeed || reduceMotion) {
    coverageFeed?.classList.add("vp-coverage-feed--inview");
    return null;
  }
  if (!("IntersectionObserver" in window)) {
    coverageFeed.classList.add("vp-coverage-feed--inview");
    return null;
  }
  try {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) =>
          coverageFeed.classList.toggle("vp-coverage-feed--inview", e.isIntersecting),
        );
      },
      { threshold: 0.08, rootMargin: "60px 0px" },
    );
    observer.observe(coverageFeed);
    return observer;
  } catch {
    coverageFeed.classList.add("vp-coverage-feed--inview");
    return null;
  }
}

export default class extends Controller {
  connect() {
    this.coverageFeedObserver = connectCoverageFeedObserver(this.element);

    this.jumpLinks = [...this.element.querySelectorAll(`a.vp-jump-pill[href^="#"]`)];
    this.sectionIds = [
      ...new Set(this.jumpLinks.map((a) => jumpTargetIdFromHref(a.getAttribute("href")))),
    ].filter(Boolean);

    const onIntersect = (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) this.setActive(e.target.id);
      });
    };

    this.observer = null;
    try {
      this.observer = new IntersectionObserver(onIntersect, {
        rootMargin: SECTION_SPY_ROOT_MARGIN,
        threshold: 0,
      });
      this.sectionIds.forEach((id) => {
        const el = document.getElementById(id);
        if (el) this.observer.observe(el);
      });
    } catch {
      this.observer = null;
    }
  }

  disconnect() {
    this.coverageFeedObserver?.disconnect();
    this.observer?.disconnect();
  }

  jumpTo(event) {
    event.preventDefault();
    const id = jumpTargetIdFromHref(event.currentTarget?.getAttribute?.("href"));
    if (!id) return;
    const el = document.getElementById(id);
    if (!el) return;

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    el.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
      inline: "nearest",
    });
  }

  setActive(activeId) {
    this.jumpLinks.forEach((a) => {
      const id = jumpTargetIdFromHref(a.getAttribute("href") || "");
      a.classList.toggle("cur", id === activeId);
    });
  }
}
