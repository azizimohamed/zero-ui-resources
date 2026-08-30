import { Controller } from "@hotwired/stimulus";
import { visitMatchDrawer } from "match_drawer_visit";

export default class extends Controller {
  static targets = ["sheetDialog"];
  static values = { selectedId: String };

  connect() {
    this.boundFrameLoad = this.onFrameLoad.bind(this);
    this.boundDialogClose = this.onDialogClose.bind(this);
    this.boundDrawerClosed = this.onDrawerClosed.bind(this);
    this.boundTableRowClick = this.onTableRowClick.bind(this);
    document.addEventListener("turbo:frame-load", this.boundFrameLoad);
    document.addEventListener("match-drawer:closed", this.boundDrawerClosed);
    this.element.addEventListener("click", this.boundTableRowClick);
    if (this.hasSheetDialogTarget) {
      this.sheetDialogTarget.addEventListener("close", this.boundDialogClose);
    }

    const params = new URLSearchParams(window.location.search);
    const openMatchId = params.get("open");

    if (openMatchId) {
      this.pendingOpenMatchId = openMatchId;
      this.removeOpenFromUrl();
      requestAnimationFrame(() => this.openDrawerForMatch(openMatchId));
    }
  }

  disconnect() {
    document.removeEventListener("turbo:frame-load", this.boundFrameLoad);
    document.removeEventListener("match-drawer:closed", this.boundDrawerClosed);
    this.element.removeEventListener("click", this.boundTableRowClick);
    if (this.hasSheetDialogTarget) {
      this.sheetDialogTarget.removeEventListener("close", this.boundDialogClose);
    }
  }

  onTableRowClick(event) {
    const row = event.target.closest("tr[data-match-ref]");
    if (!row || !this.element.contains(row)) return;
    if (event.target.closest("a[href], button, input, label, .row-actions")) return;

    const drawerLink = row.querySelector('a[data-turbo-frame="match_drawer"]');
    if (!drawerLink) return;

    event.preventDefault();
    visitMatchDrawer(drawerLink);
  }

  onFrameLoad(event) {
    if (event.target.id !== "match_sheet") return;
    const marker = event.target.querySelector("[data-match-detail-ref]");
    const id = marker?.getAttribute("data-match-detail-ref");
    if (!id) return;
    this.selectedIdValue = id;
  }

  onDialogClose() {
    this.selectedIdValue = "";
  }

  onDrawerClosed(event) {
    const matchRef = event.detail?.matchRef;
    if (!matchRef || !this.pendingOpenMatchId || this.pendingOpenMatchId !== matchRef) return;

    this.pendingOpenMatchId = null;
    this.selectedIdValue = matchRef;
    this.scrollToMatch(matchRef);
  }

  scrollToMatch(matchId) {
    const surface = this.findMatchSurface(matchId);
    if (!surface) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    surface.scrollIntoView({
      behavior: reducedMotion ? "instant" : "smooth",
      block: "center",
    });
  }

  selectedIdValueChanged() {
    this.syncCardSelection();
  }

  openDrawerForMatch(matchId) {
    const trigger = document.getElementById("match_open_drawer_trigger");
    if (trigger) {
      visitMatchDrawer(trigger);
      return;
    }

    const surface = this.findMatchSurface(matchId);
    const drawerLink =
      surface?.querySelector("[data-swipe-actions-target='drawerLink']") ||
      surface?.querySelector('a[data-turbo-frame="match_drawer"]');
    if (drawerLink) visitMatchDrawer(drawerLink);
  }

  syncCardSelection() {
    document
      .querySelectorAll(
        ".is-match-selected[data-match-ref], .is-match-selected[data-swipe-actions-target='card']",
      )
      .forEach((el) => {
        el.classList.remove("is-match-selected");
      });
    if (!this.selectedIdValue) return;
    this.findMatchSurface(this.selectedIdValue)?.classList.add("is-match-selected");
  }

  findMatchSurface(matchId) {
    const safeId = CSS.escape(matchId);
    return (
      document.querySelector(`[data-swipe-actions-target="card"][data-match-ref="${safeId}"]`) ||
      document.querySelector(`tr[data-match-ref="${safeId}"]`)
    );
  }

  removeOpenFromUrl() {
    const params = new URLSearchParams(window.location.search);
    params.delete("open");

    const newUrl = new URL(window.location);
    newUrl.search = params.toString();
    window.history.replaceState({}, "", newUrl);
  }
}
