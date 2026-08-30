import { Controller } from "@hotwired/stimulus";
import { Turbo } from "@hotwired/turbo-rails";
import { flushIncomingBufferChunk, previewTextFromWrapper } from "matches/feed_incoming_flush";

/** Deferred inbox: buffer realtime inserts while reviewing; flush into #matches_grid on release. */
export default class extends Controller {
  static targets = ["scroll", "incomingBar", "incomingCount", "incomingPreview", "incomingBuffer"];

  static values = {
    bucketLabels: Object,
  };

  // Realtime HTML is card-shaped (one broadcast for all viewers). List density
  // cannot mount those nodes into #matches_table_body without a reload.
  listMode() {
    const fromToggle = this.element.dataset.gridToggleViewValue;
    if (fromToggle === "list" || fromToggle === "grid") return fromToggle === "list";
    return /(?:^|;\s*)crawlbench_matches_view=list(?:;|$)/.test(document.cookie);
  }

  connect() {
    this.boundOnFrameLoad = this.onFrameLoad.bind(this);
    this.boundOnDrawerClosed = this.onDrawerClosed.bind(this);
    this.boundOnDialogClose = this.onDialogClose.bind(this);
    this.liveFlushRaf = null;
    this.liveFlushForce = false;
    this.suppressBufferObserver = false;
    this.dead = false;

    document.addEventListener("turbo:frame-load", this.boundOnFrameLoad);
    document.addEventListener("match-drawer:closed", this.boundOnDrawerClosed);

    const sheetDialog = this.element.querySelector('[data-highlight-match-target="sheetDialog"]');
    if (sheetDialog) {
      sheetDialog.addEventListener("close", this.boundOnDialogClose);
    }

    this.bufferObserver = new MutationObserver(() => this.onBufferMutated());
    if (this.hasIncomingBufferTarget) {
      this.bufferObserver.observe(this.incomingBufferTarget, { childList: true });
    }

    this.syncIncomingBar();
    this.syncFocusChrome();
  }

  disconnect() {
    this.dead = true;
    if (this.liveFlushRaf != null) {
      cancelAnimationFrame(this.liveFlushRaf);
      this.liveFlushRaf = null;
    }
    this.clearLiveFlushFlag();

    document.removeEventListener("turbo:frame-load", this.boundOnFrameLoad);
    document.removeEventListener("match-drawer:closed", this.boundOnDrawerClosed);

    const sheetDialog = this.element.querySelector('[data-highlight-match-target="sheetDialog"]');
    if (sheetDialog) {
      sheetDialog.removeEventListener("close", this.boundOnDialogClose);
    }

    this.bufferObserver?.disconnect();
  }

  onFrameLoad(event) {
    const id = event.target?.id;
    if (id !== "match_drawer" && id !== "match_sheet") return;

    this.syncFocusChrome();
    this.syncIncomingBar();
  }

  onDrawerClosed() {
    this.releaseReview({ flush: true });
  }

  onDialogClose() {
    this.releaseReview({ flush: true });
  }

  onBufferMutated() {
    // Our own chunked flush removes buffer children; ignore those echoes.
    if (this.suppressBufferObserver) return;
    if (!this.hasIncomingBufferTarget) return;

    if (this.listMode() || this.detailIsOpen()) {
      this.syncIncomingBar();
      return;
    }

    // Coalesce Cable bursts: one card chunk per frame instead of sync-flushing
    // every prepend (~9KB HTML + Stimulus + image decode per card).
    this.ensureLiveFlush();
  }

  showIncomingInFeed(event) {
    event?.preventDefault();
    this.flushBuffer();
  }

  detailIsOpen() {
    const drawerRoot = document.getElementById("match_drawer_container");
    if (drawerRoot?.querySelector(".listing-drawer-overlay")) return true;

    const dialog = this.element.querySelector('[data-highlight-match-target="sheetDialog"]');
    return Boolean(dialog?.open);
  }

  releaseReview({ flush = false } = {}) {
    this.syncFocusChrome();
    if (flush) this.flushBuffer();
    else this.syncIncomingBar();
  }

