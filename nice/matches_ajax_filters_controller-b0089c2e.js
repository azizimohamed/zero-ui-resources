import { Controller } from "@hotwired/stimulus";

// Keep the address bar in sync when feed filters load via Turbo Stream AJAX.
export default class extends Controller {
  connect() {
    this._onRequest = this.onRequest.bind(this);
    this._onResponse = this.onResponse.bind(this);
    this._onPopState = this.onPopState.bind(this);
    // Turbo fires these on document, not the Stimulus element.
    document.addEventListener("turbo:before-fetch-request", this._onRequest);
    document.addEventListener("turbo:before-fetch-response", this._onResponse);
    window.addEventListener("popstate", this._onPopState);
  }

  disconnect() {
    document.removeEventListener("turbo:before-fetch-request", this._onRequest);
    document.removeEventListener("turbo:before-fetch-response", this._onResponse);
    window.removeEventListener("popstate", this._onPopState);
  }

  onRequest(event) {
    const url = event.detail?.url;
    if (!url) return;

    const headers = event.detail.fetchOptions?.headers;
    const accept = headers?.Accept || headers?.accept || headers?.get?.("Accept") || "";
    if (!String(accept).includes("turbo-stream")) return;

    const next = new URL(url.toString(), window.location.origin);
    if (!this.isMatchesFeedPath(next.pathname)) return;
    if (Number(next.searchParams.get("page") || "1") > 1) return;

    this._pendingUrl = next.toString();
  }

  onResponse(event) {
    const pending = this._pendingUrl;
    this._pendingUrl = null;
    if (!pending) return;

    const response = event.detail?.fetchResponse?.response;
    if (!response?.ok) return;
    const ct = response.headers.get("Content-Type") || "";
    if (!ct.includes("turbo-stream")) return;

    const next = new URL(pending, window.location.origin);
    const cur = new URL(window.location.href);
    if (next.pathname === cur.pathname && next.search === cur.search) return;

    history.pushState({ turbo_stream_filter: true }, "", next.pathname + next.search + next.hash);
    this._usedStreamFilters = true;
    document.getElementById("matches_feed_scroll")?.scrollTo({ top: 0, behavior: "instant" });
    // Streams apply after this event — sync bulk count once the badge is in the DOM.
    requestAnimationFrame(() => this.syncBulkFilteredCount());
  }

  onPopState() {
    if (!this.element.isConnected || !this._usedStreamFilters) return;
    window.Turbo?.visit(window.location.href, { action: "replace" });
  }

  syncBulkFilteredCount() {
    const bulk = this.application.getControllerForElementAndIdentifier(
      this.element,
      "matches-bulk",
    );
    bulk?.syncFilteredCountFromDom?.();
    const sheet = bulk?.powerSheet?.();
    if (!sheet) return;
    sheet.syncCompFromUrl?.();
    if (sheet.isOpen?.()) sheet.syncUi?.();
  }

  isMatchesFeedPath(pathname) {
    return pathname === "/matches/all" || /^\/matches\/[A-Za-z0-9_-]+$/.test(pathname);
  }
}
