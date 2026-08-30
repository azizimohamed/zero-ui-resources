import { Controller } from "@hotwired/stimulus";

// Dead Facebook CDN thumbs (expired signatures) otherwise leave the browser's
// broken-image chrome over the striped shell. Hide the img and reveal the empty state.
export default class extends Controller {
  static targets = ["image", "fallback", "count"];

  connect() {
    if (!this.hasImageTarget) return;
    const img = this.imageTarget;
    // Cached failures can fire before Stimulus binds error->fail.
    if (img.complete && img.naturalWidth === 0) this.fail();
  }

  fail() {
    if (this.hasImageTarget) {
      this.imageTarget.hidden = true;
      // Linked thumbs wrap the Stimulus image target; hide the whole link so a
      // failed CDN card does not leave a second Marketplace tab stop under empty.
      const wrap = this.imageTarget.closest("a.ph-img__fb");
      if (wrap) wrap.hidden = true;
    }
    if (this.hasFallbackTarget) this.fallbackTarget.hidden = false;
    this.countTargets.forEach((el) => {
      el.hidden = true;
    });
    this.element.classList.add("listing-photo--failed");
  }
}
