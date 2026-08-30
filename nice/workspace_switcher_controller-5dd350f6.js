import { Controller } from "@hotwired/stimulus";
import {
  workspaceSwitcherBackdropSelector as BACKDROP_SEL,
  workspaceSwitcherCurrentSelector as CURRENT_SEL,
  workspaceSwitcherEmptyStateSelector as EMPTY_SEL,
  workspaceSwitcherFilterSelector as FILTER_SEL,
  workspaceSwitcherItemSelector as ITEM_SEL,
  workspaceSwitcherListSelector as LIST_SEL,
  workspaceSwitcherSwitchLabelSelector as SWITCH_LABEL_SEL,
} from "workspace_switcher_dom";

const DIALOG_SEL = '[role="dialog"]';

export default class extends Controller {
  connect() {
    this.refreshDomRefs();
    document.addEventListener("turbo:before-cache", this.boundBeforeCache);
  }

  disconnect() {
    document.removeEventListener("turbo:before-cache", this.boundBeforeCache);
    this.teardownDismissListeners();
    document.removeEventListener("keydown", this.onKeydown);
    this.close();
  }

  refreshDomRefs() {
    if (this.backdropEl && document.body.contains(this.backdropEl)) {
      this.filterEl = this.backdropEl.querySelector(FILTER_SEL) ?? null;
      return;
    }
    this.backdropEl = this.element.querySelector(BACKDROP_SEL);
    this.filterEl = this.backdropEl?.querySelector(FILTER_SEL) ?? null;
  }

  open() {
    this.refreshDomRefs();
    if (!this.backdropEl) return;

    this.moveBackdropToBody();
    this.refreshDomRefs();

    this.teardownDismissListeners();
    this.backdropEl.classList.remove("hidden");
    this.backdropEl.removeAttribute("aria-hidden");
    this.backdropEl.addEventListener("click", this.onBackdropClick);
    document.addEventListener("pointerdown", this.onOutsidePointerDown, true);
    document.addEventListener("keydown", this.onKeydown);

    if (this.filterEl) {
      this.filterEl.addEventListener("input", this.onFilterInput);
    }
    queueMicrotask(() => {
      this.filterEl?.focus();
      this.backdropEl?.querySelector(LIST_SEL)?.scrollTo({ top: 0 });
    });
  }

  close() {
    this.refreshDomRefs();
    this.teardownDismissListeners();

    if (this.filterEl) {
      this.filterEl.removeEventListener("input", this.onFilterInput);
    }
    if (this.backdropEl) {
      this.backdropEl.classList.add("hidden");
      this.backdropEl.setAttribute("aria-hidden", "true");
    }
    document.removeEventListener("keydown", this.onKeydown);
    this.restoreBackdropParent();

    if (this.filterEl) {
      this.filterEl.value = "";
      this.filterItems();
    }
  }

  teardownDismissListeners() {
    this.backdropEl?.removeEventListener("click", this.onBackdropClick);
    document.removeEventListener("pointerdown", this.onOutsidePointerDown, true);
  }

  onBackdropClick = (event) => {
    const dialog = this.backdropEl?.querySelector(DIALOG_SEL);
    if (dialog?.contains(event.target)) return;
    this.close();
  };

  onOutsidePointerDown = (event) => {
    const t = event.target;
    if (this.element.contains(t)) return;
    if (this.backdropEl?.contains(t)) return;
    this.close();
  };

  onKeydown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      this.close();
    }
  };

  onFilterInput = () => {
    this.filterItems();
  };

  boundBeforeCache = () => {
    this.close();
  };

  stopPanelClick(event) {
    event.stopPropagation();
  }

  moveBackdropToBody() {
    const el = this.backdropEl;
    if (!el || el.parentNode === document.body) return;
    this.backdropOriginalParent = el.parentNode;
    this.backdropOriginalNextSibling = el.nextSibling;
    document.body.appendChild(el);
  }

  restoreBackdropParent() {
    const el = this.backdropEl;
    if (!el || !this.backdropOriginalParent) return;
    const parent = this.backdropOriginalParent;
    const next = this.backdropOriginalNextSibling;
    this.backdropOriginalParent = null;
    this.backdropOriginalNextSibling = null;
    if (next && next.parentNode === parent) parent.insertBefore(el, next);
    else parent.appendChild(el);
  }

  filterItems() {
    const filter = this.filterEl;
    const q = (filter?.value ?? "").toLowerCase().trim();
    const hasQuery = q.length > 0;

    if (!this.backdropEl) return;

    const matches = (el) => {
      const hay = (el.dataset.workspaceSwitcherSearch || el.textContent || "").toLowerCase();
      return !hasQuery || hay.includes(q);
    };

    const currentEl = this.backdropEl.querySelector(CURRENT_SEL);
    if (currentEl) {
      currentEl.hidden = hasQuery && !matches(currentEl);
    }

    const items = this.backdropEl.querySelectorAll(ITEM_SEL);
    items.forEach((el) => {
      el.hidden = hasQuery && !matches(el);
    });

    const visibleItems = [...items].filter((el) => !el.hidden);
    const currentVisible = currentEl && !currentEl.hidden;
    const switchLabel = this.backdropEl.querySelector(SWITCH_LABEL_SEL);
    const emptyState = this.backdropEl.querySelector(EMPTY_SEL);
    const listEl = this.backdropEl.querySelector(LIST_SEL);
    const queryLabel = filter?.value.trim() ?? "";

    if (listEl && hasQuery) {
      listEl.scrollTo({ top: 0 });
    }

    if (switchLabel) {
      switchLabel.classList.toggle("hidden", hasQuery || visibleItems.length === 0);
    }

    if (emptyState) {
      const showEmpty = hasQuery && visibleItems.length === 0;
      emptyState.hidden = !showEmpty;
      if (showEmpty) {
        emptyState.textContent = currentVisible
          ? `No other workspaces match “${queryLabel}”.`
          : `No workspaces match “${queryLabel}”.`;
      } else {
        emptyState.textContent = "";
      }
    }
  }
}
