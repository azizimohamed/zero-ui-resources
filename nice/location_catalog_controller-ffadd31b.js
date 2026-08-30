import { Controller } from "@hotwired/stimulus";
import {
  clearFixedDropdownStyles,
  positionFixedDropdown,
  restoreDropdownListPortal,
  visualLayout,
} from "fixed_dropdown_position";

/** Mirrors `search_profile[location_mode]` values from the form. */
const LOCATION_MODE = Object.freeze({
  SINGLE_CITY: "single_city",
  MULTI_CITY: "multi_city",
  ALL_CITIES: "all_cities",
});

const CITY_SEARCH_PLACEHOLDER = Object.freeze({
  multi: "Search cities to add…",
  single: "Search to pick a city…",
});

const HTML_ESCAPE_MAP = Object.freeze({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
});

const COMBOBOX_EMPTY_LIST_HTML =
  '<li class="combobox-empty" role="presentation">No matching cities</li>';

/** Lucide-style check; only inserted in multi-city mode for selected rows. */
const CITY_PICKER_TICK_SVG = `<span class="city-picker-option-tick" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="city-picker-option-tick-svg"><path d="M20 6 9 17l-5-5"/></svg></span>`;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => HTML_ESCAPE_MAP[c]);
}

/** @param {Array<{ id: unknown, name: unknown }>} rows */
function filterRowsByNormalizedQuery(rows, normalizedQuery) {
  const q = normalizedQuery.trim().toLowerCase();
  return rows.filter((r) => String(r.name).toLowerCase().includes(q));
}

// Country → catalog cities with searchable picker (single or multi city) and
// "all anchor cities" mode that hides city selection. Keeps a native
// `<select multiple>` in sync for form submission and HTML5 `required`.
export default class extends Controller {
  static targets = [
    "country",
    "cities",
    "locationMode",
    "cityFields",
    "allCitiesBanner",
    "allCitiesBannerCountry",
    "search",
    "list",
    "chips",
  ];

  static values = {
    catalog: { type: Object, default: {} },
    catalogUrl: { type: String, default: "" },
    // Wizard design: search + accent chips + dashed "+ City" pills (no portaled dropdown).
    inlineSuggestions: { type: Boolean, default: false },
  };

  static INLINE_SUGGESTION_LIMIT = 8;

  async connect() {
    if (!this.hasCountryTarget || !this.hasCitiesTarget) return;

    // Stimulus targets only match descendants of this.element; the city list is
    // portaled to document.body while open, so resolve once and keep a node ref.
    this._listNode = this.hasListTarget ? this.listTarget : null;

    this._abortPicker = null;
    this._onDocPointerDown = null;
    this._onDocFocusIn = null;
    this._bindPicker();

    const country = this.countryTarget.value;
    const initial = this._selectedIdsFromSelect();
    try {
      await this._ensureCatalogForCountry(country);
    } catch {
      // Keep server-rendered <select> options when prefetch fails.
    }
    if (this._catalogRowsForCountry(country).length > 0 || this.citiesTarget.options.length === 0) {
      this.populateCities(country, initial);
    } else {
      this._afterSelectSync();
    }
    this.onModeChange();
    this._syncAllCitiesBannerCountry();
  }

  disconnect() {
    this._stopReposition();
    this._abortPicker?.abort();
    this._abortPicker = null;
    if (this._onDocPointerDown) {
      document.removeEventListener("pointerdown", this._onDocPointerDown, true);
      this._onDocPointerDown = null;
    }
    if (this._onDocFocusIn) {
      document.removeEventListener("focusin", this._onDocFocusIn, true);
      this._onDocFocusIn = null;
    }
    if (this._listNode) {
      if (this._listNode.parentNode === document.body) {
        restoreDropdownListPortal(this._listNode);
      }
      clearFixedDropdownStyles(this._listNode);
    }
  }

