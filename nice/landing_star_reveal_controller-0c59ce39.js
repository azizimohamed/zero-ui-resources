import { Controller } from "@hotwired/stimulus";

// Fade/slide STAR sections into view on scroll (no GSAP — Hotwire stack).
// Arm after classifying in-view items so above-the-fold content never stays at opacity 0.
export default class extends Controller {
  static targets = ["item"];

  connect() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      this.revealAll();
      return;
    }

    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          this.reveal(entry.target);
          this.observer.unobserve(entry.target);
        });
      },
      // threshold 0: any visible pixel counts (tall article blocks used to fail at 0.12).
      // No negative rootMargin: bottom-of-viewport content must not wait on a 1px scroll.
      { root: null, rootMargin: "0px", threshold: 0 },
    );

    // Read all geometry first, then write classes (avoids forced reflow).
    const visible = this.itemTargets.map((el) => this.inViewport(el));
    this.itemTargets.forEach((el, i) => {
      if (visible[i]) this.reveal(el);
      else this.observer.observe(el);
    });

    this.element.classList.add("is-armed");
  }

  disconnect() {
    this.observer?.disconnect();
    this.element.classList.remove("is-armed");
  }

  revealAll() {
    this.itemTargets.forEach((el) => this.reveal(el));
  }

  reveal(el) {
    el.classList.add("is-visible");
  }

  inViewport(el) {
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const vw = window.innerWidth || document.documentElement.clientWidth;
    return rect.bottom > 0 && rect.right > 0 && rect.top < vh && rect.left < vw;
  }
}
