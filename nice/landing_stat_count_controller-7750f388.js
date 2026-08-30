import { Controller } from "@hotwired/stimulus";

// Ease-out count-up for hero trust stats (countries, etc.).
export default class extends Controller {
  static targets = ["value"];
  static values = {
    to: Number,
    start: { type: Number, default: 0 },
    duration: { type: Number, default: 1400 },
  };

  connect() {
    this.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.done = false;

    if (this.reduced || !this.hasValueTarget) {
      this.finish();
      return;
    }

    // Geometry before textContent writes (avoids forced reflow).
    const visible = !("IntersectionObserver" in window) || this.inViewport();
    this.valueTarget.textContent = String(this.startValue);

    if (visible) {
      this.play();
      return;
    }

    this.observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        this.observer?.disconnect();
        this.play();
      },
      { root: null, rootMargin: "0px 0px -8% 0px", threshold: 0.4 },
    );
    this.observer.observe(this.element);
  }

  disconnect() {
    this.observer?.disconnect();
    if (this.raf) cancelAnimationFrame(this.raf);
  }

  play() {
    if (this.done) return;
    this.done = true;

    const from = this.startValue;
    const to = this.toValue;
    const duration = Math.max(200, this.durationValue);
    const start = performance.now();

    this.element.classList.add("is-counting");

    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutExpo — fast early ticks, settles cleanly on the final digit
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      const n = Math.round(from + (to - from) * eased);
      this.valueTarget.textContent = String(n);

      if (t < 1) {
        this.raf = requestAnimationFrame(tick);
      } else {
        this.finish();
      }
    };

    this.raf = requestAnimationFrame(tick);
  }

  finish() {
    if (this.hasValueTarget) this.valueTarget.textContent = String(this.toValue);
    this.element.classList.remove("is-counting");
    this.element.classList.add("is-counted");
  }

  inViewport() {
    const rect = this.element.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    return rect.top < vh * 0.92 && rect.bottom > 0;
  }
}
