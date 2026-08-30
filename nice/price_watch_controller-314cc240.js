import { Controller } from "@hotwired/stimulus";
import { confirmAction } from "lib/confirm";
import { lockScroll, unlockScroll } from "lib/scroll_lock";

/** Price watch desk: lane selection, bulk sheet, per-card target dialog. */
export default class extends Controller {
  static targets = [
    "grid",
    "bar",
    "count",
    "selectAll",
    "sheet",
    "sheetCount",
    "bulkTarget",
    "bulkTargetHint",
    "bulkCurrencyWarn",
    "bulkTargetButton",
    "targetDialog",
    "targetInput",
    "targetRef",
    "targetAskCents",
    "targetHint",
    "targetListing",
    "targetError",
    "emptyLane",
    "card",
    "toggle",
  ];

  static values = {
    bulkUrl: String,
    updateUrlTemplate: { type: String, default: "/price-watch/:id" },
    lane: { type: String, default: "all" },
  };

  connect() {
    this._onChange = this._onChange.bind(this);
    this._onKey = this._onKey.bind(this);
    this._onSubmitEnd = this._onSubmitEnd.bind(this);
    this.element.addEventListener("change", this._onChange);
    this.element.addEventListener("click", this._onChange);
    this.element.addEventListener("turbo:submit-end", this._onSubmitEnd);
    document.addEventListener("keydown", this._onKey);
    this.sync();
  }

  disconnect() {
    this.element.removeEventListener("change", this._onChange);
    this.element.removeEventListener("click", this._onChange);
    this.element.removeEventListener("turbo:submit-end", this._onSubmitEnd);
    document.removeEventListener("keydown", this._onKey);
    unlockScroll(this.sheetLock);
    unlockScroll(this.dialogLock);
  }

  // Distinct tokens so a sheet + dialog can stack without the first close
  // dropping the other's lock (lib/scroll_lock counts each holder once).
  get sheetLock() {
    return (this._sheetLock ||= { kind: "pw-sheet" });
  }

  get dialogLock() {
    return (this._dialogLock ||= { kind: "pw-dialog" });
  }

  // Escape closes a native modal dialog without routing through closeTarget.
  targetDialogTargetConnected(dialog) {
    this._onTargetClose ||= () => unlockScroll(this.dialogLock);
    dialog.addEventListener("close", this._onTargetClose);
  }

  targetDialogTargetDisconnected(dialog) {
    if (this._onTargetClose) dialog.removeEventListener("close", this._onTargetClose);
  }

  _onSubmitEnd(event) {
    if (!event.detail?.success) return;
    const form = event.target;
    if (form?.matches?.(".pw-add")) {
      const input = form.querySelector("#pw_urls");
      if (input) input.value = "";
    }
    requestAnimationFrame(() => this.sync());
  }

  _onChange(event) {
    const toggle = event.target.closest?.(
      "input[type='checkbox'][data-price-watch-target='toggle']",
    );
    if (!toggle && event.type === "click") return;
    if (
      event.type === "change" &&
      !toggle &&
      !event.target.matches?.("[data-price-watch-target='selectAll']")
    ) {
      return;
    }
    // Defer so checkbox checked state is settled after the click.
    requestAnimationFrame(() => this.sync());
  }

  _onKey(event) {
    if (event.key === "Escape") {
      if (this.hasSheetTarget && !this.sheetTarget.hidden) {
        this.closeSheet();
        return;
      }
      this.clear();
    }
  }

  sync() {
    const selected = this.selectedRefs();
    if (this.hasCountTarget) this.countTarget.textContent = String(selected.length);
    if (this.hasSheetCountTarget) this.sheetCountTarget.textContent = String(selected.length);
    if (this.hasBarTarget) {
      const open = selected.length > 0;
      this.barTarget.hidden = !open;
      this.barTarget.toggleAttribute("hidden", !open);
      this.barTarget.dataset.state = open ? "open" : "";
    }

    this.cardTargets.forEach((card) => {
      const ck = card.querySelector("input[type='checkbox'][data-price-watch-target='toggle']");
      card.classList.toggle("selected", Boolean(ck?.checked));
    });

    if (this.hasSelectAllTarget) {
      const toggles = this.toggleElements();
      this.selectAllTarget.checked = toggles.length > 0 && toggles.every((el) => el.checked);
    }

    this.syncBulkCurrency();
  }

  selectedCurrencies() {
    const currencies = this.toggleElements()
      .filter((el) => el.checked)
      .map((el) => el.dataset.currency || el.closest("[data-currency]")?.dataset.currency || "USD");
    return [...new Set(currencies.filter(Boolean))];
  }

