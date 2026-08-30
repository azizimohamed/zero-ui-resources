import { Controller } from "@hotwired/stimulus";
import { Turbo } from "@hotwired/turbo-rails";

const MOBILE_MQ = "(max-width: 767px)";
const STORAGE_KEY = "crawlbench:matches:view";
const COOKIE_KEY = "crawlbench_matches_view";

const GRID_CLASSES = [
  "grid",
  "min-w-0",
  "grid-cols-1",
  "gap-2",
  "sm:gap-3",
  "sm:grid-cols-2",
  "xl:grid-cols-[repeat(auto-fill,minmax(260px,1fr))]",
];

export default class extends Controller {
  static targets = ["grid", "table", "gridBtn", "listBtn"];
  static values = {
    view: { type: String, default: "grid" },
    forced: { type: Boolean, default: false },
  };

  connect() {
    this.mq = window.matchMedia(MOBILE_MQ);
    this.boundMqChange = this.onMqChange.bind(this);
    this.mq.addEventListener("change", this.boundMqChange);
    // Server renders only one density, from the cookie. If the saved preference
    // or the breakpoint disagrees, sync the cookie and reload so the pane the
    // browser ends up showing is the one that has markup in it.
    const next = this.activeView();
    if (next !== this.viewValue) {
      this.persistAndReload(next, { remember: false });
      return;
    }
    this.syncChrome(next);
  }

  disconnect() {
    this.mq?.removeEventListener("change", this.boundMqChange);
  }

  onMqChange() {
    const next = this.activeView();
    if (next !== this.viewValue) this.persistAndReload(next, { remember: false });
  }

  activeView() {
    // The server pins the density for phone user agents whatever the width, so asking
    // for the other one here would reload against a pane that never changes.
    if (this.forcedValue) return this.viewValue;

    // Under the mobile breakpoint there is no toggle, so cards are the only
    // layout: a saved list preference stays saved for the desktop width.
    if (this.mq?.matches) return "grid";

    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === "list" || saved === "grid" ? saved : "grid";
  }

  showGrid(event) {
    event?.preventDefault();
    this.persistAndReload("grid");
  }

  showList(event) {
    event?.preventDefault();
    this.persistAndReload("list");
  }

  // remember: false is for viewport-driven switches, which must not overwrite the
  // density the user chose for the desktop width.
  persistAndReload(mode, { remember = true } = {}) {
    if (remember) localStorage.setItem(STORAGE_KEY, mode);
    document.cookie = `${COOKIE_KEY}=${mode}; path=/; max-age=31536000; SameSite=Lax`;
    if (mode === this.viewValue) {
      this.syncChrome(mode);
      return;
    }
    Turbo.visit(window.location.href, { action: "replace" });
  }

  syncChrome(mode) {
    const list = mode === "list";
    if (this.hasGridTarget) {
      this.gridTarget.classList.toggle("hidden", list);
      GRID_CLASSES.forEach((c) => this.gridTarget.classList.toggle(c, !list));
    }
    if (this.hasTableTarget) {
      this.tableTarget.classList.toggle("hidden", !list);
    }
    this.setViewButtonState(mode);
  }

  setViewButtonState(mode) {
    if (!this.hasGridBtnTarget) return;

    this.gridBtnTargets.forEach((btn) => {
      const on = mode === "grid";
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    this.listBtnTargets.forEach((btn) => {
      const on = mode === "list";
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }
}
