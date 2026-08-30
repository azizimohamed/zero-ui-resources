import { Controller } from "@hotwired/stimulus";
import { Turbo } from "@hotwired/turbo-rails";
import { bulkScopeCountEl, compactCount, countFromElement, fullCountLabel } from "compact_count";
import { confirmAction } from "lib/confirm";
import { toast } from "lib/toast";
import { applyActionButton, triageDefaults } from "matches/triage_action_labels";

/** Page-level match selection and bulk triage bar. */
export default class extends Controller {
  static targets = [
    "bar",
    "count",
    "error",
    "toggle",
    "selectAll",
    "watchlistButton",
    "skippedButton",
    "contactedButton",
    "watchlistLabel",
    "skippedLabel",
    "contactedLabel",
    "bucketAct",
  ];

  static values = {
    filteredCount: { type: Number, default: 0 },
    triage: { type: String, default: "all" },
    statusUrl: String,
  };

  connect() {
    this._onCheckboxChange = this._onCheckboxChange.bind(this);
    this._onBulkSubmitEnd = this._onBulkSubmitEnd.bind(this);
    this._onTurboRender = this._onTurboRender.bind(this);
    this._onPowerSheetSubmit = this._onPowerSheetSubmit.bind(this);
    this._onBulkAssigneePick = this._onBulkAssigneePick.bind(this);

    this.element.addEventListener("change", this._onCheckboxChange);
    // Document-level: form is replaced on filter streams, so bind once here.
    document.addEventListener("turbo:submit-end", this._onBulkSubmitEnd);
    document.addEventListener("turbo:render", this._onTurboRender);
    this.element.addEventListener("matches-bulk-power-sheet:submit", this._onPowerSheetSubmit);
    // Capture: menu is body-portaled, so Stimulus actions on options cannot reach us.
    document.addEventListener("click", this._onBulkAssigneePick, true);

    this.syncCheckboxesFromDom();
    this.rememberDeskUrl();
  }

  disconnect() {
    this.element.removeEventListener("change", this._onCheckboxChange);
    document.removeEventListener("turbo:submit-end", this._onBulkSubmitEnd);
    document.removeEventListener("turbo:render", this._onTurboRender);
    this.element.removeEventListener("matches-bulk-power-sheet:submit", this._onPowerSheetSubmit);
    document.removeEventListener("click", this._onBulkAssigneePick, true);
    window.clearTimeout(this._filteredRefreshTimer);
    this._bulkPollAbort = true;
  }

  _onBulkAssigneePick(event) {
    const btn = event.target.closest?.("[data-matches-bulk-assignee]");
    if (!btn) return;

    const surface = btn.dataset.matchesBulkAssignee;
    const assigneeId = btn.dataset.assigneeId;
    if (!assigneeId) return;

    event.preventDefault();
    event.stopPropagation();

    if (surface === "sheet") {
      this.powerSheet()?.bulkAssignFromId?.(assigneeId);
      return;
    }
    if (surface === "bar") {
      this.bulkAssignFromId(assigneeId);
    }
  }

  bulkAssignFromId(assigneeId) {
    const proxy = {
      preventDefault() {},
      currentTarget: {
        dataset: { bulkAction: "assign", assigneeId: String(assigneeId) },
      },
    };
    return this.bulkSubmit(proxy);
  }

  _onTurboRender() {
    this.syncFilteredCountFromDom();
    this.syncCheckboxesFromDom();
    this.rememberDeskUrl();
  }

  // Turbo streams (e.g. dashboard top-finds replace) drop checkboxes without
  // turbo:render. Resync the dock so a hoisted bar cannot stay open stale.
  toggleTargetDisconnected() {
    this.syncCheckboxesFromDom();
  }

  _onPowerSheetSubmit(event) {
    this.rememberDeskUrl();
    this.lastBulkSelectScope = event.detail?.selectScope === "filtered" ? "filtered" : "page";
    this.lastBulkAdvanced = Boolean(event.detail?.advanced);
  }

