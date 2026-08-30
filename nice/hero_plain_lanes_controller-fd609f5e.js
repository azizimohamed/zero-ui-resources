import { Controller } from "@hotwired/stimulus";

// Rotate plain-hero phone stacks through lane examples; pills jump + restart timer.
export default class extends Controller {
  static targets = ["panel", "pill"];
  static values = { hold: Number, fade: Number };

  connect() {
    this.index = 0;
    this.inView = true;
    this.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.onVisibility = () => {
      if (document.visibilityState === "hidden") this.pause();
      else if (this.inView) this.resume();
    };
    document.addEventListener("visibilitychange", this.onVisibility);

    if (!this.reduced && "IntersectionObserver" in window) {
      this.observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (!entry) return;
          this.inView = entry.isIntersecting;
          if (this.inView) this.resume();
          else this.pause();
        },
        { root: null, rootMargin: "0px 0px -8% 0px", threshold: 0.18 },
      );
      this.observer.observe(this.element);
    }

    if (!this.reduced) this.schedule();
  }

  disconnect() {
    this.clear();
    this.observer?.disconnect();
    document.removeEventListener("visibilitychange", this.onVisibility);
  }

  select(event) {
    this.clear();
    this.show(Number(event.currentTarget.dataset.index));
    if (!this.reduced && this.inView && document.visibilityState !== "hidden") {
      this.schedule();
    }
  }

  schedule() {
    if (this.reduced || !this.inView || document.visibilityState === "hidden") return;
    this.clear();
    this.outTimer = setTimeout(() => {
      this.current.classList.add("is-out");
      this.inTimer = setTimeout(() => {
        this.show((this.index + 1) % this.panelTargets.length);
        this.schedule();
      }, this.fadeValue);
    }, this.holdValue);
  }

  pause() {
    this.clear();
    this.current?.classList.remove("is-out");
  }

  resume() {
    if (this.reduced || !this.inView || document.visibilityState === "hidden") return;
    this.schedule();
  }

  show(next) {
    this.current.hidden = true;
    this.current.classList.remove("is-out");
    this.index = next;
    this.current.hidden = false;
    // Restart drop-in keyframes on the newly visible stack
    void this.current.offsetWidth;
    this.pillTargets.forEach((p) => {
      const on = Number(p.dataset.index) === next;
      p.dataset.on = on ? "1" : "0";
      p.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  get current() {
    return this.panelTargets[this.index];
  }

  clear() {
    clearTimeout(this.outTimer);
    clearTimeout(this.inTimer);
    this.outTimer = null;
    this.inTimer = null;
  }
}
