import { Controller } from "@hotwired/stimulus";

/** Remove duplicate recency bucket headers when Turbo prepends realtime cards. */
export default class extends Controller {
  static values = {
    bucket: String,
  };

  connect() {
    const bucket = this.bucketValue?.trim();
    const grid = document.getElementById("matches_grid");
    if (!grid || !bucket) return;

    const id = `matches_feed_bucket_${bucket}`;
    const dupes = grid.querySelectorAll(`#${CSS.escape(id)}`);
    if (dupes.length <= 1) return;

    const inner = this.element.querySelector(`#${CSS.escape(id)}`);
    inner?.remove();
  }
}