  _onBulkSubmitEnd(event) {
    if (event.target !== this.bulkForm()) return;

    if (event.detail?.success) {
      const filtered = this.lastBulkSelectScope === "filtered";
      const advanced = this.lastBulkAdvanced;
      this.lastBulkAdvanced = false;
      // Belt-and-suspenders: Turbo must not leave the location on PATCH /matches/bulk.
      this.restoreDeskUrl();
      this.clearBulkError();
      this.powerSheet()?.clearError();
      this.clear();
      if (filtered && this.powerSheet()?.isOpen()) {
        this.powerSheet()?.showSuccessFromEnqueue();
        this.scheduleFilteredBulkRefresh();
        return;
      }
      this.powerSheet()?.close();
      if (filtered) {
        this.scheduleFilteredBulkRefresh();
        return;
      }
      // Page-scope assign/delete: flash is set server-side; reload desk to show it.
      if (advanced) {
        this.visitDesk();
      }
      return;
    }

    this.lastBulkAdvanced = false;
    this.restoreDeskUrl();
    const message = this.bulkFailureMessage(event);
    if (this.powerSheet()?.isOpen()) {
      this.powerSheet()?.showError(message);
    } else {
      this.showBulkError(message);
    }
  }

  rememberDeskUrl() {
    const path = window.location.pathname;
    // Turbo may already have rewritten location to the form action after submit.
    if (!path || path === "/matches/bulk") return;
    this._deskUrl = `${path}${window.location.search}${window.location.hash}`;
  }

  deskUrl() {
    if (this._deskUrl) return this._deskUrl;
    const path = window.location.pathname;
    if (path && path !== "/matches/bulk") {
      return `${path}${window.location.search}${window.location.hash}`;
    }
    return "/matches/all";
  }

  restoreDeskUrl() {
    if (window.location.pathname !== "/matches/bulk") return;
    const url = this.deskUrl();
    window.history.replaceState(window.history.state, "", url);
  }

  visitDesk() {
    this.restoreDeskUrl();
    Turbo.visit(this.deskUrl(), { action: "replace" });
  }

  scheduleFilteredBulkRefresh() {
    window.clearTimeout(this._filteredRefreshTimer);
    const token = document.getElementById("matches_bulk_enqueue_meta")?.dataset?.statusToken;
    if (token && this.hasStatusUrlValue) {
      this.pollBulkStatus(token);
      return;
    }
    this._filteredRefreshTimer = window.setTimeout(() => {
      this.visitDesk();
    }, 1500);
  }

  async pollBulkStatus(token) {
    this._bulkPollAbort = false;
    const url = this.statusUrlValue.replace("__TOKEN__", encodeURIComponent(token));
    const deadline = Date.now() + 5 * 60 * 1000;

    while (Date.now() < deadline) {
      if (this._bulkPollAbort) return;
      await this.sleep(1000);
      try {
        const response = await fetch(url, {
          headers: { Accept: "application/json" },
          credentials: "same-origin",
        });
        if (!response.ok) continue;

        const data = await response.json();
        if (data.status === "complete") {
          this.visitDesk();
          return;
        }
        if (data.status === "failed") {
          this.showBulkError("Bulk update failed. Try again.");
          this.powerSheet()?.showError("Bulk update failed. Try again.");
          return;
        }
        if (data.status === "running") {
          this.powerSheet()?.updateProgress?.({
            updated: data.updated,
            total: data.total,
          });
        }
      } catch {
        // Keep polling through transient network errors.
      }
    }

    this.visitDesk();
  }

  sleep(ms) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  powerSheet() {
    const el = document.getElementById("matches_bulk_power_sheet");
    if (!el) return null;
    return this.application.getControllerForElementAndIdentifier(el, "matches-bulk-power-sheet");
  }

  bulkForm() {
    return this.element.querySelector("#matches_bulk_form");
  }

  bulkFailureMessage(event) {
    const status = event.detail?.fetchResponse?.response?.status;
    if (status === 403) return "Not allowed to update those matches.";
    if (status === 422) return "Could not update that selection. Refresh and try again.";
    return "Bulk update failed. Try again.";
  }

  showBulkError(message) {
    if (!this.hasErrorTarget) return;
    this.errorTarget.textContent = message;
    this.errorTarget.hidden = false;
  }

  clearBulkError() {
    if (!this.hasErrorTarget) return;
    this.errorTarget.textContent = "";
    this.errorTarget.hidden = true;
  }

  syncCheckboxesFromDom() {
    this.syncSelectionUi();
    this.refreshBar();
  }

  syncSelectionUi() {
    this.updateBucketLabels();
    this.syncTableSelectAllCheckbox();
  }