  async onCountryChange() {
    if (!this.hasCitiesTarget || !this.hasCountryTarget) return;
    await this._ensureCatalogForCountry(this.countryTarget.value);
    this.populateCities(this.countryTarget.value, []);
    if (this.hasSearchTarget) this.searchTarget.value = "";
    this._syncAllCitiesBannerCountry();
    this._afterSelectSync();
  }

  onModeChange() {
    const all = this._isAllCitiesMode();

    if (this.hasCityFieldsTarget) {
      // `.wiz-field { display: flex }` beats Tailwind `.hidden`; use attribute + class.
      this.cityFieldsTarget.classList.toggle("hidden", all);
      this.cityFieldsTarget.toggleAttribute("hidden", all);
    }
    if (this.hasAllCitiesBannerTarget) {
      // Use the `hidden` attribute so visibility survives `.coverage-note { display: flex }` (Tailwind `.hidden` does not).
      this.allCitiesBannerTarget.toggleAttribute("hidden", !all);
    }

    if (all) {
      this._clearAllSelections();
      if (this.hasSearchTarget) this.searchTarget.value = "";
      this._closeList();
    }

    this._syncSearchPlaceholder();
    this._syncListMultiselectable();

    this._afterSelectSync();
    this._applyPickerDisabledState();
  }

  populateCities(countryCode, preferredIds) {
    if (!this.hasCitiesTarget || !this.hasCountryTarget) return;

    const rows = this._catalogRowsForCountry(countryCode);
    const select = this.citiesTarget;
    const valid = new Set(rows.map((r) => String(r.id)));

    select.replaceChildren();

    rows.forEach((r) => {
      const opt = document.createElement("option");
      opt.value = String(r.id);
      opt.textContent = String(r.name);
      select.appendChild(opt);
    });

    const preserve = (preferredIds || []).map((id) => String(id)).filter((id) => valid.has(id));

    this._selectOptionsByValues(select, preserve);

    this._emitSelectChange(select);
    this._afterSelectSync();
  }

  _bindPicker() {
    if (!this.hasSearchTarget || !this._listNode) return;

    this._abortPicker = new AbortController();
    const sig = { signal: this._abortPicker.signal };

    const refreshOpenList = () => {
      if (this._isPickerInert()) return;
      this._renderList(this._normalizedSearchQuery());
      this._openList();
    };

    this.searchTarget.addEventListener("input", refreshOpenList, sig);
    this.searchTarget.addEventListener("focus", refreshOpenList, sig);

    this.searchTarget.addEventListener("keydown", (e) => this._onSearchKeydown(e), sig);

    this._listNode.addEventListener(
      "mousedown",
      (e) => {
        if (this._isListInteractionBlocked()) return;
        const li = e.target.closest("[data-id]");
        if (!li) return;
        e.preventDefault();
        this._pickCity(li.dataset.id);
      },
      sig,
    );

    this._onDocPointerDown = (e) => this._closeListIfOutsidePicker(e.target);
    document.addEventListener("pointerdown", this._onDocPointerDown, true);

    this._onDocFocusIn = (e) => this._closeListIfOutsidePicker(e.target);
    document.addEventListener("focusin", this._onDocFocusIn, true);
  }

  _startReposition() {
    if (this._repositionAbort) return;
    this._repositionAbort = new AbortController();
    const sig = { signal: this._repositionAbort.signal };

    const reposition = () => {
      if (!this._listOpen()) return;
      this._positionList();
    };
    const onDocScroll = (e) => {
      if (!this._listOpen()) return;
      if (this._listNode === e.target || this._listNode.contains(e.target)) return;
      this._positionList();
    };

    window.addEventListener("resize", reposition, sig);
    document.addEventListener("scroll", onDocScroll, { capture: true, ...sig });
    window.visualViewport?.addEventListener("resize", reposition, sig);
    window.visualViewport?.addEventListener("scroll", reposition, sig);
  }

  _stopReposition() {
    this._repositionAbort?.abort();
    this._repositionAbort = null;
  }

