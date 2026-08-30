import { Controller } from "@hotwired/stimulus";
import { confirmAction } from "lib/confirm";

export default class extends Controller {
  static targets = ["selectAll", "row", "bulkAction", "bar", "count"];

  connect() {
    this._onCheckboxChange = this._onCheckboxChange.bind(this);
    this.element.addEventListener("change", this._onCheckboxChange);
    this.syncSelectAll();
    this.refreshBulkActionState();
  }

  disconnect() {
    this.element.removeEventListener("change", this._onCheckboxChange);
  }

  /** Form-level listener: select-all + row sync without racing data-action handlers */
  _onCheckboxChange(event) {
    if (this._syncingCheckboxes) return;

    const t = event.target;
    if (!(t instanceof HTMLInputElement) || t.type !== "checkbox") return;
    const isSelectAll = this.hasSelectAllTarget && t === this.selectAllTarget;
    const isRow = this.rowTargets.includes(t);
    if (!isSelectAll && !isRow) return;

    if (isSelectAll) {
      this._syncingCheckboxes = true;
      try {
        const on = t.checked;
        this.rowTargets.forEach((el) => {
          if (!el.disabled) el.checked = on;
        });
      } finally {
        this._syncingCheckboxes = false;
      }
    }

    this.syncSelectAll();
    this.refreshBulkActionState();
  }

  syncSelectAll() {
    if (!this.hasSelectAllTarget) return;

    const rows = this.rowTargets;
    if (rows.length === 0) {
      this.selectAllTarget.checked = false;
      this.selectAllTarget.indeterminate = false;
      return;
    }

    const enabled = rows.filter((el) => !el.disabled);
    const n = enabled.filter((el) => el.checked).length;
    this.selectAllTarget.checked = enabled.length > 0 && n === enabled.length;
    this.selectAllTarget.indeterminate = n > 0 && n < enabled.length;
  }

  refreshBulkActionState() {
    const selected = this.rowTargets.filter((el) => el.checked);
    const any = selected.length > 0;
    this.bulkActionTargets.forEach((btn) => {
      btn.disabled = !any;
    });
    if (this.hasBarTarget) {
      const n = selected.length;
      if (this.hasCountTarget) this.countTarget.textContent = String(n);
      this.barTarget.hidden = !any;
      this.barTarget.dataset.state = any ? "open" : "";
    }
  }

  clear(event) {
    event?.preventDefault();
    this._syncingCheckboxes = true;
    try {
      this.rowTargets.forEach((el) => {
        el.checked = false;
      });
      if (this.hasSelectAllTarget) this.selectAllTarget.checked = false;
    } finally {
      this._syncingCheckboxes = false;
    }
    this.syncSelectAll();
    this.refreshBulkActionState();
  }

  async confirmBulkDelete(event) {
    const n = this.#selectedCount();
    if (n === 0) return;
    const one = n === 1;
    await this.#confirmThenSubmit(event, {
      variant: "danger",
      title: one ? "Delete this monitor?" : `Delete ${n} monitors?`,
      message: one
        ? "This removes the monitor and everything it has collected. **It cannot be undone.**"
        : "This removes the monitors and everything they have collected. **It cannot be undone.**",
      confirmLabel: one ? "Delete monitor" : "Delete monitors",
      subject: this.#selectionSubject(),
      consequences: [
        one
          ? "Saved matches and their history are erased"
          : "Saved matches and history for each monitor are erased",
        one ? "Alert delivery for this monitor stops" : "Alert delivery for these monitors stops",
      ],
    });
  }

  async confirmBulkPause(event) {
    const n = this.#selectedCount();
    if (n === 0) return;
    const one = n === 1;
    await this.#confirmThenSubmit(event, {
      variant: "warning",
      title: one ? "Pause this monitor?" : `Pause ${n} monitors?`,
      message: "Scanning stops until you resume. Saved matches stay put.",
      confirmLabel: one ? "Pause monitor" : "Pause monitors",
      subject: this.#selectionSubject(),
    });
  }

  async confirmBulkActivate(event) {
    const n = this.#selectedCount();
    if (n === 0) return;
    const one = n === 1;
    await this.#confirmThenSubmit(event, {
      variant: "default",
      title: one ? "Activate this monitor?" : `Activate ${n} monitors?`,
      message: "Scanning starts on the next scan. You can pause anytime.",
      confirmLabel: one ? "Activate monitor" : "Activate monitors",
      subject: this.#selectionSubject(),
    });
  }

  async #confirmThenSubmit(event, options = {}) {
    event.preventDefault();
    const btn = event.currentTarget;
    if (!(await confirmAction(options))) return;
    btn.form?.requestSubmit(btn);
  }

  #selectedRows() {
    return this.rowTargets.filter((el) => el.checked);
  }

  #selectedCount() {
    return this.#selectedRows().length;
  }

  #selectedNames() {
    return this.#selectedRows().map((el) => el.dataset.monitorName?.trim() || "Monitor");
  }

  #selectionStatus() {
    const statuses = [
      ...new Set(this.#selectedRows().map((el) => el.dataset.monitorStatus || "draft")),
    ];
    if (statuses.length === 1) return statuses[0];
    return "draft";
  }

  #selectionSubject() {
    const names = this.#selectedNames();
    const n = names.length;
    if (n === 0) return null;
    if (n === 1) {
      return { name: names[0], meta: "1 monitor selected", status: this.#selectionStatus() };
    }
    const preview = names.slice(0, 2).join(" · ");
    const more = n > 2 ? ` · +${n - 2} more` : "";
    return {
      name: `${n} monitors`,
      meta: `${preview}${more}`,
      status: this.#selectionStatus(),
    };
  }
}