  syncFilteredCountFromDom() {
    const el = bulkScopeCountEl();
    if (!el) return;

    const count = countFromElement(el);
    if (!Number.isNaN(count)) {
      this.filteredCountValue = count;
      const sheet = this.powerSheet();
      if (sheet) sheet.filteredCountValue = count;
    }
  }

  _onCheckboxChange(event) {
    if (this._syncingCheckboxes) return;

    const t = event.target;
    if (!(t instanceof HTMLInputElement) || t.type !== "checkbox") return;

    const isSelectAll = this.hasSelectAllTarget && t === this.selectAllTarget;
    const isToggle = this.toggleTargets.includes(t);
    if (!isSelectAll && !isToggle) return;

    if (isSelectAll) {
      this._syncingCheckboxes = true;
      try {
        const on = t.checked;
        this.toggleTargets.forEach((el) => {
          el.checked = on;
        });
        this.uniquePageMatchIds().forEach((id) => this.toggleCardSelected(id, on));
      } finally {
        this._syncingCheckboxes = false;
      }
    } else if (isToggle) {
      const id = String(t.dataset.matchRef || "");
      if (id) {
        this.setToggleChecked(id, t.checked);
        this.toggleCardSelected(id, t.checked);
      }
    }

    this.syncSelectionUi();
    this.refreshBar();
  }

  openPowerSheet(event) {
    event?.preventDefault();
    this.powerSheet()?.open();
  }

  openPowerSheetWithBucket(event) {
    event?.preventDefault();
    this.powerSheet()?.open({ bucket: event.currentTarget.dataset.bucket });
  }

  setToggleChecked(matchId, on) {
    this._syncingCheckboxes = true;
    try {
      this.toggleTargets.forEach((el) => {
        if (String(el.dataset.matchRef || "") === String(matchId)) el.checked = on;
      });
    } finally {
      this._syncingCheckboxes = false;
    }
  }

  toggleBucket(event) {
    event.preventDefault();
    const bucket = event.currentTarget.dataset.bucket;
    if (!bucket) return;

    const selectAll = !this.bucketFullySelected(bucket);
    this.bucketMatchIds(bucket).forEach((id) => {
      this.setToggleChecked(id, selectAll);
      this.toggleCardSelected(id, selectAll);
    });
    if (this.hasBarTarget) {
      this.barTarget.hidden = false;
      this.barTarget.dataset.state = "open";
    }
    this.syncSelectionUi();
    this.refreshBar();
  }

  bucketMatchIds(bucket) {
    const ids = [];
    this.element.querySelectorAll(`[data-feed-bucket="${CSS.escape(bucket)}"]`).forEach((wrap) => {
      const id = String(wrap.dataset.matchRef || "");
      if (id) ids.push(id);
    });
    return ids;
  }

  bucketFullySelected(bucket) {
    const ids = this.bucketMatchIds(bucket);
    return ids.length > 0 && ids.every((id) => this.isMatchSelected(id));
  }

  selectedIds() {
    return this.uniquePageMatchIds().filter((id) => this.isMatchSelected(id));
  }

  isMatchSelected(matchId) {
    const id = String(matchId);
    return this.toggleTargets.some((el) => String(el.dataset.matchRef || "") === id && el.checked);
  }

  updateBucketLabels() {
    if (!this.hasBucketActTarget) return;
    this.bucketActTargets.forEach((btn) => {
      const bucket = btn.dataset.bucket;
      if (!bucket) return;
      const unselect = this.bucketFullySelected(bucket);
      const label = unselect ? "unselect page" : "select page";
      const name = btn.dataset.bucketLabel || bucket;
      btn.textContent = label;
      btn.setAttribute(
        "aria-label",
        unselect ? `Unselect page in ${name}` : `Select page in ${name}`,
      );
    });
  }

  pageMatchIds() {
    const ids = [];
    if (!this.hasToggleTarget) return ids;
    this.toggleTargets.forEach((el) => {
      const id = String(el.dataset.matchRef || "");
      if (id) ids.push(id);
    });
    return ids;
  }

  uniquePageMatchIds() {
    return [...new Set(this.pageMatchIds())];
  }

