import { Controller } from "@hotwired/stimulus";

/** Drop recency bucket headers when every card in that bucket was triaged off the page. */
export default class extends Controller {
  connect() {
    this.boundOnRender = this.onRender.bind(this);
    document.addEventListener("turbo:render", this.boundOnRender);
  }

  disconnect() {
    document.removeEventListener("turbo:render", this.boundOnRender);
  }

  onRender() {
    this.prune();
  }

  prune() {
    this.element.querySelectorAll("[data-feed-bucket-header]").forEach((header) => {
      const bucket = header.dataset.feedBucketHeader;
      if (!bucket) return;

      const cards = this.element.querySelectorAll(`[data-feed-bucket="${CSS.escape(bucket)}"]`);
      if (cards.length === 0) header.remove();
    });
  }
}
