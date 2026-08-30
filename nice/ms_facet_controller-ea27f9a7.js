import { Controller } from "@hotwired/stimulus";
import { lockScroll, unlockScroll } from "lib/scroll_lock";
import {
  clearFixedDropdownStyles,
  positionFixedDropdown,
  restoreDropdownListPortal,
} from "fixed_dropdown_position";

const FACET_SHEET_LOCK = "ms-facet-sheet";
const MENU_WIDTH = 296;
const MENU_Z_INDEX = "48";
const MENU_SELECTOR = ".mf-menu";
const SEARCH_SELECTOR = "[data-ms-facet-target='search']";
const LIST_SELECTOR = "[data-ms-facet-target='list']";
const OPT_SELECTOR = "[data-ms-facet-target='opt']";

/**
 * Snapshot facet menus: search, keyboard nav, "/" opens Metro search.
 * Closed menus are real links; open state is progressive enhancement.
 * On narrow viewports, menus render as bottom sheets with a body backdrop.
 *
 * Desktop menus portal under document.body, so option/search nodes are queried
 * from the cached menu element instead of Stimulus targets.
 */
export default class extends Controller {
  connect() {
    this._onDocClick = this.onDocClick.bind(this);
    this._onDocKey = this.onDocKey.bind(this);
    this._onToggle = this.onToggle.bind(this);
    this._onViewportChange = this.positionSheet.bind(this);
    this._onSearchFocus = () => this.repositionPresentation();
    document.addEventListener("click", this._onDocClick);
    document.addEventListener("keydown", this._onDocKey);
    this.element.addEventListener("toggle", this._onToggle);
    this.bindSearchInput();
  }

  disconnect() {
    document.removeEventListener("click", this._onDocClick);
    document.removeEventListener("keydown", this._onDocKey);
    this.element.removeEventListener("toggle", this._onToggle);
    this.unbindSearchInput();
    this.teardownPresentation();
    if (this.element.open) {
      this.element.open = false;
    }
  }

  select(event) {
    this.optionEls().forEach((el) => el.classList.remove("is-on"));
    event.currentTarget.classList.add("is-on");
  }

  toggle(event) {
    event.preventDefault();
    const open = this.element.open;
    this.closeOthers();
    this.element.open = !open;
    if (this.element.open) this.searchInput()?.focus();
  }

  onToggle() {
    this.resetSearch();
    if (this.element.open) {
      this.presentOpen();
    } else {
      this.teardownPresentation();
    }
  }

  search() {
    const search = this.searchInput();
    if (!search || !this.listEl()) return;

    this.applySearchFilter(search.value.trim().toLowerCase());
    this.clearCursor();
  }

  keydown(event) {
    if (!this.element.open) return;

    const visible = this.visibleOpts();
    if (visible.length === 0) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      let idx = visible.findIndex((el) => el.classList.contains("is-cur"));
      if (event.key === "ArrowDown") {
        idx = idx < 0 ? 0 : Math.min(visible.length - 1, idx + 1);
      } else {
        idx = idx < 0 ? visible.length - 1 : Math.max(0, idx - 1);
      }
      this.clearCursor();
      visible[idx].classList.add("is-cur");
      visible[idx].scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter") {
      const cur = visible.find((el) => el.classList.contains("is-cur"));
      if (cur) {
        event.preventDefault();
        cur.click();
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      this.element.open = false;
    }
  }

  onDocClick(event) {
    if (!this.element.open) return;

    const menu = this.menuRoot();
    if (menu?.contains(event.target)) return;
    if (event.target.closest("summary")?.closest(".mf-pop") === this.element) return;

    this.element.open = false;
  }

  onDocKey(event) {
    if (event.key !== "/" || this.isTypingTarget(event.target)) return;

    const metro = document.querySelector("[data-ms-facet-dim-value='metro']");
    if (!metro) return;

    event.preventDefault();
    this.closeOthers();
    metro.open = true;
    this.controllerFor(metro)?.searchInput()?.focus();
  }

  closeOthers() {
    document.querySelectorAll(".mf-pop[open]").forEach((el) => {
      if (el !== this.element) el.open = false;
    });
  }

  presentOpen() {
    if (this.isMobile()) {
      this.openSheet();
      this.positionSheet();
    } else {
      this.openMenu();
    }
  }

  repositionPresentation() {
    if (!this.element.open) return;
    if (this.isMobile()) this.positionSheet();
    else this.positionMenu();
  }

  teardownPresentation() {
    this.clearSheetPosition(this.element);
    this.closeMenuFor(this.element);
    this.teardownSheetChromeIfIdle();
  }

  openMenu() {
    const menu = this.menuIn(this.element);
    if (!menu) return;

    this.menu = menu;
    this.bindMenuViewport();
    this.positionMenu();
    this.bindSearchInput();
  }

  closeMenuFor(details) {
    const menu = details === this.element ? this.menuRoot() : this.menuIn(details);
    if (!menu) return;

    restoreDropdownListPortal(menu);
    clearFixedDropdownStyles(menu);
    if (details === this.element) {
      this.menu = null;
      this.unbindMenuViewport();
    }
  }

  positionMenu() {
    const menu = this.menu;
    const summary = this.element.querySelector("summary");
    if (!menu || !summary || !this.element.open || this.isMobile()) return;

    positionFixedDropdown(summary.getBoundingClientRect(), menu, {
      gap: 6,
      margin: 8,
      align: "left",
      width: MENU_WIDTH,
      preferredMaxHeight: 262,
      zIndex: MENU_Z_INDEX,
    });
  }

