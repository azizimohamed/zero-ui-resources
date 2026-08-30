import { Controller } from "@hotwired/stimulus";

// Features command-center mock: reveal on scroll, then arm the living CSS loop.
// Loops pause when the stage leaves the viewport. Reduced motion shows a static frame.
export default class extends Controller {
  static targets = ["demo"];

  connect() {
    if (!this.hasDemoTarget) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      this.element.classList.add("is-armed", "is-live");
      this.demoTarget.classList.add("is-visible", "is-live");
      return;
    }

    // Arm after connect so no-JS / pre-connect paint stays visible (star-reveal pattern).
    this.element.classList.add("is-armed");

    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            if (this.revealed) {
              this.resume();
            } else {
              this.reveal();
            }
          } else if (this.revealed) {
            this.pause();
          }
        });
      },
      { root: null, rootMargin: "0px 0px -8% 0px", threshold: 0.18 },
    );

    this.observer.observe(this.element);
  }

  disconnect() {
    this.clearLiveTimer();
    this.observer?.disconnect();
  }

  reveal() {
    this.revealed = true;
    this.demoTarget.classList.add("is-visible");
    this.element.classList.add("is-live");
    // Start looping life after the stagger settle (~700ms).
    this.clearLiveTimer();
    this.liveTimer = window.setTimeout(() => {
      this.demoTarget.classList.add("is-live");
      this.liveTimer = null;
    }, 720);
  }

  resume() {
    this.element.classList.add("is-live");
    this.demoTarget.classList.add("is-live");
  }

  pause() {
    this.clearLiveTimer();
    this.element.classList.remove("is-live");
    this.demoTarget.classList.remove("is-live");
  }

  clearLiveTimer() {
    if (this.liveTimer == null) return;
    window.clearTimeout(this.liveTimer);
    this.liveTimer = null;
  }
}
