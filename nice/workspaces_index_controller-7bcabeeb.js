import { Controller } from "@hotwired/stimulus";

const ROW_SEL = "[data-workspaces-index-row]";
const GROUP_SEL = "[data-workspaces-index-group]";
const EMPTY_SEL = "[data-workspaces-index-empty]";

export default class extends Controller {
  static targets = ["filter", "list"];

  connect() {
    this.onKeydown = this.onKeydown.bind(this);
    document.addEventListener("keydown", this.onKeydown);
  }

  disconnect() {
    document.removeEventListener("keydown", this.onKeydown);
  }

  filter() {
    const q = (this.hasFilterTarget ? this.filterTarget.value : "").toLowerCase().trim();
    const hasQuery = q.length > 0;
    const rows = this.element.querySelectorAll(ROW_SEL);

    rows.forEach((el) => {
      const hay = (el.dataset.workspacesIndexSearch || el.textContent || "").toLowerCase();
      el.hidden = hasQuery && !hay.includes(q);
    });

    this.element.querySelectorAll(GROUP_SEL).forEach((group) => {
      const visible = [...group.querySelectorAll(ROW_SEL)].some((row) => !row.hidden);
      group.hidden = !visible;
    });

    const emptyEl = this.element.querySelector(EMPTY_SEL);
    if (!emptyEl) return;

    const anyVisible = [...rows].some((row) => !row.hidden);
    const showEmpty = hasQuery && !anyVisible;
    emptyEl.hidden = !showEmpty;
    if (showEmpty) {
      emptyEl.textContent = `No workspaces match “${this.filterTarget.value.trim()}”.`;
    } else {
      emptyEl.textContent = "";
    }
  }

  onKeydown(event) {
    if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
    if (!this.hasFilterTarget) return;

    const tag = (event.target?.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || event.target?.isContentEditable) return;

    event.preventDefault();
    this.filterTarget.focus();
  }
}
