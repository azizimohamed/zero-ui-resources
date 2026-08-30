import { Controller } from "@hotwired/stimulus";

const FEED_MAX_ROWS = 20;

const ROW_ENTER_DEBOUNCE_MS = 150;

export default class extends Controller {
  connect() {
    this.rowEnterTimer = null;
    this.boundAfterStreamRender = this.afterStreamRender.bind(this);
    document.addEventListener("turbo:after-stream-render", this.boundAfterStreamRender);
  }

  disconnect() {
    document.removeEventListener("turbo:after-stream-render", this.boundAfterStreamRender);
    clearTimeout(this.rowEnterTimer);
  }

  afterStreamRender(event) {
    const stream = event.detail?.newStream;
    if (!stream) return;

    const action = stream.getAttribute("action");
    const target = stream.getAttribute("target");
    if (action !== "prepend" || target !== this.element.id) return;

    this.clearEmptyState();
    this.trimFeed();
    this.scheduleAnimateLatestRow();
  }

  scheduleAnimateLatestRow() {
    clearTimeout(this.rowEnterTimer);
    this.rowEnterTimer = setTimeout(() => this.animateLatestRow(), ROW_ENTER_DEBOUNCE_MS);
  }

  clearEmptyState() {
    this.element.querySelector(".new-matches-empty")?.remove();
  }

  trimFeed() {
    const rows = [...this.element.querySelectorAll(".new-matches-row")];
    while (rows.length > FEED_MAX_ROWS) {
      rows.pop()?.remove();
    }
  }

  animateLatestRow() {
    const row = this.element.querySelector(".new-matches-row:first-child");
    if (!row) return;

    row.classList.add("new-matches-row--enter");
    row.addEventListener(
      "animationend",
      () => {
        row.classList.remove("new-matches-row--enter");
      },
      { once: true },
    );
  }
}
