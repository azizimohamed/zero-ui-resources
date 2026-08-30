import { Controller } from "@hotwired/stimulus";

const POLL_INTERVAL_MS = 20_000;
// Match aggregate chrome coalesce (~800ms). Shorter debounces stack /stats multi-replaces
// on top of live card inserts during ingest bursts and lock the tab.
const STATS_DEBOUNCE_MS = 800;

// Keeps matches triage KPIs/tab counts and empty state in sync when listings arrive over Action Cable.
export default class extends Controller {
  static values = { statsPath: String };

  connect() {
    this.debounceTimer = null;
    this.pollTimer = null;
    this.emptyPollRaf = null;
    this.statsInFlight = false;
    this.statsRefreshQueued = false;
    this.boundOnStreamRender = this.onStreamRender.bind(this);
    this.boundOnAnyStreamRender = this.onAnyStreamRender.bind(this);
    document.addEventListener("turbo:before-stream-render", this.boundOnStreamRender);
    document.addEventListener("turbo:before-stream-render", this.boundOnAnyStreamRender);
    this.syncEmptyPoll();
    if (this.element.dataset.matchesStatsPending != null) {
      // First paint only: ask /stats to stream identity facet chips into Filters.
      this.streamFacetsOnce = true;
      this.refreshStats();
    }
  }

  clearStatsPending() {
    delete this.element.dataset.matchesStatsPending;
    this.element.removeAttribute("aria-busy");
  }

  disconnect() {
    document.removeEventListener("turbo:before-stream-render", this.boundOnStreamRender);
    document.removeEventListener("turbo:before-stream-render", this.boundOnAnyStreamRender);
    clearTimeout(this.debounceTimer);
    clearInterval(this.pollTimer);
    if (this.emptyPollRaf != null) cancelAnimationFrame(this.emptyPollRaf);
    this.statsRefreshQueued = false;
  }

  onStreamRender(event) {
    const stream = event.detail?.newStream;
    if (!stream) return;

    const action = stream.getAttribute("action");
    const target = stream.getAttribute("target");
    if (target !== "matches_feed_incoming_buffer") return;
    if (action !== "append" && action !== "prepend") return;

    const buffer = document.getElementById("matches_feed_incoming_buffer");
    if (!buffer || !this.element.contains(buffer)) return;

    this.dismissEmpty();
    this.scheduleStatsRefresh();
  }

  onAnyStreamRender() {
    // Coalesce: a single /stats response fires many before-stream-render events.
    if (this.emptyPollRaf != null) return;
    this.emptyPollRaf = requestAnimationFrame(() => {
      this.emptyPollRaf = null;
      this.syncEmptyPoll();
    });
  }

  syncEmptyPoll() {
    clearInterval(this.pollTimer);

    const empty = document.getElementById("matches_feed_empty");
    if (!empty?.dataset.poll || !this.hasStatsPathValue) return;

    this.pollTimer = setInterval(() => this.refreshStats(), POLL_INTERVAL_MS);
  }

  dismissEmpty() {
    document.getElementById("matches_feed_empty")?.remove();
    this.syncEmptyPoll();
  }

  scheduleStatsRefresh() {
    if (!this.hasStatsPathValue) return;

    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.refreshStats(), STATS_DEBOUNCE_MS);
  }

  feedFlushPending() {
    // Set by matches-feed-focus while a chunked drain is in flight. Do not key off
    // buffer.children alone: list/detail deferral keeps the buffer full on purpose.
    return this.element.dataset.matchesLiveFlush != null;
  }

  filterSheetOpen() {
    // Only the mobile sheet is at risk: /stats replaces matches_triage_header_mobile
    // wholesale, which contains the open sheet and its pending selections. The desktop
    // popover lives outside the replaced chrome, so we must not block /stats for it
    // (that would starve KPIs, comp counts, and bucket headers).
    return Boolean(document.querySelector(".m-mobile-refine[open]"));
  }

  async refreshStats() {
    if (!this.hasStatsPathValue) return;

    // Let chunked live flush finish before replacing triage chrome / bucket headers.
    if (this.feedFlushPending() || this.filterSheetOpen()) {
      this.scheduleStatsRefresh();
      return;
    }

    if (this.statsInFlight) {
      this.statsRefreshQueued = true;
      return;
    }

    this.statsInFlight = true;
    const url = new URL(this.statsPathValue, window.location.origin);
    const page = new URL(window.location.href);
    page.searchParams.forEach((value, key) => {
      url.searchParams.set(key, value);
    });
    if (this.streamFacetsOnce) url.searchParams.set("facets", "1");

    try {
      const response = await fetch(url.toString(), {
        headers: { Accept: "text/vnd.turbo-stream.html" },
        credentials: "same-origin",
      });
      if (!response.ok) return;

      // Flush or a mobile-sheet open may have started while the request was in flight;
      // applying the stream now would clobber the pending drain or the open sheet.
      if (this.feedFlushPending() || this.filterSheetOpen()) {
        this.statsRefreshQueued = true;
        return;
      }

      const html = await response.text();
      window.Turbo.renderStreamMessage(html);
      this.streamFacetsOnce = false;
      this.clearStatsPending();
      // renderStreamMessage does not fire turbo:render — sync bulk filteredCount from the badge.
      this.syncBulkFilteredCount();
    } catch {
      // Ignore transient network errors; next match or poll will reconcile.
    } finally {
      this.statsInFlight = false;
      if (this.statsRefreshQueued) {
        this.statsRefreshQueued = false;
        this.scheduleStatsRefresh();
      }
    }
  }

  syncBulkFilteredCount() {
    const bulk = this.application.getControllerForElementAndIdentifier(
      this.element,
      "matches-bulk",
    );
    bulk?.syncFilteredCountFromDom?.();
  }
}
