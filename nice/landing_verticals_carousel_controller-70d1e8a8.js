import { Controller } from "@hotwired/stimulus";

const AUTOPLAY_MS = 5000;

// Horizontal scroll-snap carousel for landing vertical cards (touch + prev/next + autoplay).
export default class extends Controller {
  static targets = ["track", "prev", "next"];

  connect() {
    this.boundOnScroll = this.updateControls.bind(this);
    this.boundOnKeydown = this.handleKeydown.bind(this);
    this.boundPauseAutoplay = this.pauseAutoplay.bind(this);
    this.boundResumeAutoplay = this.scheduleAutoplay.bind(this);
    this.boundOnFocusOut = this.handleFocusOut.bind(this);
    this.boundOnVisibilityChange = this.handleVisibilityChange.bind(this);

    this.trackTarget.addEventListener("scroll", this.boundOnScroll, { passive: true });
    this.trackTarget.addEventListener("keydown", this.boundOnKeydown);
    this.element.addEventListener("mouseenter", this.boundPauseAutoplay);
    this.element.addEventListener("mouseleave", this.boundResumeAutoplay);
    this.element.addEventListener("focusin", this.boundPauseAutoplay);
    this.element.addEventListener("focusout", this.boundOnFocusOut);
    document.addEventListener("visibilitychange", this.boundOnVisibilityChange);

    this.updateControls();
    this.scheduleAutoplay();
  }

  disconnect() {
    this.pauseAutoplay();
    this.trackTarget.removeEventListener("scroll", this.boundOnScroll);
    this.trackTarget.removeEventListener("keydown", this.boundOnKeydown);
    this.element.removeEventListener("mouseenter", this.boundPauseAutoplay);
    this.element.removeEventListener("mouseleave", this.boundResumeAutoplay);
    this.element.removeEventListener("focusin", this.boundPauseAutoplay);
    this.element.removeEventListener("focusout", this.boundOnFocusOut);
    document.removeEventListener("visibilitychange", this.boundOnVisibilityChange);
  }

  prev() {
    this.scrollBySlide(-1);
    this.scheduleAutoplay();
  }

  next() {
    this.scrollBySlide(1);
    this.scheduleAutoplay();
  }

  scrollBySlide(direction) {
    const track = this.trackTarget;
    const slide = track.querySelector(".lp-verticals-carousel__slide");
    if (!slide) return;

    const gap = Number.parseFloat(getComputedStyle(track).gap) || 16;
    const amount = (slide.offsetWidth + gap) * direction;
    track.scrollBy({ left: amount, behavior: this.smoothScroll ? "smooth" : "auto" });
  }

  handleKeydown(event) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      this.prev();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      this.next();
    }
  }

  handleFocusOut(event) {
    if (event.relatedTarget && this.element.contains(event.relatedTarget)) return;

    this.scheduleAutoplay();
  }

  handleVisibilityChange() {
    if (document.hidden) {
      this.pauseAutoplay();
    } else {
      this.scheduleAutoplay();
    }
  }

  scheduleAutoplay() {
    this.pauseAutoplay();
    if (!this.autoplayEnabled) return;

    this.autoplayTimer = window.setInterval(() => this.advanceAutoplay(), AUTOPLAY_MS);
  }

  pauseAutoplay() {
    if (this.autoplayTimer) {
      window.clearInterval(this.autoplayTimer);
      this.autoplayTimer = null;
    }
  }

  advanceAutoplay() {
    const track = this.trackTarget;
    const { scrollLeft, scrollWidth, clientWidth } = track;
    const atEnd = scrollLeft + clientWidth >= scrollWidth - 1;

    if (atEnd) {
      track.scrollTo({ left: 0, behavior: this.smoothScroll ? "smooth" : "auto" });
    } else {
      this.scrollBySlide(1);
    }
  }

  updateControls() {
    const { scrollLeft, scrollWidth, clientWidth } = this.trackTarget;
    const atStart = scrollLeft <= 1;
    const atEnd = scrollLeft + clientWidth >= scrollWidth - 1;

    if (this.hasPrevTarget) this.prevTarget.disabled = atStart;
    if (this.hasNextTarget) this.nextTarget.disabled = atEnd;
  }

  get autoplayEnabled() {
    return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  get smoothScroll() {
    return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
}