  /** Combobox: search field, suggestion list, and chips — not the whole location section. */
  _eventOnPickerSurface(node) {
    if (!node || !(node instanceof Node)) return false;
    if (this.hasSearchTarget && this.searchTarget.contains(node)) return true;
    if (this._listNode && this._listNode.contains(node)) return true;
    if (this.hasChipsTarget && this.chipsTarget.contains(node)) return true;
    return false;
  }

  _closeListIfOutsidePicker(eventTarget) {
    if (this.inlineSuggestionsValue) return;
    if (!this._listOpen()) return;
    if (this._eventOnPickerSurface(eventTarget)) return;
    this._closeList();
  }

  /** True when the typeahead cannot accept input (all-cities mode or search disabled). */
  _isPickerInert() {
    return this._isAllCitiesMode() || (this.hasSearchTarget && this.searchTarget.disabled);
  }

  _isListInteractionBlocked() {
    return this._isAllCitiesMode() || this._listNode?.getAttribute("aria-disabled") === "true";
  }

  _onSearchKeydown(event) {
    if (this._isPickerInert()) return;

    const items = Array.from(this._listNode.querySelectorAll("[data-id]"));
    let idx = items.findIndex((i) => i.classList.contains("is-active"));
    if (idx < 0) idx = 0;

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        this._openList();
        this._highlight(items, Math.min(idx + 1, items.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        this._highlight(items, Math.max(idx - 1, 0));
        break;
      case "Enter":
        // Always stop default: this field sits in a form, so bare Enter would
        // submit and dump the wizard back to step 1.
        event.preventDefault();
        if (!this._listOpen() || items.length === 0) return;
        this._pickCity(items[idx]?.dataset?.id);
        break;
      case "Escape":
        event.preventDefault();
        this._closeList();
        break;
      case "Tab":
        this._closeList();
        break;
    }
  }

  _highlight(items, i) {
    items.forEach((el, j) => el.classList.toggle("is-active", j === i));
    items[i]?.scrollIntoView({ block: "nearest" });
  }

  _pickCity(id) {
    if (!id || this._isAllCitiesMode()) return;

    const sid = String(id);
    const select = this.citiesTarget;

    if (this._isSingleCityMode()) {
      Array.from(select.options).forEach((o) => {
        o.selected = o.value === sid;
      });
    } else {
      const opt = Array.from(select.options).find((o) => o.value === sid);
      if (opt) opt.selected = !opt.selected;
    }

    this._emitSelectChange(select);
    this._afterSelectSync();

    if (this.inlineSuggestionsValue && this.hasSearchTarget) {
      this.searchTarget.value = "";
      this._renderInlineSuggestions("");
      return;
    }

    if (this._isSingleCityMode() && this.hasSearchTarget) {
      this.searchTarget.value = "";
      this._closeList();
    }
  }

  _removeCity(id) {
    const opt = Array.from(this.citiesTarget.options).find((o) => o.value === String(id));
    if (opt) opt.selected = false;
    this._emitSelectChange(this.citiesTarget);
    this._afterSelectSync();
  }

  _renderChips() {
    if (!this.hasChipsTarget) return;

    this.chipsTarget.replaceChildren();
    if (this._isAllCitiesMode()) return;

    Array.from(this.citiesTarget.selectedOptions).forEach((opt) => {
      this.chipsTarget.appendChild(this._buildCityChip(opt));
    });
  }

  _buildCityChip(opt) {
    const wrap = document.createElement("span");
    if (this.inlineSuggestionsValue) {
      wrap.className = "chipx acc";
      wrap.append(document.createTextNode(opt.text));
      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("aria-label", `Remove ${opt.text}`);
      btn.textContent = "×";
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        if (this._isAllCitiesMode() || btn.disabled) return;
        this._removeCity(opt.value);
      });
      wrap.append(btn);
      return wrap;
    }