  syncTableSelectAllCheckbox() {
    if (!this.hasSelectAllTarget) return;
    const tableCb = this.selectAllTarget;
    const ids = this.uniquePageMatchIds();
    if (ids.length === 0) {
      tableCb.checked = false;
      tableCb.indeterminate = false;
      return;
    }
    const n = ids.filter((id) => this.isMatchSelected(id)).length;
    tableCb.checked = n === ids.length;
    tableCb.indeterminate = n > 0 && n < ids.length;
  }

  toggleCardSelected(matchId, on) {
    const id = CSS.escape(String(matchId));
    this.element.querySelectorAll(`[data-match-ref="${id}"]`).forEach((wrap) => {
      const card = wrap.querySelector(".m-card, .m-row");
      if (card) {
        card.classList.toggle("selected", on);
      } else if (wrap.matches("tr")) {
        wrap.classList.toggle("selected", on);
      }
    });
  }

  refreshBar() {
    const n = this.selectedIds().length;
    if (!this.hasBarTarget) return;
    if (this.hasCountTarget) {
      this.countTarget.textContent = compactCount(n);
      this.countTarget.title = fullCountLabel(n);
    }
    this.barTarget.hidden = n === 0;
    this.barTarget.dataset.state = n === 0 ? "" : "open";
    this.refreshActionLabels();
  }

  refreshActionLabels() {
    const ids = this.selectedIds();
    const defs = triageDefaults(this.triageValue);

    if (ids.length === 0) {
      applyActionButton(
        this.hasWatchlistButtonTarget ? this.watchlistButtonTarget : null,
        this.hasWatchlistLabelTarget ? this.watchlistLabelTarget : null,
        defs.watchlist.action,
        defs.watchlist.barLabel,
      );
      applyActionButton(
        this.hasSkippedButtonTarget ? this.skippedButtonTarget : null,
        this.hasSkippedLabelTarget ? this.skippedLabelTarget : null,
        defs.skip.action,
        defs.skip.barLabel,
      );
      applyActionButton(
        this.hasContactedButtonTarget ? this.contactedButtonTarget : null,
        this.hasContactedLabelTarget ? this.contactedLabelTarget : null,
        defs.contacted.action,
        defs.contacted.barLabel,
      );
      return;
    }

    let allWatchlist = true;
    let allSkipped = true;
    let allContacted = true;

    ids.forEach((id) => {
      const row = this.matchRow(id);
      if (!row) {
        allWatchlist = false;
        allSkipped = false;
        allContacted = false;
        return;
      }

      if (!this.matchState(row, "watchlist")) allWatchlist = false;
      if (!this.matchState(row, "skipped")) allSkipped = false;
      if (!this.matchState(row, "contacted")) allContacted = false;
    });

    applyActionButton(
      this.hasWatchlistButtonTarget ? this.watchlistButtonTarget : null,
      this.hasWatchlistLabelTarget ? this.watchlistLabelTarget : null,
      allWatchlist ? "neutral" : "watchlist",
      allWatchlist ? "Watching" : "Watch",
    );
    applyActionButton(
      this.hasSkippedButtonTarget ? this.skippedButtonTarget : null,
      this.hasSkippedLabelTarget ? this.skippedLabelTarget : null,
      allSkipped ? "neutral" : "skipped",
      allSkipped ? "Skipped" : "Skip",
    );
    applyActionButton(
      this.hasContactedButtonTarget ? this.contactedButtonTarget : null,
      this.hasContactedLabelTarget ? this.contactedLabelTarget : null,
      allContacted ? "neutral" : "contacted",
      allContacted ? "Marked contacted" : "Mark contacted",
    );
  }

  matchRow(matchId) {
    return this.element.querySelector(`[data-match-ref="${CSS.escape(String(matchId))}"]`);
  }

  matchState(row, stateKey) {
    const card = row?.querySelector(".m-card, .m-row");
    const fromCard = card?.dataset?.[`user${stateKey[0].toUpperCase()}${stateKey.slice(1)}`];
    const fromRow = row?.dataset?.[`user${stateKey[0].toUpperCase()}${stateKey.slice(1)}`];
    return (fromCard || fromRow || "") === "true";
  }