  syncBulkCurrency() {
    const currencies = this.selectedCurrencies();
    const mixed = currencies.length > 1;
    const single = currencies.length === 1 ? currencies[0] : null;

    if (this.hasBulkTargetTarget) {
      this.bulkTargetTarget.disabled = mixed;
      if (single === "USD") {
        this.bulkTargetTarget.placeholder = "$ 18,000";
      } else if (single) {
        this.bulkTargetTarget.placeholder = `${single} 18,000`;
      } else {
        this.bulkTargetTarget.placeholder = "$ 18,000";
      }
    }

    if (this.hasBulkTargetButtonTarget) {
      this.bulkTargetButtonTarget.disabled = mixed || currencies.length === 0;
      this.bulkTargetButtonTarget.title = mixed
        ? "Select watches in one currency to set a shared target"
        : "Set target";
    }

    if (this.hasBulkCurrencyWarnTarget) {
      if (mixed) {
        this.bulkCurrencyWarnTarget.hidden = false;
        this.bulkCurrencyWarnTarget.textContent = `Mixed currencies (${currencies.sort().join(", ")}). Narrow the selection to one currency before setting a target. Mute, stop, and check now still work.`;
      } else {
        this.bulkCurrencyWarnTarget.hidden = true;
        this.bulkCurrencyWarnTarget.textContent = "";
      }
    }

    if (this.hasBulkTargetHintTarget && !mixed) {
      this.bulkTargetHintTarget.textContent = single
        ? `Alerts fire when the ask reaches the target in ${single}. Must be below each listing's current ask. Leave blank when muting or stopping.`
        : "Alerts fire when the ask reaches the target. Must be below each listing's current ask, and every selected watch must share one currency. Leave blank when muting or stopping.";
    }
  }

  clear() {
    this.toggleElements().forEach((el) => {
      el.checked = false;
    });
    this.sync();
  }

  toggleSelectAll() {
    const on = this.hasSelectAllTarget && this.selectAllTarget.checked;
    this.toggleElements().forEach((el) => {
      el.checked = on;
    });
    this.sync();
  }

  selectedRefs() {
    return this.toggleElements()
      .filter((el) => el.checked)
      .map((el) => el.dataset.trackedRef)
      .filter(Boolean);
  }

  toggleElements() {
    if (this.hasToggleTarget) return this.toggleTargets;
    return Array.from(
      this.element.querySelectorAll("input[type='checkbox'][data-price-watch-target='toggle']"),
    );
  }

  openSheet() {
    if (!this.hasSheetTarget) return;
    this.sheetTarget.hidden = false;
    lockScroll(this.sheetLock);
    this.sync();
  }

  closeSheet() {
    if (!this.hasSheetTarget) return;
    this.sheetTarget.hidden = true;
    unlockScroll(this.sheetLock);
  }

  openTarget(event) {
    const btn = event.currentTarget;
    this.openTargetFor(
      btn.dataset.trackedRef,
      btn.dataset.targetCents,
      btn.dataset.askCents,
      btn.dataset.askLabel,
      btn.dataset.listingTitle,
    );
  }

  openTargetFor(ref, cents, askCents, askLabel, listingTitle) {
    if (!this.hasTargetDialogTarget) return;
    this.targetRefTarget.value = ref || "";
    if (this.hasTargetAskCentsTarget) {
      this.targetAskCentsTarget.value = askCents && Number(askCents) > 0 ? String(askCents) : "";
    }
    if (this.hasTargetErrorTarget) {
      this.targetErrorTarget.hidden = true;
      this.targetErrorTarget.textContent = "";
    }
    if (this.hasTargetListingTarget) {
      const title = (listingTitle || "").trim();
      if (title) {
        this.targetListingTarget.textContent = title;
        this.targetListingTarget.hidden = false;
      } else {
        this.targetListingTarget.textContent = "";
        this.targetListingTarget.hidden = true;
      }
    }
    if (this.hasTargetHintTarget) {
      this.targetHintTarget.textContent = askLabel
        ? `Alerts fire when the ask reaches this number. Must be below ${askLabel}. Leave blank to clear.`
        : "Alerts fire when the ask reaches this number. Must be below the current ask. Leave blank to clear.";
    }
    if (this.hasTargetInputTarget) {
      this.targetInputTarget.placeholder = askLabel ? askLabel : "$ 18,000";
      if (cents && Number(cents) > 0) {
        this.targetInputTarget.value = String(Math.round(Number(cents) / 100));
      } else {
        this.targetInputTarget.value = "";
      }
    }
    lockScroll(this.dialogLock);
    this.targetDialogTarget.showModal?.() || (this.targetDialogTarget.open = true);
    this.targetInputTarget.focus();
  }

  closeTarget() {
    if (!this.hasTargetDialogTarget) return;
    this.targetDialogTarget.close?.();
    this.targetDialogTarget.open = false;
    unlockScroll(this.dialogLock);
  }