    wrap.className = "city-picker-chip";
    const label = document.createElement("span");
    label.className = "city-picker-chip-label";
    label.textContent = opt.text;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "city-picker-chip-remove";
    btn.setAttribute("aria-label", `Remove ${opt.text}`);
    btn.textContent = "×";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      if (this._isAllCitiesMode() || btn.disabled) return;
      this._removeCity(opt.value);
    });
    wrap.append(label, btn);
    return wrap;
  }

  _renderList(query) {
    if (!this._listNode || this._isAllCitiesMode()) return;

    if (this.inlineSuggestionsValue) {
      this._renderInlineSuggestions(query);
      return;
    }

    const rows = this._catalogRowsForCountry(this.countryTarget.value);
    const filtered = filterRowsByNormalizedQuery(rows, query);

    if (filtered.length === 0) {
      this._listNode.innerHTML = COMBOBOX_EMPTY_LIST_HTML;
      return;
    }

    const multi = this._isMultiCityMode();
    const selected = new Set(this._selectedIdsFromSelect());
    this._listNode.innerHTML = filtered
      .map((r, i) => {
        const id = String(r.id);
        const sel = selected.has(id);
        const cls = [
          "combobox-option",
          "city-picker-option",
          i === 0 ? "is-active" : "",
          sel ? "is-selected" : "",
        ]
          .filter(Boolean)
          .join(" ");
        const tick = multi && sel ? CITY_PICKER_TICK_SVG : "";
        const label = escapeHtml(String(r.name));
        return `<li role="option" aria-selected="${sel}" data-id="${escapeHtml(id)}" class="${cls}"><span class="city-picker-option-text">${label}</span>${tick}</li>`;
      })
      .join("");
  }

  _renderInlineSuggestions(query) {
    const rows = this._catalogRowsForCountry(this.countryTarget.value);
    const selected = new Set(this._selectedIdsFromSelect());
    const filtered = filterRowsByNormalizedQuery(rows, query).filter(
      (r) => !selected.has(String(r.id)),
    );
    const limited = filtered.slice(0, this.constructor.INLINE_SUGGESTION_LIMIT);

    if (limited.length === 0) {
      this._listNode.innerHTML = query
        ? `<li class="wiz-city-picker-empty" role="presentation">No matching cities</li>`
        : "";
      return;
    }

    this._listNode.innerHTML = limited
      .map((r, i) => {
        const id = String(r.id);
        const label = escapeHtml(String(r.name));
        const active = i === 0 ? " is-active" : "";
        return `<li role="option" aria-selected="false" data-id="${escapeHtml(id)}" class="wiz-city-picker-option${active}"><button type="button" class="city-add">+ ${label}</button></li>`;
      })
      .join("");
  }

  _syncAllCitiesBannerCountry() {
    if (!this.hasAllCitiesBannerCountryTarget || !this.hasCountryTarget) return;

    const opt = this.countryTarget.selectedOptions?.[0];
    const label = opt?.textContent?.trim() || this.countryTarget.value;
    this.allCitiesBannerCountryTarget.textContent = label;
  }

  _afterSelectSync() {
    this._renderChips();
    if (this._isAllCitiesMode()) return;
    this._renderList(this._normalizedSearchQuery());
    if (this.inlineSuggestionsValue) this._openList();
  }

  /** Trims and lowercases the city search field (for filtering). */
  _normalizedSearchQuery() {
    return this.hasSearchTarget ? this.searchTarget.value.trim().toLowerCase() : "";
  }

  _catalogRowsForCountry(countryCode) {
    return this.catalogValue[countryCode] || [];
  }

  async _ensureCatalogForCountry(countryCode) {
    const code = String(countryCode || "").toUpperCase();
    if (!code) return;
    if ((this.catalogValue[code] || []).length > 0) return;
    if (!this.catalogUrlValue) return;

    const url = new URL(this.catalogUrlValue, window.location.origin);
    url.searchParams.set("country", code);
    const resp = await fetch(url, {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
    if (!resp.ok) return;

    const rows = await resp.json();
    this.catalogValue = { ...this.catalogValue, [code]: rows };
  }

  _selectedIdsFromSelect() {
    return Array.from(this.citiesTarget.selectedOptions).map((o) => o.value.toString());
  }

  _clearAllSelections() {
    Array.from(this.citiesTarget.options).forEach((o) => {
      o.selected = false;
    });
    this._emitSelectChange(this.citiesTarget);
  }

  _locationMode() {
    return this.hasLocationModeTarget ? this.locationModeTarget.value : "";
  }

  _isAllCitiesMode() {
    return this._locationMode() === LOCATION_MODE.ALL_CITIES;
  }

  _isSingleCityMode() {
    return this._locationMode() === LOCATION_MODE.SINGLE_CITY;
  }

  _isMultiCityMode() {
    return this._locationMode() === LOCATION_MODE.MULTI_CITY;
  }

  _syncSearchPlaceholder() {
    if (!this.hasSearchTarget) return;
    this.searchTarget.placeholder = this._isMultiCityMode()
      ? CITY_SEARCH_PLACEHOLDER.multi
      : CITY_SEARCH_PLACEHOLDER.single;
  }

  _syncListMultiselectable() {
    if (!this._listNode) return;
    this._listNode.setAttribute("aria-multiselectable", this._isMultiCityMode() ? "true" : "false");
  }

  /** Cities picker is inactive in all-anchor mode; native disabled + aria-disabled on list/chips. */
  _applyPickerDisabledState() {
    const disabled = this._isAllCitiesMode();

    if (this.hasSearchTarget) {
      this.searchTarget.disabled = disabled;
    }

    if (this._listNode) {
      if (disabled) {
        this._listNode.setAttribute("aria-disabled", "true");
        this._listNode.classList.add("pointer-events-none", "opacity-60");
      } else {
        this._listNode.removeAttribute("aria-disabled");
        this._listNode.classList.remove("pointer-events-none", "opacity-60");
      }
    }

    if (this.hasChipsTarget) {
      if (disabled) {
        this.chipsTarget.setAttribute("aria-disabled", "true");
      } else {
        this.chipsTarget.removeAttribute("aria-disabled");
      }
      const removeButtons = this.inlineSuggestionsValue
        ? this.chipsTarget.querySelectorAll("button")
        : this.chipsTarget.querySelectorAll("button.city-picker-chip-remove");
      removeButtons.forEach((btn) => {
        btn.disabled = disabled;
        if (disabled) btn.setAttribute("aria-disabled", "true");
        else btn.removeAttribute("aria-disabled");
      });
    }
  }

  _selectOptionsByValues(select, values) {
    const want = new Set(values);
    for (const id of want) {
      const opt = Array.from(select.options).find((o) => o.value === id);
      if (opt) opt.selected = true;
    }
  }

  _emitSelectChange(select) {
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  _positionList() {
    if (!this.hasSearchTarget || !this._listNode) return;
    // Prefer visual viewport so max-height fits above the soft keyboard.
    const preferred = Math.min(Math.round(0.4 * visualLayout().height), 280);
    positionFixedDropdown(this.searchTarget.getBoundingClientRect(), this._listNode, {
      preferredMaxHeight: preferred,
    });
  }

  _openList() {
    if (!this._listNode || this._isAllCitiesMode()) return;
    this._listNode.hidden = false;
    if (this.inlineSuggestionsValue) return;
    this._positionList();
    this._startReposition();
  }

  _closeList() {
    if (!this._listNode) return;
    // Inline suggestions stay in-flow (design); only clear the portaled dropdown.
    if (this.inlineSuggestionsValue) {
      if (!this._isAllCitiesMode()) {
        this._listNode.hidden = false;
        this._renderInlineSuggestions(this._normalizedSearchQuery());
      } else {
        this._listNode.hidden = true;
        this._listNode.innerHTML = "";
      }
      return;
    }
    this._listNode.hidden = true;
    restoreDropdownListPortal(this._listNode);
    clearFixedDropdownStyles(this._listNode);
    this._stopReposition();
  }

  _listOpen() {
    return !!this._listNode && !this._listNode.hidden;
  }
}
