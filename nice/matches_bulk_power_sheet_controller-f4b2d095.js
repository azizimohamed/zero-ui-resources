import { Controller } from "@hotwired/stimulus";
import { confirmDialog } from "confirm_modal_bridge";
import { confirmAction } from "lib/confirm";
import { lockScroll, unlockScroll } from "lib/scroll_lock";
import { bulkScopeCountEl, compactCount, countFromElement, fullCountLabel } from "compact_count";
import { applyActionButton, triageDefaults } from "matches/triage_action_labels";

const BULK_COUNT_SKIP_KEYS = new Set([
  "user_action",
  "bulk_action",
  "assignee_id",
  "select_scope",
  "match_ids[]",
  "recency_bucket",
  "posted_before",
]);

const COMP_BANDS = [
  { key: "under", label: "Under" },
  { key: "verify", label: "Verify" },
  { key: "flat", label: "At market" },
  { key: "over", label: "Over" },
  { key: "none", label: "No comp" },
];

const COMP_BAND_LABELS = Object.fromEntries(COMP_BANDS.map((b) => [b.key, b.label]));

const EMPTY_BY_SIGNAL = Object.fromEntries(COMP_BANDS.map((b) => [b.key, 0]));

/** Filtered-scope bulk triage sheet (modal). */
export default class extends Controller {
  static targets = [
    "count",
    "countLabel",
    "comp",
    "postedBefore",
    "recency",
    "mixBar",
    "mixKey",
    "guard",
    "success",
    "error",
    "watchlistButton",
    "skippedButton",
    "contactedButton",
    "watchlistLabel",
    "skippedLabel",
    "contactedLabel",
  ];

  static values = {
    countUrl: String,
    triage: { type: String, default: "all" },
    filteredCount: { type: Number, default: 0 },
    comp: { type: String, default: "all" },
  };

  connect() {
    this._bySignal = { ...EMPTY_BY_SIGNAL };
    this._liveCount = this.filteredCountValue;
    this._skipArmed = false;
    this._skipArmedAt = 0;
    this.boundOnTurboRender = this.onTurboRender.bind(this);
    document.addEventListener("turbo:render", this.boundOnTurboRender);
    this.paintMix();
    this.paintGuard();
    this.applyActionLabels();
    this.syncActionEnabled();
  }

  disconnect() {
    document.removeEventListener("turbo:render", this.boundOnTurboRender);
    this.unbindKeydown();
    window.clearTimeout(this._countFetchTimer);
    unlockScroll(this);
  }

  onTurboRender() {
    this.syncFilteredCountFromDom();
    this.syncCompFromUrl();
    if (this.isOpen()) this.syncUi();
  }

  onKeydown(event) {
    if (event.key === "Escape") this.close();
  }

  isOpen() {
    return !this.element.classList.contains("hidden");
  }

  open({ bucket = null } = {}) {
    this.clearError();
    this.clearSuccess();
    this.disarmSkip();
    this.element.classList.remove("hidden");
    this.element.removeAttribute("aria-hidden");
    lockScroll(this);
    this.boundOnKeydown = this.onKeydown.bind(this);
    document.addEventListener("keydown", this.boundOnKeydown);

    if (bucket && this.hasRecencyTarget) {
      this.recencyTarget.value = bucket;
    }

    this.syncCompFromUrl();
    this.syncUi();
  }

  close() {
    if (!this.isOpen()) return;

    this.element.classList.add("hidden");
    this.element.setAttribute("aria-hidden", "true");
    unlockScroll(this);
    this.unbindKeydown();
    this.disarmSkip();
    this.clearSuccess();
  }

  unbindKeydown() {
    if (!this.boundOnKeydown) return;
    document.removeEventListener("keydown", this.boundOnKeydown);
    this.boundOnKeydown = null;
  }