  async submitTarget(event) {
    event.preventDefault();
    const ref = this.targetRefTarget.value;
    if (!ref) return;

    const raw = this.targetInputTarget.value.trim();
    if (raw !== "") {
      const cents = this.parseTargetCents(raw);
      const ask = Number(this.hasTargetAskCentsTarget ? this.targetAskCentsTarget.value : 0);
      if (!cents) {
        this.showTargetError("Enter a valid target price.");
        return;
      }
      if (ask > 0 && cents >= ask) {
        const label = this.targetInputTarget.placeholder || "the current ask";
        this.showTargetError(`Target must be below ${label}.`);
        return;
      }
    }

    const url = (this.updateUrlTemplateValue || "/price-watch/:id").replace(
      ":id",
      encodeURIComponent(ref),
    );
    const ok = await this.postTurbo(url, {
      _method: "patch",
      target_price: raw,
      lane: this.laneValue || "all",
    });
    if (ok) this.closeTarget();
  }

  showTargetError(message) {
    if (!this.hasTargetErrorTarget) return;
    this.targetErrorTarget.textContent = message;
    this.targetErrorTarget.hidden = false;
  }

  parseTargetCents(raw) {
    const dollars = String(raw).replace(/[^\d.]/g, "");
    if (!dollars) return null;
    const cents = Math.round(Number(dollars) * 100);
    return cents > 0 ? cents : null;
  }

  async bulk(event) {
    const action = event.currentTarget.dataset.bulkAction;
    const ids = this.selectedRefs();
    if (!ids.length) return;

    if (action === "target" && this.selectedCurrencies().length > 1) {
      this.syncBulkCurrency();
      return;
    }

    if (action === "stop") {
      const n = ids.length;
      const ok = await confirmAction({
        variant: "warning",
        title: n === 1 ? "Stop watching this listing?" : `Stop watching ${n} listings?`,
        message:
          n === 1
            ? "We'll stop checking it for price moves. You can watch it again later."
            : "We'll stop checking these listings for price moves. You can watch them again later.",
        confirmLabel: n === 1 ? "Stop watching" : `Stop ${n} watches`,
      });
      if (!ok) return;
    }

    if (action === "export") {
      await this.downloadCsv(ids);
      return;
    }

    const fields = {
      bulk_action: action,
      lane: this.laneValue || "all",
      target_price: this.hasBulkTargetTarget ? this.bulkTargetTarget.value : "",
    };
    const ok = await this.postTurboForm(this.bulkUrlValue, fields, {
      arrayField: "tracked_ids[]",
      arrayValues: ids,
      accept: "text/vnd.turbo-stream.html",
    });
    if (ok) {
      this.closeSheet();
      this.clear();
    }
  }

  async downloadCsv(ids) {
    const form = this.buildFormData(
      {
        bulk_action: "export",
        lane: this.laneValue || "all",
      },
      { arrayField: "tracked_ids[]", arrayValues: ids },
    );

    try {
      const response = await fetch(this.bulkUrlValue, {
        method: "POST",
        body: form,
        credentials: "same-origin",
        headers: {
          Accept: "text/csv, application/octet-stream",
          "X-Requested-With": "XMLHttpRequest",
        },
      });
      const type = response.headers.get("Content-Type") || "";
      if (!response.ok || type.includes("text/html") || type.includes("turbo-stream")) {
        return;
      }
      const cd = response.headers.get("Content-Disposition") || "";
      const match = cd.match(/filename="?([^";]+)"?/i);
      const filename = match?.[1] || "price-watch.csv";
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      this.closeSheet();
    } catch {
      // leave sheet open; user can retry
    }
  }

  async postTurbo(url, fields) {
    return this.postTurboForm(url, fields, {
      accept: "text/vnd.turbo-stream.html",
    });
  }

  async postTurboForm(url, fields, { arrayField, arrayValues, accept } = {}) {
    const form = this.buildFormData(fields, { arrayField, arrayValues });

    try {
      const response = await fetch(url, {
        method: "POST",
        body: form,
        credentials: "same-origin",
        headers: {
          Accept: accept || "text/vnd.turbo-stream.html",
          "X-Requested-With": "XMLHttpRequest",
        },
      });
      const html = await response.text();
      if (html && window.Turbo?.renderStreamMessage) {
        window.Turbo.renderStreamMessage(html);
      }
      return response.ok;
    } catch {
      return false;
    }
  }

  buildFormData(fields, { arrayField, arrayValues } = {}) {
    const form = new FormData();
    form.append("authenticity_token", this.csrf());
    Object.entries(fields || {}).forEach(([name, value]) => {
      if (value === undefined || value === null) return;
      form.append(name, String(value));
    });
    if (arrayField && arrayValues) {
      arrayValues.forEach((id) => form.append(arrayField, id));
    }
    return form;
  }

  csrf() {
    return document.querySelector("meta[name='csrf-token']")?.content || "";
  }
}
