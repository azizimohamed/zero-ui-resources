import { Controller } from "@hotwired/stimulus";
import { MOBILE_BP_SM_PX } from "mobile_shell";

const STORAGE_KEY_DEFAULT = "crawlbench-sidebar";
const COLLAPSED = "collapsed";
const EXPANDED = "expanded";

/** Desktop icon-rail collapse for sidebars (mobile drawer stays separate). */
export default class extends Controller {
  static targets = ["toggle"];
  static values = {
    desktopMinPx: { type: Number, default: MOBILE_BP_SM_PX },
    storageKey: { type: String, default: STORAGE_KEY_DEFAULT },
    datasetKey: { type: String, default: "sidebar" },
  };

  connect() {
    this.onMediaChange = this.onMediaChange.bind(this);
    this.onDocumentKeydown = this.onDocumentKeydown.bind(this);
    this.mq = window.matchMedia(`(min-width: ${this.desktopMinPxValue}px)`);
    this.mq.addEventListener("change", this.onMediaChange);
    document.addEventListener("keydown", this.onDocumentKeydown);

    this.apply(this.readStored(), { persist: false });
    this.syncChrome();
  }

  disconnect() {
    this.mq.removeEventListener("change", this.onMediaChange);
    document.removeEventListener("keydown", this.onDocumentKeydown);
    this.clearRailTitles();
  }

  toggle() {
    if (!this.isDesktop()) return;
    this.apply(this.isCollapsed() ? EXPANDED : COLLAPSED);
  }

  onMediaChange() {
    this.syncChrome();
  }

  onDocumentKeydown(event) {
    if (!this.isDesktop()) return;
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key !== "[") return;
    if (this.isTypingTarget(event.target)) return;
    if (this.isDialogContext(event.target)) return;
    event.preventDefault();
    this.toggle();
  }

  apply(mode, { persist = true } = {}) {
    const next = mode === COLLAPSED ? COLLAPSED : EXPANDED;
    document.documentElement.dataset[this.datasetKeyValue] = next;
    if (persist) {
      try {
        window.localStorage.setItem(this.storageKeyValue, next);
      } catch {
        /* private mode / quota */
      }
    }
    this.syncChrome();
  }

  readStored() {
    try {
      const stored = window.localStorage.getItem(this.storageKeyValue);
      if (stored === COLLAPSED || stored === EXPANDED) return stored;
    } catch {
      /* ignore */
    }
    return document.documentElement.dataset[this.datasetKeyValue] === COLLAPSED
      ? COLLAPSED
      : EXPANDED;
  }

  isCollapsed() {
    return document.documentElement.dataset[this.datasetKeyValue] === COLLAPSED;
  }

  isDesktop() {
    return this.mq.matches;
  }

  syncChrome() {
    const collapsed = this.isCollapsed();
    const desktop = this.isDesktop();
    this.toggleTargets.forEach((el) => {
      el.setAttribute("aria-expanded", collapsed ? "false" : "true");
      el.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
      el.setAttribute(
        "title",
        collapsed ? "Expand sidebar (press [)" : "Collapse sidebar (press [)",
      );
      el.hidden = !desktop;
    });
    if (desktop && collapsed) this.applyRailTitles();
    else this.clearRailTitles();
  }

  applyRailTitles() {
    this.element.querySelectorAll("[data-rail-label]").forEach((el) => {
      if (!(el instanceof HTMLElement)) return;
      if (!el.dataset.railTitleSaved) {
        el.dataset.railTitleSaved = el.hasAttribute("title") ? el.getAttribute("title") || "" : "";
      }
      const label = el.getAttribute("data-rail-label")?.trim();
      if (label) el.setAttribute("title", label);
    });
  }

  clearRailTitles() {
    this.element.querySelectorAll("[data-rail-label]").forEach((el) => {
      if (!(el instanceof HTMLElement) || !("railTitleSaved" in el.dataset)) return;
      const saved = el.dataset.railTitleSaved;
      if (saved) el.setAttribute("title", saved);
      else el.removeAttribute("title");
      delete el.dataset.railTitleSaved;
    });
  }

  isTypingTarget(target) {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  }

  isDialogContext(target) {
    if (!(target instanceof Element)) return false;
    return !!target.closest('[role="dialog"], [aria-modal="true"]');
  }
}
