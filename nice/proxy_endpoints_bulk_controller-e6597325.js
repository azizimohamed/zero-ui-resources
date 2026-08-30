import { Controller } from "@hotwired/stimulus";
import { confirmAction } from "lib/confirm";

export default class extends Controller {
  static targets = ["selectAll", "row", "bulkAction", "bar", "count", "countLabel", "clearButton"];

  connect() {
    this._onCheckboxChange = this._onCheckboxChange.bind(this);
    this.element.addEventListener("change", this._onCheckboxChange);
    this.syncSelectAll();
    this.refreshBulkActionState();
  }

  disconnect() {
    this.element.removeEventListener("change", this._onCheckboxChange);
  }

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
    const n = selected.length;
    this.bulkActionTargets.forEach((btn) => {
      btn.disabled = !any;
    });
    if (this.hasCountTarget) this.countTarget.textContent = String(n);
    if (this.hasCountLabelTarget) this.countLabelTarget.hidden = !any;
    if (this.hasClearButtonTarget) this.clearButtonTarget.hidden = !any;
    if (this.hasBarTarget) this.barTarget.dataset.state = any ? "open" : "";
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

  async confirmEnable(event) {
    const n = this.#selectedCount();
    if (n === 0) return;
    await this.#confirmThenSubmit(event, {
      variant: "default",
      title: n === 1 ? "Enable this endpoint?" : `Enable ${n} endpoints?`,
      message:
        "Enabled endpoints can be probed and, when Comet-healthy in a live pool, may enter the egress shortlist.",
      confirmLabel: n === 1 ? "Enable endpoint" : "Enable endpoints",
      subject: this.#selectionSubject(),
    });
  }

  async confirmDisable(event) {
    const n = this.#selectedCount();
    if (n === 0) return;
    await this.#confirmThenSubmit(event, {
      variant: "warning",
      title: n === 1 ? "Disable this endpoint?" : `Disable ${n} endpoints?`,
      message: "Disabled endpoints leave the live shortlist immediately and are skipped by Test.",
      confirmLabel: n === 1 ? "Disable endpoint" : "Disable endpoints",
      subject: this.#selectionSubject(),
    });
  }

  async confirmProbe(event) {
    const n = this.#selectedCount();
    if (n === 0) return;
    await this.#confirmThenSubmit(event, {
      variant: "default",
      title: n === 1 ? "Test this endpoint?" : `Test ${n} endpoints?`,
      message:
        "Queues reachability + Comet checks for enabled endpoints in the selection. Progress shows on this page.",
      confirmLabel: n === 1 ? "Test endpoint" : "Test endpoints",
      subject: this.#selectionSubject(),
    });
  }

  async confirmDelete(event) {
    const n = this.#selectedCount();
    if (n === 0) return;
    await this.#confirmThenSubmit(event, {
      variant: "danger",
      title: n === 1 ? "Delete this endpoint?" : `Delete ${n} endpoints?`,
      message:
        "Removes the endpoints and their probe history from this pool. This cannot be undone.",
      confirmLabel: n === 1 ? "Delete endpoint" : "Delete endpoints",
      subject: this.#selectionSubject(),
      consequences: [
        "Probe history for each selected endpoint is removed",
        "This cannot be undone",
      ],
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

  #selectionSubject() {
    const rows = this.#selectedRows();
    const n = rows.length;
    if (n === 0) return null;
    const labels = rows.map((el) => el.dataset.endpointLabel?.trim() || "Endpoint");
    if (n === 1) {
      return {
        name: labels[0],
        meta: "1 endpoint selected",
        status: rows[0].dataset.endpointStatus || "unknown",
      };
    }
    const preview = labels.slice(0, 2).join(" · ");
    const more = n > 2 ? ` · +${n - 2} more` : "";
    return {
      name: `${n} endpoints`,
      meta: `${preview}${more}`,
      status: "mixed",
    };
  }
}
