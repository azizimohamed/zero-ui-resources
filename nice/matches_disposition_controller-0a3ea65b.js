import { Controller } from "@hotwired/stimulus";

const REMOVE_MS = 220;
const ENTER_MS = 220;

/** Skip/restore card animations and disposition class sync after surgical streams. */
export default class extends Controller {
  connect() {
    this.boundBeforeStreamRender = this.beforeStreamRender.bind(this);
    document.addEventListener("turbo:before-stream-render", this.boundBeforeStreamRender);
  }

  disconnect() {
    document.removeEventListener("turbo:before-stream-render", this.boundBeforeStreamRender);
  }

  beforeStreamRender(event) {
    const stream = event.target;
    if (!stream?.getAttribute) return;

    const action = stream.getAttribute("action");
    const targetId = stream.getAttribute("target");
    if (!action || !targetId) return;

    if (action === "remove" && targetId.startsWith("listing_")) {
      this.animateRemove(event, targetId);
      return;
    }

    if (action === "append" && targetId === "matches_grid") {
      this.animateAppend(event);
      return;
    }

    if (this.isMetaTarget(targetId)) {
      this.wrapRenderForSync(event, targetId);
    }
  }

  isMetaTarget(targetId) {
    return (
      targetId.startsWith("match_disposition_meta_") || targetId.startsWith("match_table_row_meta_")
    );
  }

  animateRemove(event, targetId) {
    const wrapper = document.getElementById(targetId);
    if (!wrapper) return;

    const render = event.detail.render;
    event.detail.render = async (streamElement) => {
      wrapper.classList.add("m-card--removing");
      await this.delay(REMOVE_MS);
      return render(streamElement);
    };
  }

  animateAppend(event) {
    const render = event.detail.render;
    event.detail.render = async (streamElement) => {
      const result = await render(streamElement);
      const card = this.lastAppendedCard();
      if (card) {
        card.classList.add("m-card--entering");
        window.setTimeout(() => card.classList.remove("m-card--entering"), ENTER_MS);
      }
      return result;
    };
  }

  lastAppendedCard() {
    const grid = document.getElementById("matches_grid");
    if (!grid) return null;

    const cards = grid.querySelectorAll("[data-swipe-actions-target='card']");
    return cards.length ? cards[cards.length - 1] : null;
  }

  wrapRenderForSync(event, targetId) {
    const render = event.detail.render;
    event.detail.render = async (streamElement) => {
      const result = await render(streamElement);
      this.syncFromMeta(targetId);
      return result;
    };
  }

  syncFromMeta(metaId) {
    const meta = document.getElementById(metaId);
    if (!meta) return;

    if (metaId.startsWith("match_table_row_meta_")) {
      const row = meta.closest("tr[data-match-ref]");
      if (row) this.applyRowState(row, meta);
      return;
    }

    const wrapper = meta.closest("[data-controller~='swipe-actions']");
    const card = wrapper?.querySelector("[data-swipe-actions-target='card']");
    if (card) this.applyCardState(card, meta);
    if (wrapper) this.applySwipeValues(wrapper, meta);
  }

  applyRowState(row, meta) {
    row.classList.toggle("unseen", meta.dataset.userUnseen === "true");
    row.dataset.userWatchlist = meta.dataset.userWatchlist;
    row.dataset.userSkipped = meta.dataset.userSkipped;
    row.dataset.userContacted = meta.dataset.userContacted;
  }

  applyCardState(card, meta) {
    const unseen = meta.dataset.userUnseen === "true";
    card.classList.toggle("unseen", unseen);
    card.classList.toggle("dimmed", meta.dataset.userSkipped === "true");
    card.dataset.userWatchlist = meta.dataset.userWatchlist;
    card.dataset.userSkipped = meta.dataset.userSkipped;
    card.dataset.userContacted = meta.dataset.userContacted;
  }

  applySwipeValues(wrapper, meta) {
    if (meta.dataset.swipeLeftAction) {
      wrapper.dataset.swipeActionsLeftActionValue = meta.dataset.swipeLeftAction;
    }
    if (meta.dataset.swipeRightAction) {
      wrapper.dataset.swipeActionsRightActionValue = meta.dataset.swipeRightAction;
    }
  }

  delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }
}