  clear(event) {
    event?.preventDefault();
    this.clearBulkError();
    this._syncingCheckboxes = true;
    try {
      this.toggleTargets.forEach((el) => {
        el.checked = false;
      });
    } finally {
      this._syncingCheckboxes = false;
    }
    this.element
      .querySelectorAll(".m-card.selected, .m-row.selected")
      .forEach((el) => el.classList.remove("selected"));
    this.element.querySelectorAll("tr.selected").forEach((el) => el.classList.remove("selected"));
    this.syncSelectionUi();
    this.refreshBar();
  }

  resetPowerFormFields() {
    const form = this.bulkForm();
    if (!form) return;

    const scopeField = form.querySelector("#matches_bulk_select_scope");
    const recencyField = form.querySelector("#matches_bulk_recency_bucket");
    const postedField = form.querySelector("#matches_bulk_posted_before");

    if (scopeField) scopeField.value = "page";
    if (recencyField) recencyField.value = "";
    if (postedField) postedField.value = "";
  }

  async bulkSubmit(event) {
    event.preventDefault();
    const action = event.currentTarget.dataset.bulkAction;
    const ids = this.selectedIds();
    if (!action || ids.length === 0) return;

    const form = this.bulkForm();
    if (!form) return;

    const advanced = action === "delete" || action === "assign" || action === "export";
    if (action === "delete") {
      const n = ids.length;
      const one = n === 1;
      const ok = await confirmAction({
        variant: "danger",
        title: one ? "Permanently delete this match?" : `Permanently delete ${n} matches?`,
        message:
          "Notes on deleted matches are removed. Listings stay in inventory and may match again later.",
        confirmLabel: one ? "Delete match" : "Delete matches",
        consequences: [
          "This cannot be undone",
          one ? "Match notes are erased" : "Match notes on each row are erased",
        ],
      });
      if (!ok) return;
    }

    this.clearBulkError();
    this.resetPowerFormFields();
    form.querySelectorAll('input[name="match_ids[]"]').forEach((el) => el.remove());
    ids.forEach((id) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = "match_ids[]";
      input.value = id;
      form.appendChild(input);
    });

    const userActionField =
      form.querySelector("#matches_bulk_user_action") ||
      form.querySelector('input[name="user_action"]');
    const bulkActionField =
      form.querySelector("#matches_bulk_bulk_action") ||
      form.querySelector('input[name="bulk_action"]');
    const assigneeField =
      form.querySelector("#matches_bulk_assignee_id") ||
      form.querySelector('input[name="assignee_id"]');

    if (advanced) {
      if (userActionField) userActionField.value = "";
      if (bulkActionField) bulkActionField.value = action;
      if (assigneeField) {
        assigneeField.value =
          action === "assign" ? event.currentTarget.dataset.assigneeId || "none" : "";
      }
    } else {
      if (bulkActionField) bulkActionField.value = "";
      if (assigneeField) assigneeField.value = "";
      if (userActionField) userActionField.value = action;
    }

    this.lastBulkSelectScope = "page";
    this.lastBulkAdvanced = advanced;
    this.rememberDeskUrl();

    // Always keep Turbo on for assign/delete so the desk URL never becomes /matches/bulk.
    delete form.dataset.turbo;

    if (action === "export") {
      await this.downloadBulkCsv(form);
      this.lastBulkAdvanced = false;
      return;
    }
    form.requestSubmit();
  }

  async downloadBulkCsv(form) {
    this.clearBulkError();
    try {
      const response = await fetch(form.action, {
        method: "POST",
        body: new FormData(form),
        credentials: "same-origin",
        headers: {
          Accept: "text/csv, application/octet-stream",
          "X-Requested-With": "XMLHttpRequest",
        },
      });

      const type = response.headers.get("Content-Type") || "";
      if (!response.ok || type.includes("text/html") || type.includes("turbo-stream")) {
        this.showBulkError(
          response.status === 422
            ? "Export is over the 5,000 row cap. Narrow filters and try again."
            : "Export failed. Try again.",
        );
        return;
      }

      const cd = response.headers.get("Content-Disposition") || "";
      const match = cd.match(/filename="?([^";]+)"?/i);
      const filename = match?.[1] || "matches.csv";
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      const exportCount = Number(response.headers.get("X-Export-Count") || 0);
      toast.success(
        exportCount > 0 ? `Exported ${exportCount.toLocaleString()} matches` : "Export downloaded",
      );
      this.clear();
    } catch {
      this.showBulkError("Export failed. Try again.");
    }
  }
}
