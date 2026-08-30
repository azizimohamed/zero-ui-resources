import { Controller } from "@hotwired/stimulus";

const DEFAULT_POLL_MS = 2000;
const STEP_EVENT = "crawlbench:wizard-step";

export default class extends Controller {
  static values = {
    statusUrl: String,
    linked: { type: Boolean, default: false },
    interval: { type: Number, default: DEFAULT_POLL_MS },
    refreshContext: { type: String, default: "wizard" },
  };

  connect() {
    this.syncReturnPaths();
    this.boundStepChanged = () => this.syncReturnPaths();
    window.addEventListener(STEP_EVENT, this.boundStepChanged);

    this.modal = this.element.closest(".alerts-modal");

    if (this.modal) {
      this.modalObserver = new MutationObserver(() => this.syncPolling());
      this.modalObserver.observe(this.modal, {
        attributes: true,
        attributeFilter: ["hidden", "class"],
      });
    }

    this.syncPolling();
  }

  disconnect() {
    this.stopPolling();
    this.modalObserver?.disconnect();
    this.modalObserver = null;
    if (this.boundStepChanged) {
      window.removeEventListener(STEP_EVENT, this.boundStepChanged);
      this.boundStepChanged = null;
    }
  }

  syncPolling() {
    if (this.shouldPoll()) {
      if (this.pollTimer) return;

      this.pollTimer = setInterval(() => this.poll(), this.intervalValue);
      this.poll();
      return;
    }

    this.stopPolling();
  }

  shouldPoll() {
    if (this.linkedValue || !this.hasStatusUrlValue) return false;
    if (!this.modal) return true;

    return this.modal.classList.contains("is-open") && !this.modal.hidden;
  }

  stopPolling() {
    clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  async poll() {
    if (!this.shouldPoll()) {
      this.stopPolling();
      return;
    }

    try {
      const response = await fetch(this.statusUrlValue, {
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      if (!response.ok) return;

      const data = await response.json();
      if (!data.linked) return;

      const refreshed = await this.refreshLinkedUi();
      if (refreshed) {
        this.stopPolling();
      }
    } catch {
      // Ignore transient network errors; the next tick retries.
    }
  }

  async refreshLinkedUi() {
    const url = new URL(this.statusUrlValue, window.location.origin);
    url.searchParams.set("partial", this.refreshContextValue);
    url.searchParams.set("return_to", this.currentPath());

    try {
      const response = await fetch(url, {
        headers: {
          Accept: "text/vnd.turbo-stream.html",
          "X-Requested-With": "XMLHttpRequest",
        },
        credentials: "same-origin",
      });
      if (!response.ok) return false;

      const html = (await response.text()).trim();
      if (!html || !window.Turbo?.renderStreamMessage) return false;

      window.Turbo.renderStreamMessage(html);
      if (this.refreshContextValue === "wizard" || this.refreshContextValue === "alerts") {
        document.dispatchEvent(new CustomEvent("alerts:channels-changed"));
      }
      this.closeConnectSheets();
      return true;
    } catch {
      return false;
    }
  }

  syncReturnPaths() {
    const path = this.currentPath();
    this.element
      .querySelectorAll('a[href*="return_to="], form[action*="telegram"]')
      .forEach((node) => {
        if (node.tagName === "A") {
          try {
            const href = new URL(node.href, window.location.origin);
            href.searchParams.set("return_to", path);
            node.setAttribute("href", `${href.pathname}${href.search}`);
          } catch {
            // Ignore malformed hrefs.
          }
          return;
        }

        const input = node.querySelector('input[name="return_to"]');
        if (input) input.value = path;
      });
  }

  currentPath() {
    return `${window.location.pathname}${window.location.search}`;
  }

  closeConnectSheets() {
    const host = this.element.closest('[data-controller~="alerts-page"]');
    if (!host) return;

    const controller = this.application.getControllerForElementAndIdentifier(host, "alerts-page");
    controller?.closeSheets();
  }
}
