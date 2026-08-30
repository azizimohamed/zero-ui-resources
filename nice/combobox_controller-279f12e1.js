import { Controller } from "@hotwired/stimulus";
import {
  clearFixedDropdownStyles,
  positionFixedDropdown,
  restoreDropdownListPortal,
} from "fixed_dropdown_position";

// Searchable single-select combobox wrapping a native `<select>`.
// The underlying select stays in the DOM (visually hidden) so the form
// submits its `name` / value, validation runs, and other controllers'
// targets/actions on the select (e.g. vehicle-taxonomy) keep working.
const CLEAR_BUTTON_SVG =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';

// Markup:
//   <div data-controller="combobox" class="col gap-0.5 md:gap-1">
//     <label ...>Make</label>
//     <select data-combobox-target="select"
//             data-vehicle-taxonomy-target="make"
//             data-action="change->vehicle-taxonomy#onMakeChange"
//             ...>
//       <option value="">…</option>
//       <option value="Toyota">Toyota</option>
//     </select>
//   </div>
//
// On `connect` the controller hides the select, injects a text input + listbox,
// and keeps both in sync via `change` events and a MutationObserver on the
// select (so cascading option replacements are reflected automatically).
export default class extends Controller {
  static targets = ["select"];
  static values = {
    placeholder: { type: String, default: "Search…" },
    emptyText: { type: String, default: "No matches" },
  };

  connect() {
    if (!this.hasSelectTarget) return;

    this._removeInjectedUi();
    this._buildUI();
    this._bindEvents();
    this._observe();
    this._syncFromSelect();
    this._render("");
  }

  disconnect() {
    this._disconnectObserver();
    this._unbindListeners();
    this._removeInjectedUi();
    this._onDocClick = undefined;
    this._onSelectChange = undefined;
  }

  _disconnectObserver() {
    this._observer?.disconnect();
    this._observer = null;
  }

  _unbindListeners() {
    document.removeEventListener("click", this._onDocClick, true);
    this._stopReposition();
    if (this.hasSelectTarget && this._onSelectChange) {
      this.selectTarget.removeEventListener("change", this._onSelectChange);
    }
  }

  /** Turbo cache can restore injected markup; strip siblings before rebuild. */
  _removeInjectedUi() {
    if (this._list) {
      if (this._list.parentNode === document.body) {
        restoreDropdownListPortal(this._list);
      }
      clearFixedDropdownStyles(this._list);
    }
    let n = this.selectTarget?.nextElementSibling ?? null;
    while (n && n.classList?.contains("combobox-field")) {
      const toRemove = n;
      n = n.nextElementSibling;
      toRemove.remove();
    }
  }

  _initialPlaceholder(select) {
    const first = select.options[0];
    return first?.value ? this.placeholderValue : first?.text || this.placeholderValue;
  }

  _buildUI() {
    const select = this.selectTarget;
    select.classList.add("sr-only");
    select.tabIndex = -1;
    select.setAttribute("aria-hidden", "true");

    const input = document.createElement("input");
    input.type = "text";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.placeholder = this._initialPlaceholder(select);
    input.className = `${select.className.replace("sr-only", "").trim()} combobox-input`;
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-autocomplete", "list");
    input.disabled = select.disabled;

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "combobox-clear";
    clearBtn.setAttribute("aria-label", "Clear selection");
    clearBtn.hidden = true;
    clearBtn.innerHTML = CLEAR_BUTTON_SVG;

    const list = document.createElement("ul");
    list.className = "combobox-list";
    list.setAttribute("role", "listbox");
    list.hidden = true;

    // Wrapper acts as the listbox's offset parent so the dropdown sits flush
    // under the input rather than under the whole column (which can be
    // taller than the input when grid siblings stretch to equal height).
    const field = document.createElement("div");
    field.className = "combobox-field";
    field.append(input, clearBtn, list);
    select.insertAdjacentElement("afterend", field);

    this._input = input;
    this._clearBtn = clearBtn;
    this._list = list;
  }

