import { Controller } from "@hotwired/stimulus";

const ROOT_MARGIN = "-45% 0px -50% 0px";

// Product-hub rail pinned under the site header (same stack as category `.vp-bread`).
// Mark the surface in the middle of the viewport. Hash jumps use window.scrollTo so
// the section's top edge (the divider) sits flush with the rail's bottom edge.
export default class extends Controller {
  static targets = ["link", "section"];

  connect() {
    this.onClick = (event) => this.jumpFromClick(event);
    this.onHash = () => this.scrollHash();
    this.element.addEventListener("click", this.onClick);
    window.addEventListener("hashchange", this.onHash);
    if (location.hash) {
      requestAnimationFrame(() => this.scrollHash({ instant: true }));
    }

    if (!("IntersectionObserver" in window) || !this.hasLinkTarget) return;

    this.map = new Map(
      this.linkTargets.map((anchor) => [anchor.getAttribute("href")?.replace(/^#/, ""), anchor]),
    );

    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          this.linkTargets.forEach((anchor) => anchor.classList.remove("is-current"));
          this.map.get(entry.target.id)?.classList.add("is-current");
        });
      },
      { rootMargin: ROOT_MARGIN },
    );

    this.sectionTargets.forEach((section) => this.observer.observe(section));
  }

  disconnect() {
    this.element.removeEventListener("click", this.onClick);
    window.removeEventListener("hashchange", this.onHash);
    this.observer?.disconnect();
  }

  jumpFromClick(event) {
    const anchor = event.target.closest("a[href^='#']");
    if (!anchor || !this.element.contains(anchor)) return;
    const el = this.elementByHash(anchor.getAttribute("href"));
    if (!el) return;

    event.preventDefault();
    const hash = `#${el.id}`;
    if (location.hash !== hash) {
      history.pushState(null, "", hash);
    }
    this.scrollTo(el);
  }

  scrollHash({ instant = false } = {}) {
    const el = this.elementByHash(location.hash);
    if (el) this.scrollTo(el, { instant });
  }

  elementByHash(href) {
    const id = href?.replace(/^#/, "");
    return id ? document.getElementById(id) : null;
  }

  scrollTo(el, { instant = false } = {}) {
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const rail = document.querySelector(".ph-rail");
    const header = document.querySelector(".lp-site-hdr");
    const chrome =
      rail?.getBoundingClientRect().bottom ?? header?.getBoundingClientRect().bottom ?? 99;
    const top = el.getBoundingClientRect().top + window.scrollY - chrome;
    window.scrollTo({
      top: Math.max(0, top),
      behavior: instant || reduceMotion ? "auto" : "smooth",
    });
  }
}