  bindMenuViewport() {
    if (this.menuViewportBound) return;
    this._onMenuViewportChange = () => this.positionMenu();
    window.addEventListener("resize", this._onMenuViewportChange);
    window.addEventListener("scroll", this._onMenuViewportChange, true);
    window.visualViewport?.addEventListener("resize", this._onMenuViewportChange);
    window.visualViewport?.addEventListener("scroll", this._onMenuViewportChange);
    this.menuViewportBound = true;
  }

  unbindMenuViewport() {
    if (!this.menuViewportBound) return;
    window.removeEventListener("resize", this._onMenuViewportChange);
    window.removeEventListener("scroll", this._onMenuViewportChange, true);
    window.visualViewport?.removeEventListener("resize", this._onMenuViewportChange);
    window.visualViewport?.removeEventListener("scroll", this._onMenuViewportChange);
    this.menuViewportBound = false;
  }

  openSheet() {
    if (!this.isMobile()) return;

    const menu = this.menuIn(this.element);
    if (menu) this.menu = menu;
    this.bindSearchInput();

    lockScroll(FACET_SHEET_LOCK);
    this.ensureBackdrop();
    this.bindViewport();
    this.positionSheetFor(this.element);
  }

  teardownSheetChromeIfIdle() {
    if (document.querySelector(".mf-pop[open]")) return;

    unlockScroll(FACET_SHEET_LOCK);
    this.removeBackdrop();
    this.unbindViewport();
  }

  ensureBackdrop() {
    let backdrop = document.querySelector(".mf-sheet-backdrop");
    if (!backdrop) {
      backdrop = document.createElement("button");
      backdrop.type = "button";
      backdrop.className = "mf-sheet-backdrop";
      backdrop.setAttribute("aria-label", "Close filter menu");
      backdrop.addEventListener("click", () => {
        document.querySelectorAll(".mf-pop[open]").forEach((el) => {
          el.open = false;
        });
      });
      document.body.appendChild(backdrop);
    }
    this.backdrop = backdrop;
  }

  removeBackdrop() {
    if (document.querySelector(".mf-pop[open]")) return;
    document.querySelector(".mf-sheet-backdrop")?.remove();
    this.backdrop = null;
  }

  bindViewport() {
    if (this.viewportBound) return;
    window.visualViewport?.addEventListener("resize", this._onViewportChange);
    window.visualViewport?.addEventListener("scroll", this._onViewportChange);
    this.viewportBound = true;
  }

  unbindViewport() {
    if (!this.viewportBound) return;
    window.visualViewport?.removeEventListener("resize", this._onViewportChange);
    window.visualViewport?.removeEventListener("scroll", this._onViewportChange);
    this.viewportBound = false;
  }

  positionSheet() {
    const open = document.querySelector(".mf-pop[open]");
    if (open) this.positionSheetFor(open);
  }

  positionSheetFor(details) {
    if (!this.isMobile() || !details?.open) return;

    const menu = this.menuIn(details);
    if (!menu) return;

    const viewport = window.visualViewport;
    if (!viewport) {
      menu.style.removeProperty("bottom");
      menu.style.removeProperty("max-height");
      return;
    }

    const keyboardInset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
    menu.style.bottom = `${Math.max(10, keyboardInset)}px`;
    menu.style.maxHeight = `${Math.min(viewport.height - 20, window.innerHeight * 0.78)}px`;
  }

  clearSheetPosition(details) {
    const menu = this.menuIn(details);
    if (!menu) return;
    menu.style.removeProperty("bottom");
    menu.style.removeProperty("max-height");
  }

  controllerFor(element) {
    return this.application.getControllerForElementAndIdentifier(element, "ms-facet");
  }

  menuIn(root) {
    return root?.querySelector(MENU_SELECTOR) ?? null;
  }

  menuRoot() {
    return this.menu || this.menuIn(this.element);
  }

  searchInput() {
    return this.menuRoot()?.querySelector(SEARCH_SELECTOR) ?? null;
  }

  listEl() {
    return this.menuRoot()?.querySelector(LIST_SELECTOR) ?? null;
  }

  optionEls() {
    const root = this.menuRoot();
    if (!root) return [];
    return Array.from(root.querySelectorAll(OPT_SELECTOR));
  }

  visibleOpts() {
    return this.optionEls().filter((el) => !el.hidden);
  }

  clearCursor() {
    this.optionEls().forEach((el) => el.classList.remove("is-cur"));
  }

  resetSearch() {
    const search = this.searchInput();
    if (search) search.value = "";
    this.applySearchFilter("");
    this.clearCursor();
  }

  applySearchFilter(query) {
    this.optionEls().forEach((opt) => {
      const label = opt.dataset.label || "";
      opt.hidden = query.length > 0 && !label.includes(query);
    });
  }

  bindSearchInput() {
    const search = this.searchInput();
    if (!search || search === this._boundSearch) return;

    this.unbindSearchInput();
    this._boundSearch = search;
    this._onSearchInput = () => this.search();
    this._onSearchKeydown = (event) => this.keydown(event);
    search.addEventListener("focus", this._onSearchFocus);
    search.addEventListener("input", this._onSearchInput);
    search.addEventListener("keydown", this._onSearchKeydown);
  }

  unbindSearchInput() {
    if (!this._boundSearch) return;

    this._boundSearch.removeEventListener("focus", this._onSearchFocus);
    this._boundSearch.removeEventListener("input", this._onSearchInput);
    this._boundSearch.removeEventListener("keydown", this._onSearchKeydown);
    this._boundSearch = null;
    this._onSearchInput = null;
    this._onSearchKeydown = null;
  }

  isMobile() {
    return window.matchMedia("(max-width: 700px)").matches;
  }

  isTypingTarget(target) {
    if (!(target instanceof Element)) return false;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
  }
}
