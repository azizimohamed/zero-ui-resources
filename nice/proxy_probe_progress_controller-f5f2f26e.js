import { Controller } from "@hotwired/stimulus";

// Polls probe_progress JSON and fills a simple progress bar until the batch completes.
export default class extends Controller {
  static values = {
    url: String,
    interval: { type: Number, default: 2000 },
    reloadOnComplete: { type: Boolean, default: true },
  };

  static targets = ["panel", "bar", "label", "meta"];

  connect() {
    this._timer = null;
    this._completeHandled = false;
    this._sawActive = false;
    this.refresh();
  }

  disconnect() {
    this.stop();
  }

  startPolling() {
    if (this._timer) return;
    this._timer = window.setInterval(() => this.refresh(), this.intervalValue);
  }

  stop() {
    if (!this._timer) return;
    window.clearInterval(this._timer);
    this._timer = null;
  }

  async refresh() {
    if (!this.urlValue) return;

    try {
      const response = await fetch(this.urlValue, {
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      if (!response.ok) return;

      const data = await response.json();
      this.render(data);

      if (data.complete && data.total > 0) {
        this.stop();
        this.handleComplete();
        return;
      }

      if (data.active || (data.total > 0 && !data.complete)) {
        this.startPolling();
      } else {
        this.stop();
      }
    } catch {
      // Keep trying through transient errors while a batch may be running.
      this.startPolling();
    }
  }

  render(data) {
    if (data.active) this._sawActive = true;

    const total = Number(data.total) || 0;
    const done = Number(data.done) || 0;
    const percent = Math.max(0, Math.min(100, Number(data.percent) || 0));
    const show = total > 0 && (data.active || data.complete);

    if (this.hasPanelTarget) {
      this.panelTarget.hidden = !show;
      this.panelTarget.classList.toggle("is-complete", Boolean(data.complete));
    }
    if (this.hasBarTarget) {
      this.barTarget.style.width = `${percent}%`;
      this.barTarget.setAttribute("aria-valuenow", String(Math.round(percent)));
    }
    if (this.hasLabelTarget) {
      this.labelTarget.textContent = data.complete
        ? `Tested ${done.toLocaleString()} / ${total.toLocaleString()}`
        : `Testing ${done.toLocaleString()} / ${total.toLocaleString()}`;
    }
    if (this.hasMetaTarget) {
      const bits = [`${percent}%`];
      if (data.reachable != null) bits.push(`${Number(data.reachable).toLocaleString()} reachable`);
      if (data.failed != null) bits.push(`${Number(data.failed).toLocaleString()} dead`);
      if (data.skipped != null && Number(data.skipped) > 0) {
        bits.push(`${Number(data.skipped).toLocaleString()} skipped`);
      }
      this.metaTarget.textContent = bits.join(" · ");
    }
  }

  handleComplete() {
    if (this._completeHandled || !this.reloadOnCompleteValue) return;
    // Avoid reload loops when opening a page that already finished earlier.
    if (!this._sawActive && !new URL(window.location.href).searchParams.has("probing")) return;
    this._completeHandled = true;
    window.setTimeout(() => {
      if (window.Turbo?.visit) {
        const url = new URL(window.location.href);
        url.searchParams.delete("probing");
        window.Turbo.visit(url.toString(), { action: "replace" });
      } else {
        window.location.reload();
      }
    }, 1200);
  }
}