  _bindEvents() {
    this._input.addEventListener("input", () => {
      this._render(this._input.value);
      this._open();
      this._updateClearVisibility();
    });
    this._input.addEventListener("focus", () => {
      // Select-all so the first keystroke replaces "All models" / a prior pick.
      queueMicrotask(() => this._input.select());
      this._render("");
      this._open();
    });
    // Re-select the committed label on click so caret placement cannot start a
    // character-by-character backspace through "All models".
    this._input.addEventListener("click", () => {
      if (this._isShowingCommittedLabel()) this._input.select();
    });
    this._input.addEventListener("keydown", (e) => this._onKey(e));
    this._list.addEventListener("mousedown", (e) => {
      const li = e.target.closest("[data-value]");
      if (!li) return;
      e.preventDefault();
      this._pickValue(li.dataset.value);
    });

    this._clearBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._clear();
    });

    this._onDocClick = (e) => {
      const t = e.target;
      if (this.element.contains(t) || this._list.contains(t)) return;
      this._close();
    };
    document.addEventListener("click", this._onDocClick, true);

    this._onSelectChange = () => this._syncFromSelect();
    this.selectTarget.addEventListener("change", this._onSelectChange);
  }

  _isShowingCommittedLabel() {
    const opt = this.selectTarget.options[this.selectTarget.selectedIndex];
    return !!(opt && opt.value !== "" && this._input.value === opt.text);
  }

  _clearInputForSearch() {
    this._input.value = "";
    this._render("");
    this._open();
    this._updateClearVisibility();
  }

  _observe() {
    this._observer = new MutationObserver(() => {
      // The other controller may set `value` *after* swapping options;
      // defer a tick so we read the final value, not the transient one.
      queueMicrotask(() => {
        this._syncFromSelect();
        if (!this._list.hidden) this._render(this._input.value);
      });
    });
    this._observer.observe(this.selectTarget, {
      childList: true,
      subtree: true,
    });
  }

  _syncFromSelect() {
    const opt = this.selectTarget.options[this.selectTarget.selectedIndex];
    this._input.value = opt && opt.value !== "" ? opt.text : "";
    this._updateClearVisibility();
  }

  _updateClearVisibility() {
    const sel = this.selectTarget.value !== "";
    const typed = this._input.value.trim() !== "";
    this._clearBtn.hidden = !(sel || typed);
  }

  _clear() {
    this.selectTarget.value = "";
    this.selectTarget.dispatchEvent(new Event("change", { bubbles: true }));
    this._syncFromSelect();
    this._close();
  }

  _options() {
    return Array.from(this.selectTarget.options).filter((o) => o.value !== "");
  }

  _render(query) {
    const q = query.trim().toLowerCase();
    const matches = this._options().filter((o) => o.text.toLowerCase().includes(q));
    if (matches.length === 0) {
      this._list.innerHTML = `<li class="combobox-empty">${this._escape(this.emptyTextValue)}</li>`;
      return;
    }
    const selected = this.selectTarget.value;
    this._list.innerHTML = matches
      .map((o, i) => {
        const cls = [
          "combobox-option",
          i === 0 ? "is-active" : "",
          o.value === selected ? "is-selected" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return `<li role="option" data-value="${this._escape(o.value)}" class="${cls}">${this._escape(o.text)}</li>`;
      })
      .join("");
  }

  _onKey(event) {
    // Committed label is atomic: Backspace/Delete clears the whole value so
    // users never end up with a half-deleted "All models" / prior pick.
    if ((event.key === "Backspace" || event.key === "Delete") && this._isShowingCommittedLabel()) {
      event.preventDefault();
      this._clearInputForSearch();
      return;
    }

    const items = Array.from(this._list.querySelectorAll("[data-value]"));
    let idx = items.findIndex((i) => i.classList.contains("is-active"));
    if (idx < 0) idx = 0;

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        this._open();
        this._highlight(items, Math.min(idx + 1, items.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        this._highlight(items, Math.max(idx - 1, 0));
        break;
      case "Enter":
        if (this._isOpen() && items[idx]) {
          event.preventDefault();
          this._pickValue(items[idx].dataset.value);
        }
        break;
      case "Escape":
        event.preventDefault();
        this._close();
        break;
      case "Tab":
        this._close();
        break;
    }
  }

  _highlight(items, idx) {
    items.forEach((item, i) => item.classList.toggle("is-active", i === idx));
    items[idx]?.scrollIntoView({ block: "nearest" });
  }

  _pickValue(value) {
    const select = this.selectTarget;
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    this._syncFromSelect();
    this._close();
  }

  /** Commit when typed text exactly matches one option; otherwise leave select unchanged. */
  _tryCommitExactMatch() {
    const typed = this._input.value.trim().toLowerCase();
    if (!typed) return;
    const matches = this._options().filter((o) => o.text.toLowerCase() === typed);
    if (matches.length !== 1) return;
    const value = matches[0].value;
    if (this.selectTarget.value === value) return;
    this.selectTarget.value = value;
    this.selectTarget.dispatchEvent(new Event("change", { bubbles: true }));
  }

  _positionList() {
    if (!this._input || !this._list) return;
    positionFixedDropdown(this._input.getBoundingClientRect(), this._list, {
      preferredMaxHeight: 240,
    });
  }

  _onReposition = () => {
    if (!this._isOpen()) return;
    this._positionList();
  };

  _onDocScroll = (e) => {
    if (!this._isOpen()) return;
    // Ignore scrolls originating inside the dropdown (user wheel + scrollIntoView).
    if (this._list === e.target || this._list.contains(e.target)) return;
    this._positionList();
  };

  _startReposition() {
    if (this._repositionActive) return;
    this._repositionActive = true;
    window.addEventListener("resize", this._onReposition);
    document.addEventListener("scroll", this._onDocScroll, true);
    window.visualViewport?.addEventListener("resize", this._onReposition);
    window.visualViewport?.addEventListener("scroll", this._onReposition);
  }

  _stopReposition() {
    if (!this._repositionActive) return;
    this._repositionActive = false;
    window.removeEventListener("resize", this._onReposition);
    document.removeEventListener("scroll", this._onDocScroll, true);
    window.visualViewport?.removeEventListener("resize", this._onReposition);
    window.visualViewport?.removeEventListener("scroll", this._onReposition);
  }

  _open() {
    this._list.hidden = false;
    this._positionList();
    this._startReposition();
    this._input.setAttribute("aria-expanded", "true");
  }

  _close() {
    if (!this._list || this._list.hidden) return;
    this._tryCommitExactMatch();
    this._syncFromSelect();
    this._list.hidden = true;
    restoreDropdownListPortal(this._list);
    clearFixedDropdownStyles(this._list);
    this._stopReposition();
    this._input.setAttribute("aria-expanded", "false");
  }

  _isOpen() {
    return !!this._list && !this._list.hidden;
  }

  _escape(s) {
    return String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  }
}