  filtersChanged() {
    this.disarmSkip();
    this.clearSuccess();
    window.clearTimeout(this._countFetchTimer);
    this._countFetchTimer = window.setTimeout(() => this.syncUi(), 150);
  }

  async compChanged() {
    if (!this.hasCompTarget) return;
    const sig = this.compTarget.value || "all";
    this.compValue = sig;
    this.disarmSkip();
    this.clearSuccess();
    await this.applyCompToFeed(sig);
  }

  excludeUnvetted(event) {
    event.preventDefault();
    if (this.hasCompTarget) this.compTarget.value = "under";
    this.compChanged();
  }

  syncFilteredCountFromDom() {
    const el = bulkScopeCountEl();
    if (!el) return;

    const count = countFromElement(el);
    if (!Number.isNaN(count)) this.filteredCountValue = count;
  }

  syncCompFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const sig = params.get("comp") || "all";
    this.compValue = sig;
    if (this.hasCompTarget && this.compTarget.value !== sig) {
      this.compTarget.value = sig;
    }
  }

  syncUi() {
    if (!this.hasCountTarget) return;

    this.setCountDisplay(this._liveCount ?? this.filteredCountValue, { stale: true });
    if (this.hasCountLabelTarget) {
      this.countLabelTarget.textContent = this.hasTimeFilters()
        ? "matches in refined subset"
        : "matches in this view";
    }
    this.fetchCount();
  }

  async fetchCount() {
    if (!this.hasCountUrlValue) return;

    const requestId = (this._countRequestId = (this._countRequestId || 0) + 1);

    try {
      const params = this.countParams();
      const response = await fetch(`${this.countUrlValue}?${params.toString()}`, {
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      if (!response.ok || requestId !== this._countRequestId) return;

      const data = await response.json();
      if (requestId !== this._countRequestId || !this.hasCountTarget) return;

      this._liveCount = data.count ?? 0;
      this._bySignal = { ...EMPTY_BY_SIGNAL, ...(data.by_signal || {}) };
      if (!this.hasTimeFilters()) this.filteredCountValue = this._liveCount;
      this.setCountDisplay(this._liveCount);
      if (this.hasCountLabelTarget) {
        this.countLabelTarget.textContent = this.hasTimeFilters()
          ? "matches in refined subset"
          : "matches in this view";
      }
      this.paintMix();
      this.paintGuard();
      this.applyActionLabels();
      this.syncActionEnabled();
    } catch {
      // Leave the loading/stale state; the user can close and reopen the sheet.
    }
  }

  countParams() {
    const params = new URLSearchParams(window.location.search);
    this.mergeBulkFormContext(params);

    const recency = this.hasRecencyTarget ? this.recencyTarget.value : "";
    const posted = this.hasPostedBeforeTarget ? this.postedBeforeTarget.value : "";
    const comp = this.hasCompTarget ? this.compTarget.value : this.compValue;

    if (recency) params.set("recency_bucket", recency);
    else params.delete("recency_bucket");

    if (posted) params.set("posted_before", posted);
    else params.delete("posted_before");

    if (comp && comp !== "all") params.set("comp", comp);
    else params.delete("comp");

    return params;
  }

  mergeBulkFormContext(params) {
    const form = this.bulkForm();
    if (!form) return;

    for (const [key, value] of new FormData(form).entries()) {
      if (!value || BULK_COUNT_SKIP_KEYS.has(key)) continue;
      params.set(key, value);
    }
  }

  bulkForm() {
    return document.getElementById("matches_bulk_form");
  }

  hasTimeFilters() {
    const posted = this.hasPostedBeforeTarget && this.postedBeforeTarget.value;
    const recency = this.hasRecencyTarget && this.recencyTarget.value;
    return Boolean(posted || recency);
  }

  setCountDisplay(n, { stale = false } = {}) {
    if (!this.hasCountTarget) return;
    this.countTarget.textContent = compactCount(n);
    this.countTarget.title = fullCountLabel(n);
    this.countTarget.classList.toggle("is-stale", stale);
  }

  currentCount() {
    return Number(this._liveCount ?? this.filteredCountValue) || 0;
  }

  currentCompBand() {
    if (this.hasCompTarget) return this.compTarget.value || "all";
    return this.compValue || "all";
  }

  currentCompBandLabel() {
    const sig = this.currentCompBand();
    return COMP_BAND_LABELS[sig] || null;
  }

  paintMix() {
    if (!this.hasMixBarTarget || !this.hasMixKeyTarget) return;

    const signals = this._bySignal || EMPTY_BY_SIGNAL;
    this.mixBarTarget.replaceChildren();
    this.mixKeyTarget.replaceChildren();

    for (const band of COMP_BANDS) {
      const n = Number(signals[band.key] || 0);
      const seg = document.createElement("i");
      seg.className = `m-bulk-sheet__mix--${band.key}`;
      seg.style.flex = String(Math.max(n, 0));
      seg.title = `${band.label} · ${n}`;
      this.mixBarTarget.appendChild(seg);

      const key = document.createElement("span");
      if (n === 0) key.className = "is-zero";
      const swatch = document.createElement("i");
      swatch.className = `m-bulk-sheet__mix--${band.key}`;
      key.appendChild(swatch);
      key.appendChild(document.createTextNode(`${band.label} `));
      const bold = document.createElement("b");
      bold.textContent = String(n);
      key.appendChild(bold);
      this.mixKeyTarget.appendChild(key);
    }
  }

  paintGuard() {
    if (!this.hasGuardTarget) return;

    const sig = this.currentCompBand();
    const signals = this._bySignal || EMPTY_BY_SIGNAL;

    if (sig && sig !== "all") {
      const label = COMP_BAND_LABELS[sig] || sig;
      const tone = COMP_BAND_LABELS[sig] ? sig : "flat";
      this.guardTarget.innerHTML = `
        <div class="m-bulk-sheet__ok m-bulk-sheet__ok--${escapeHtml(tone)}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>
          <p>Scoped to <b>${escapeHtml(label)}</b>. Matches in every other comp band stay untouched.</p>
        </div>`;
      return;
    }

    const risky = Number(signals.verify || 0) + Number(signals.none || 0);
    if (risky > 0) {
      this.guardTarget.innerHTML = `
        <div class="m-bulk-sheet__warn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
          <div>
            <p><b>${risky}</b> of these are Verify or No comp, prices we can’t vouch for yet. Skipping them in bulk can throw away real deals.</p>
            <button type="button" class="m-bulk-sheet__warn-action" data-action="click->matches-bulk-power-sheet#excludeUnvetted">Scope to Under</button>
          </div>
        </div>`;
      return;
    }

    this.guardTarget.replaceChildren();
  }

  applyActionLabels() {
    const defs = triageDefaults(this.triageValue);
    const n = this.currentCount();
    const nLabel = compactCount(n);

    applyActionButton(
      this.hasWatchlistButtonTarget ? this.watchlistButtonTarget : null,
      this.hasWatchlistLabelTarget ? this.watchlistLabelTarget : null,
      defs.watchlist.action,
      `${defs.watchlist.sheetLabel} ${nLabel}`.trim(),
    );
    applyActionButton(
      this.hasSkippedButtonTarget ? this.skippedButtonTarget : null,
      this.hasSkippedLabelTarget ? this.skippedLabelTarget : null,
      defs.skip.action,
      this._skipArmed && defs.skip.action === "skipped"
        ? `Confirm: skip ${nLabel}`
        : `${defs.skip.sheetLabel} ${nLabel}`.trim(),
    );
    applyActionButton(
      this.hasContactedButtonTarget ? this.contactedButtonTarget : null,
      this.hasContactedLabelTarget ? this.contactedLabelTarget : null,
      defs.contacted.action,
      `${defs.contacted.sheetLabel} ${nLabel}`.trim(),
    );

    if (this.hasSkippedButtonTarget) {
      this.skippedButtonTarget.classList.toggle("is-armed", Boolean(this._skipArmed));
    }
  }

  syncActionEnabled() {
    const disabled = this.currentCount() === 0;
    for (const target of ["watchlistButton", "skippedButton", "contactedButton"]) {
      if (!this[`has${capitalize(target)}Target`]) continue;
      const btn = this[`${target}Target`];
      btn.disabled = disabled;
      btn.setAttribute("aria-disabled", disabled ? "true" : "false");
    }
  }

  armSkip() {
    this._skipArmed = true;
    this._skipArmedAt = Date.now();
    this.applyActionLabels();
  }

  disarmSkip() {
    if (!this._skipArmed) return;
    this._skipArmed = false;
    this._skipArmedAt = 0;
    this.applyActionLabels();
  }

  async confirmAction(action) {
    const countLabel = this.countPhrase();
    const count = this.currentCount();

    if (action === "delete") {
      const one = count === 1;
      return confirmAction({
        variant: "danger",
        title: one ? "Permanently delete this match?" : `Permanently delete ${countLabel}?`,
        message:
          "Notes on deleted matches are removed. Listings stay in inventory and may match again later.",
        confirmLabel: one ? "Delete match" : "Delete matches",
        consequences: [
          "This cannot be undone",
          one ? "Match notes are erased" : "Match notes on each row are erased",
        ],
      });
    }

    if (action === "assign") {
      return confirmDialog(`Update assignee on ${countLabel}? This may run in the background.`);
    }

    if (action === "export") {
      return confirmDialog(
        `Download CSV for ${countLabel}? Exports over 5,000 matches need narrower filters.`,
      );
    }

    if (action === "neutral") {
      if (this.triageValue === "skipped") {
        return confirmDialog(
          `Restore ${countLabel} to the active queue? This runs in the background.`,
        );
      }
      if (this.triageValue === "watchlist") {
        return confirmDialog(`Remove ${countLabel} from watchlist? This runs in the background.`);
      }
      if (this.triageValue === "contacted") {
        return confirmDialog(`Clear contacted on ${countLabel}? This runs in the background.`);
      }
      return confirmDialog(`Restore ${countLabel} to neutral? This runs in the background.`);
    }

    return true;
  }

  countPhrase() {
    const n = this.currentCount();
    if (n > 0) return `${compactCount(n)} matches`;
    return this.hasTimeFilters() ? "this refined subset" : "matches in this view";
  }

  syncFormFields() {
    const form = this.bulkForm();
    if (!form) return;

    const scopeField = form.querySelector("#matches_bulk_select_scope");
    const recencyField = form.querySelector("#matches_bulk_recency_bucket");
    const postedField = form.querySelector("#matches_bulk_posted_before");

    if (scopeField) scopeField.value = "filtered";
    if (recencyField && this.hasRecencyTarget) {
      recencyField.value = this.recencyTarget.value || "";
    }
    if (postedField && this.hasPostedBeforeTarget) {
      postedField.value = this.postedBeforeTarget.value || "";
    }

    this.ensureFormCompField(form, this.currentCompBand());
  }

  ensureFormCompField(form, sig) {
    let field = form.querySelector('input[name="comp"]');
    if (!sig || sig === "all") {
      field?.remove();
      return;
    }
    if (!field) {
      field = document.createElement("input");
      field.type = "hidden";
      field.name = "comp";
      form.appendChild(field);
    }
    field.value = sig;
  }

  async bulkAssignFromId(assigneeId) {
    const proxy = {
      preventDefault() {},
      currentTarget: {
        dataset: { bulkAction: "assign", assigneeId: String(assigneeId) },
      },
    };
    await this.submit(proxy);
  }

  async submit(event) {
    event.preventDefault();
    const action = event.currentTarget.dataset.bulkAction;
    if (!action) return;
    if (this.currentCount() === 0) return;

    const advanced = action === "delete" || action === "assign" || action === "export";

    if (action === "skipped") {
      if (!this._skipArmed) {
        this.armSkip();
        return;
      }
      // Ignore the second half of a double-click that armed then immediately confirmed.
      if (Date.now() - (this._skipArmedAt || 0) < 400) return;
    } else if (!(await this.confirmAction(action))) {
      return;
    }

    const form = this.bulkForm();
    if (!form) return;

    this.clearError();
    this.clearSuccess();
    this.syncFormFields();
    form.querySelectorAll('input[name="match_ids[]"]').forEach((el) => el.remove());

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

    this._pendingSuccess = {
      action,
      count: this.currentCount(),
      bandLabel: this.currentCompBandLabel(),
    };

    this.dispatch("submit", {
      detail: { selectScope: "filtered", advanced },
      bubbles: true,
    });

    delete form.dataset.turbo;

    if (action === "export") {
      const bulk = this.application.getControllerForElementAndIdentifier(
        document.querySelector(".matches-triage-pane"),
        "matches-bulk",
      );
      if (bulk?.downloadBulkCsv) {
        await bulk.downloadBulkCsv(form);
        this.close();
        return;
      }
    }

    form.requestSubmit();
  }

  showSuccessFromEnqueue() {
    const pending = this._pendingSuccess;
    this._pendingSuccess = null;
    if (!pending || !this.hasSuccessTarget) return;

    this._progressState = {
      action: pending.action,
      total: pending.count,
      bandLabel: pending.bandLabel || "",
    };
    this.updateProgress({ updated: 0, total: pending.count });
    this.disarmSkip();
  }

  updateProgress({ updated, total } = {}) {
    if (!this.hasSuccessTarget || !this._progressState) return;

    const totalN = Number(total ?? this._progressState.total) || 0;
    const updatedN = Number(updated) || 0;
    this._progressState.total = totalN;

    const verb = progressVerb(this._progressState.action);
    const band = this._progressState.bandLabel ? ` in ${this._progressState.bandLabel}` : "";
    const fraction = `${compactCount(updatedN)} / ${compactCount(totalN)}`;

    this.successTarget.hidden = false;
    this.successTarget.innerHTML = `
      <div class="m-bulk-sheet__toast" role="status" aria-live="polite">
        <span>${escapeHtml(verb)} ${escapeHtml(fraction)}${escapeHtml(band)}…</span>
      </div>`;
  }

  clearSuccess() {
    this._pendingSuccess = null;
    this._progressState = null;
    if (!this.hasSuccessTarget) return;
    this.successTarget.hidden = true;
    this.successTarget.replaceChildren();
  }

  clearError() {
    if (!this.hasErrorTarget) return;
    this.errorTarget.textContent = "";
    this.errorTarget.hidden = true;
  }

  showError(message) {
    if (!this.hasErrorTarget) return;
    this.clearSuccess();
    this.errorTarget.textContent = message;
    this.errorTarget.hidden = false;
  }

  // Reuse the Ask-vs-comp rail turbo-stream path so URL sync + popstate stay consistent.
  applyCompToFeed(sig) {
    const current = new URLSearchParams(window.location.search).get("comp") || "all";
    if (current === (sig || "all")) {
      this.filtersChanged();
      return;
    }

    const link = document.querySelector(
      `#matches_comp_rail a[data-sig="${CSS.escape(sig || "all")}"]`,
    );
    if (link) {
      link.click();
      return;
    }

    this.filtersChanged();
  }
}

function capitalize(name) {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function progressVerb(action) {
  switch (action) {
    case "skipped":
      return "Skipping";
    case "watchlist":
      return "Watchlisting";
    case "contacted":
      return "Marking contacted";
    case "neutral":
      return "Restoring";
    case "delete":
      return "Deleting";
    case "assign":
      return "Assigning";
    default:
      return "Updating";
  }
}
