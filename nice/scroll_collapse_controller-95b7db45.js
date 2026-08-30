import { Controller } from "@hotwired/stimulus";

// Collapses the matches header when the user scrolls down on mobile.
// Only activates below the sm breakpoint (639px).
export default class extends Controller {
  static targets = ["header", "scrollArea"];

  connect() {
    if (!this.hasScrollAreaTarget || !this.hasHeaderTarget) return;
    this._onScroll = this._handleScroll.bind(this);
    this.scrollAreaTarget.addEventListener("scroll", this._onScroll, {
      passive: true,
    });
  }

  disconnect() {
    this.scrollAreaTarget?.removeEventListener("scroll", this._onScroll);
  }

  _handleScroll() {
    if (window.innerWidth >= 640) return; // desktop: no collapse
    const compact = this.scrollAreaTarget.scrollTop > 60;
    this.headerTarget.classList.toggle("matches-header--compact", compact);
  }
}
