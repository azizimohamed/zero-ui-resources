import { Controller } from "@hotwired/stimulus";

const FIRST_DELAY_MS = 1500;
const MAX_DELAY_MS = 20_000;
const GIVE_UP_MS = 5 * 60 * 1000;
const MAX_IDS = 100;

// Monitors wearing the Deleting badge wait on a background cleanup job. That
// job's remove broadcast is usually emitted before this page finishes
// subscribing to the workspace stream, so the row would stay until the user
// reloads. Poll instead and re-render the page (correct rows plus counts) the
// moment the record is gone.
export default class extends Controller {
  static values = {
    url: String,
    ids: String,
  };

  connect() {
    this.stopped = false;
    this.watched = this.idsValue
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .slice(0, MAX_IDS);
    if (this.watched.length === 0 || !this.hasUrlValue) return;

    this.deadline = Date.now() + GIVE_UP_MS;
    this.delay = FIRST_DELAY_MS;
    this.schedule();
  }

  disconnect() {
    this.stopped = true;
    window.clearTimeout(this.timer);
    this.timer = null;
  }

  schedule() {
    this.timer = window.setTimeout(() => this.poll(), this.delay);
    this.delay = Math.min(this.delay * 2, MAX_DELAY_MS);
  }

  async poll() {
    if (this.stopped) return;

    if (document.hidden) {
      this.reschedule();
      return;
    }

    try {
      const url = new URL(this.urlValue, window.location.origin);
      url.searchParams.set("ids", this.watched.join(","));
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      if (response.ok) {
        const data = await response.json();
        if (this.stopped) return;

        const remaining = Array.isArray(data.remaining) ? data.remaining : this.watched;
        const remainingIds = new Set(remaining);
        if (this.watched.some((id) => !remainingIds.has(id))) {
          this.refresh();
          return;
        }
      }
    } catch {
      // Ignore transient network errors; the next tick retries.
    }

    this.reschedule();
  }

  // Past the deadline the cleanup job is stuck or retrying; ReconcilePendingDeletionJob
  // picks it up hourly and a manual reload still works.
  reschedule() {
    if (this.stopped || Date.now() >= this.deadline) return;

    this.schedule();
  }

  refresh() {
    if (window.Turbo?.visit) {
      window.Turbo.visit(window.location.href, { action: "replace" });
      return;
    }

    window.location.reload();
  }
}