  syncIncomingBar() {
    if (!this.hasIncomingBarTarget) return;

    const count = this.pendingCount();
    // List mode keeps the bar until the user accepts a reload (card HTML ≠ row).
    if (count === 0 || (!this.listMode() && !this.detailIsOpen())) {
      this.incomingBarTarget.hidden = true;
      return;
    }

    this.incomingBarTarget.hidden = false;
    const bucket = this.pendingPrimaryBucket();
    const bucketLabel = bucket ? this.bucketLabel(bucket) : "feed";
    if (this.hasIncomingCountTarget) {
      this.incomingCountTarget.textContent = `+${count} new in ${bucketLabel}`;
    }
    if (this.hasIncomingPreviewTarget) {
      const first = this.incomingBufferTarget?.firstElementChild;
      this.incomingPreviewTarget.textContent = first ? previewTextFromWrapper(first, count) : "";
    }
  }

  pendingCount() {
    return this.hasIncomingBufferTarget ? this.incomingBufferTarget.children.length : 0;
  }

  pendingPrimaryBucket() {
    return (
      this.incomingBufferTarget?.firstElementChild?.dataset?.feedBucketInsertBucketValue || null
    );
  }

  bucketLabel(bucket) {
    return this.bucketLabelsValue?.[bucket] || bucket;
  }

  flushBuffer() {
    if (!this.hasIncomingBufferTarget) return;

    if (this.listMode()) {
      if (this.pendingCount() === 0) {
        this.syncIncomingBar();
        return;
      }
      Turbo.visit(window.location.href, { action: "replace" });
      return;
    }

    // Explicit flush (Show in feed / drawer close) must run even while detail is open.
    this.ensureLiveFlush({ force: true });
  }

  ensureLiveFlush({ force = false } = {}) {
    if (force) this.liveFlushForce = true;
    // Advertise before the first paint callback so /stats will not race the drain.
    this.markLiveFlushing();
    if (this.liveFlushRaf != null) return;

    this.liveFlushRaf = requestAnimationFrame(() => {
      this.liveFlushRaf = null;
      this.pumpLiveFlush();
    });
  }

  markLiveFlushing() {
    this.element.dataset.matchesLiveFlush = "";
  }

  clearLiveFlushFlag() {
    delete this.element.dataset.matchesLiveFlush;
  }

  pumpLiveFlush() {
    if (this.dead) return;

    const grid = document.getElementById("matches_grid");
    if (!grid || !this.hasIncomingBufferTarget) {
      this.liveFlushForce = false;
      this.clearLiveFlushFlag();
      this.syncIncomingBar();
      return;
    }

    if (this.listMode()) {
      this.liveFlushForce = false;
      this.clearLiveFlushFlag();
      this.syncIncomingBar();
      return;
    }

    // Auto drain pauses while reviewing; force drains for Show in feed / release.
    if (!this.liveFlushForce && this.detailIsOpen()) {
      this.clearLiveFlushFlag();
      this.syncIncomingBar();
      return;
    }

    this.markLiveFlushing();
    this.suppressBufferObserver = true;
    let remaining = 0;
    try {
      remaining = flushIncomingBufferChunk(this.incomingBufferTarget, grid);
    } finally {
      this.suppressBufferObserver = false;
    }

    if (this.dead) {
      this.clearLiveFlushFlag();
      return;
    }

    const keepGoing =
      remaining > 0 && !this.listMode() && (this.liveFlushForce || !this.detailIsOpen());
    if (keepGoing) {
      this.ensureLiveFlush({ force: this.liveFlushForce });
      return;
    }

    this.liveFlushForce = false;
    this.clearLiveFlushFlag();
    this.pruneFeedBuckets();
    this.syncIncomingBar();
  }

  pruneFeedBuckets() {
    const grid = document.getElementById("matches_grid");
    if (!grid) return;

    const prune = this.application.getControllerForElementAndIdentifier(grid, "feed-bucket-prune");
    prune?.prune();
  }

  syncFocusChrome() {
    if (this.hasScrollTarget) {
      this.scrollTarget.classList.toggle("matches-feed-scroll--focus", this.detailIsOpen());
    }
  }
}
