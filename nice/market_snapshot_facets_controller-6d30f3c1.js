import { Controller } from "@hotwired/stimulus";

/**
 * Optimistic facet bar state: summaries, menu highlights, and active-slice row
 * update on click without waiting for a full page reload (facets sit outside the Turbo frame).
 */
export default class extends Controller {
  static targets = [
    "leadCount",
    "idleText",
    "tokenMetro",
    "tokenMetroLabel",
    "tokenMetroClear",
    "tokenPrice",
    "tokenPriceLabel",
    "tokenPriceClear",
    "tokenModel",
    "tokenModelLabel",
    "tokenModelClear",
    "resetAll",
  ];

  static values = {
    window: Number,
    monitorUrl: String,
    resetUrl: String,
    msCity: String,
    msPriceMin: String,
    msPriceMax: String,
    msModel: String,
    metroLabel: String,
    priceLabel: String,
    modelLabel: String,
  };

  connect() {
    this._onClick = this.onNavClick.bind(this);
    this._onFrameLoad = this.onFrameLoad.bind(this);
    this._onPopState = this.syncFromLocation.bind(this);
    this.element.addEventListener("click", this._onClick, true);
    document.addEventListener("turbo:frame-load", this._onFrameLoad);
    window.addEventListener("popstate", this._onPopState);
    this.syncFromLocation();
  }

  disconnect() {
    this.element.removeEventListener("click", this._onClick, true);
    document.removeEventListener("turbo:frame-load", this._onFrameLoad);
    window.removeEventListener("popstate", this._onPopState);
  }

  onFrameLoad(event) {
    const frame = event.target;
    if (!(frame instanceof Element) || frame.id !== "market_snapshot") return;
    this.syncFromLocation();
  }

  syncFromLocation() {
    const url = new URL(window.location.href);
    const windowParam = url.searchParams.get("window");
    if (windowParam) this.windowValue = parseInt(windowParam, 10);

    const slice = {
      msCity: url.searchParams.get("ms_city") || "",
      msPriceMin: url.searchParams.get("ms_price_min") || "",
      msPriceMax: url.searchParams.get("ms_price_max") || "",
      msModel: url.searchParams.get("ms_model") || "",
    };

    this.state = {
      ...slice,
      metroLabel: slice.msCity ? this.resolveDimLabel("metro", slice) : null,
      priceLabel: this.priceActive(slice) ? this.resolveDimLabel("price", slice) : null,
      modelLabel: slice.msModel ? this.resolveDimLabel("model", slice) : null,
    };

    this.syncFacetCountsFromFrame();

    const windowDays = url.searchParams.get("window");
    document.querySelectorAll(".ms-sec-tools .ms-seg__btn").forEach((btn) => {
      const btnWindow = new URL(btn.href, window.location.origin).searchParams.get("window");
      const on = btnWindow === windowDays;
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-current", on ? "page" : null);
    });

    this.paint();
  }

  syncFacetCountsFromFrame() {
    const frame = document.getElementById("market_snapshot");
    if (!frame) return;

    const sync = this.readFacetSync(frame);
    if (sync?.window != null) this.windowValue = Number(sync.window);
    else if (frame.dataset.windowDays) this.windowValue = parseInt(frame.dataset.windowDays, 10);

    const pricedN = sync?.priced_n ?? frame.dataset.pricedN;
    if (pricedN != null && pricedN !== "") this.updateLeadCount(pricedN);

    if (sync) {
      this.applyFacetMenuCounts(sync);
      if (this.state) this.refreshLabelsFromSync(sync, this.state);
    }

    if (this.hasIdleTextTarget && this.windowValue) {
      this.idleTextTarget.textContent = `Whole market · every metro, price and model in the last ${this.windowValue} days.`;
    }

    if (this.windowValue) {
      this.element.dataset.marketSnapshotFacetsWindowValue = String(this.windowValue);
    }
  }

  readFacetSync(frame) {
    const script = frame.querySelector("[data-market-snapshot-facets-sync]");
    if (!script?.textContent?.trim()) return null;

    try {
      this._facetSync = JSON.parse(script.textContent);
      return this._facetSync;
    } catch {
      this._facetSync = null;
      return null;
    }
  }

  updateLeadCount(n) {
    const formatted = this.formatDelimited(n);
    if (this.hasLeadCountTarget) this.leadCountTarget.textContent = formatted;
    else {
      const lead = this.element.querySelector(".mf__lead b");
      if (lead) lead.textContent = formatted;
    }
  }

  applyFacetMenuCounts(sync) {
    this.applyMenuCounts(
      "metro",
      sync.metros,
      (item, slice) => String(item.key ?? "") === String(slice.msCity || ""),
    );
    this.applyMenuCounts(
      "price",
      sync.prices,
      (item, slice) =>
        String(item.min ?? "") === String(slice.msPriceMin || "") &&
        String(item.max ?? "") === String(slice.msPriceMax || ""),
    );
    this.applyMenuCounts(
      "model",
      sync.models,
      (item, slice) => String(item.key ?? "") === String(slice.msModel || ""),
    );
  }

  applyMenuCounts(dim, items, matches) {
    if (!Array.isArray(items) || items.length === 0) return;

    const pop = this.element.querySelector(`[data-ms-facet-dim-value="${dim}"]`);
    if (!pop) return;

    pop.querySelectorAll("a.mf-opt").forEach((opt) => {
      const slice = this.parseSlice(opt.href);
      const row = items.find((item) => matches(item, slice));
      if (!row) return;

      const nWrap = opt.querySelector(".mf-opt__n");
      if (!nWrap) return;

      nWrap.childNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) node.remove();
      });
      nWrap.append(document.createTextNode(this.formatDelimited(row.n)));
    });
  }

  formatDelimited(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return String(value);
    return new Intl.NumberFormat().format(n);
  }

  onNavClick(event) {
    const link = event.target.closest("a[data-ms-frame-nav]");
    if (!link || !this.element.contains(link)) return;

    const href = link.getAttribute("href");
    if (!href) return;

    this.applyHref(href, link);
    this.paint();

    const details = link.closest("details");
    if (details) details.open = false;
  }

  applyHref(href, link) {
    const slice = this.parseSlice(href);
    const pickLabel = link?.dataset?.pickLabel?.trim() || null;
    const prev = this.state;
    const dim = this.dimForLink(link, slice, prev);

    if (dim === "reset") {
      this.state = {
        msCity: "",
        msPriceMin: "",
        msPriceMax: "",
        msModel: "",
        metroLabel: null,
        priceLabel: null,
        modelLabel: null,
      };
      return;
    }

    const next = {
      msCity: prev.msCity,
      msPriceMin: prev.msPriceMin,
      msPriceMax: prev.msPriceMax,
      msModel: prev.msModel,
      metroLabel: prev.metroLabel,
      priceLabel: prev.priceLabel,
      modelLabel: prev.modelLabel,
    };

    if (dim === "metro") next.msCity = slice.msCity;
    else if (dim === "price") {
      next.msPriceMin = slice.msPriceMin;
      next.msPriceMax = slice.msPriceMax;
    } else if (dim === "model") next.msModel = slice.msModel;
    else {
      next.msCity = slice.msCity;
      next.msPriceMin = slice.msPriceMin;
      next.msPriceMax = slice.msPriceMax;
      next.msModel = slice.msModel;
    }

    const mergedSlice = {
      msCity: next.msCity,
      msPriceMin: next.msPriceMin,
      msPriceMax: next.msPriceMax,
      msModel: next.msModel,
    };

    if (!next.msCity) next.metroLabel = null;
    else if (dim === "metro")
      next.metroLabel = pickLabel || this.resolveDimLabel("metro", mergedSlice);
    else if (!next.metroLabel) next.metroLabel = this.resolveDimLabel("metro", mergedSlice);

    if (!this.priceActive(mergedSlice)) next.priceLabel = null;
    else if (dim === "price")
      next.priceLabel = pickLabel || this.resolveDimLabel("price", mergedSlice);
    else if (!next.priceLabel) next.priceLabel = this.resolveDimLabel("price", mergedSlice);

    if (!next.msModel) next.modelLabel = null;
    else if (dim === "model")
      next.modelLabel = pickLabel || this.resolveDimLabel("model", mergedSlice);
    else if (!next.modelLabel) next.modelLabel = this.resolveDimLabel("model", mergedSlice);

    this.state = next;
  }

  dimForLink(link, slice, prev) {
    if (this.hasResetAllTarget && link === this.resetAllTarget) return "reset";

    const pop = link.closest("[data-ms-facet-dim-value]");
    if (pop) return pop.getAttribute("data-ms-facet-dim-value");

    if (String(slice.msCity) !== String(prev.msCity)) return "metro";
    if (
      String(slice.msPriceMin) !== String(prev.msPriceMin) ||
      String(slice.msPriceMax) !== String(prev.msPriceMax)
    ) {
      return "price";
    }
    if (String(slice.msModel) !== String(prev.msModel)) return "model";
    return null;
  }

  paint() {
    const metroLabel = this.displayLabel("metro", this.state.metroLabel);
    const priceLabel = this.displayLabel("price", this.state.priceLabel, "Price band");
    const modelLabel = this.displayLabel("model", this.state.modelLabel, this.state.msModel);

    this.paintPop("metro", this.state.msCity, metroLabel);
    this.paintPop("price", this.priceActive(this.state), priceLabel);
    this.paintPop("model", this.state.msModel, modelLabel);
    this.paintActiveRow();
    this.rewriteOptionHrefs();
  }

  paintPop(dim, active, valueLabel) {
    const pop = this.element.querySelector(`[data-ms-facet-dim-value="${dim}"]`);
    if (!pop) return;

    const defaults = { metro: "All metros", price: "Any price", model: "All models" };
    const keys = { metro: "Metro", price: "Price", model: "Model" };

    const summary = pop.querySelector(".mf-btn");
    if (summary) {
      summary.classList.toggle("is-set", Boolean(active));
      const keyEl = summary.querySelector(".mf-btn__k");
      if (keyEl) keyEl.textContent = keys[dim];
      const valueEl = summary.querySelector(".mf-btn__v");
      if (valueEl) valueEl.textContent = active ? valueLabel : defaults[dim];
    }

    pop.querySelectorAll(".mf-opt").forEach((opt) => {
      const optSlice = this.parseSlice(opt.href);
      const on = this.dimMatches(dim, optSlice, this.state);
      opt.classList.toggle("is-on", on);
      opt.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  paintActiveRow() {
    const sliceActive = this.sliceActive(this.state);

    if (this.hasIdleTextTarget) this.idleTextTarget.hidden = sliceActive;
    if (this.hasResetAllTarget) this.resetAllTarget.hidden = !sliceActive;

    if (this.hasTokenMetroTarget) {
      const on = Boolean(this.state.msCity);
      this.tokenMetroTarget.hidden = !on;
      if (on && this.hasTokenMetroLabelTarget) {
        this.tokenMetroLabelTarget.textContent = this.displayLabel("metro", this.state.metroLabel);
      }
      if (this.hasTokenMetroClearTarget) {
        this.tokenMetroClearTarget.href = this.buildHref({ msCity: "" });
      }
    }

    if (this.hasTokenPriceTarget) {
      const on = this.priceActive(this.state);
      this.tokenPriceTarget.hidden = !on;
      if (on && this.hasTokenPriceLabelTarget) {
        this.tokenPriceLabelTarget.textContent = this.displayLabel("price", this.state.priceLabel);
      }
      if (this.hasTokenPriceClearTarget) {
        this.tokenPriceClearTarget.href = this.buildHref({ msPriceMin: "", msPriceMax: "" });
      }
    }

    if (this.hasTokenModelTarget) {
      const on = Boolean(this.state.msModel);
      this.tokenModelTarget.hidden = !on;
      if (on && this.hasTokenModelLabelTarget) {
        this.tokenModelLabelTarget.textContent = this.displayLabel(
          "model",
          this.state.modelLabel,
          this.state.msModel,
        );
      }
      if (this.hasTokenModelClearTarget) {
        this.tokenModelClearTarget.href = this.buildHref({ msModel: "" });
      }
    }

    if (this.hasResetAllTarget) {
      this.resetAllTarget.href = this.resetUrlValue;
    }
  }

  rewriteOptionHrefs() {
    this.element.querySelectorAll("[data-ms-facet-dim-value]").forEach((pop) => {
      const dim = pop.getAttribute("data-ms-facet-dim-value");

      pop.querySelectorAll("a.mf-opt").forEach((opt) => {
        const target = this.parseSlice(opt.href);
        opt.href = this.buildHrefForSlice(this.mergedSliceForDim(dim, target));
      });

      const footClear = pop.querySelector(".mf-menu__foot a[data-ms-frame-nav]");
      if (!footClear) return;

      if (dim === "metro") {
        footClear.href = this.buildHrefForSlice(this.mergedSliceForDim("metro", { msCity: "" }));
      } else if (dim === "price") {
        footClear.href = this.buildHrefForSlice(
          this.mergedSliceForDim("price", { msPriceMin: "", msPriceMax: "" }),
        );
      } else if (dim === "model") {
        footClear.href = this.buildHrefForSlice(this.mergedSliceForDim("model", { msModel: "" }));
      }
    });
  }

  mergedSliceForDim(dim, target) {
    const merged = {
      msCity: this.state.msCity,
      msPriceMin: this.state.msPriceMin,
      msPriceMax: this.state.msPriceMax,
      msModel: this.state.msModel,
    };

    if (dim === "metro") merged.msCity = target.msCity;
    if (dim === "price") {
      merged.msPriceMin = target.msPriceMin;
      merged.msPriceMax = target.msPriceMax;
    }
    if (dim === "model") merged.msModel = target.msModel;

    return merged;
  }

  sliceActive(state) {
    return Boolean(state.msCity || this.priceActive(state) || state.msModel);
  }

  priceActive(state) {
    return Boolean(state.msPriceMin || state.msPriceMax);
  }

  dimMatches(dim, optSlice, state) {
    if (dim === "metro") return String(optSlice.msCity) === String(state.msCity);
    if (dim === "price") {
      return (
        String(optSlice.msPriceMin) === String(state.msPriceMin) &&
        String(optSlice.msPriceMax) === String(state.msPriceMax)
      );
    }
    if (dim === "model") return String(optSlice.msModel) === String(state.msModel);
    return false;
  }

  labelForDim(dim, slice) {
    const pop = this.element.querySelector(`[data-ms-facet-dim-value="${dim}"]`);
    if (!pop) return null;

    for (const opt of pop.querySelectorAll(".mf-opt")) {
      const optSlice = this.parseSlice(opt.href);
      if (this.dimMatches(dim, optSlice, slice)) {
        return (
          opt.dataset.pickLabel?.trim() || opt.querySelector(".mf-opt__l span")?.textContent?.trim()
        );
      }
    }
    return null;
  }

  resolveDimLabel(dim, slice) {
    return (
      this.labelForDim(dim, slice) ||
      this.labelFromSync(dim, slice) ||
      this.staleValueLabel(dim, slice) ||
      null
    );
  }

  displayLabel(dim, storedLabel, fallback = null) {
    const defaults = { metro: "Metro", price: "Price band", model: "Model" };
    const slice = {
      msCity: this.state.msCity,
      msPriceMin: this.state.msPriceMin,
      msPriceMax: this.state.msPriceMax,
      msModel: this.state.msModel,
    };

    return (
      storedLabel ||
      this.labelForDim(dim, slice) ||
      this.labelFromSync(dim, slice) ||
      fallback ||
      defaults[dim]
    );
  }

  refreshLabelsFromSync(sync, slice) {
    if (!this.state) return;

    if (slice.msCity) {
      this.state.metroLabel = this.resolveDimLabel("metro", slice);
    }
    if (this.priceActive(slice)) {
      this.state.priceLabel = this.resolveDimLabel("price", slice);
    }
    if (slice.msModel) {
      this.state.modelLabel = this.resolveDimLabel("model", slice);
    }
  }

  labelFromSync(dim, slice) {
    const sync = this._facetSync;
    if (!sync) return null;

    if (dim === "metro") {
      const row = sync.metros?.find(
        (item) => String(item.key ?? "") === String(slice.msCity || ""),
      );
      return row?.label?.trim() || null;
    }

    if (dim === "price") {
      const row = sync.prices?.find(
        (item) =>
          String(item.min ?? "") === String(slice.msPriceMin || "") &&
          String(item.max ?? "") === String(slice.msPriceMax || ""),
      );
      return row?.label?.trim() || null;
    }

    if (dim === "model") {
      const row = sync.models?.find(
        (item) => String(item.key ?? "") === String(slice.msModel || ""),
      );
      return row?.label?.trim() || null;
    }

    return null;
  }

  staleValueLabel(dim, slice) {
    if (dim === "metro" && slice.msCity && String(slice.msCity) === String(this.msCityValue)) {
      return this.metroLabelValue?.trim() || null;
    }
    if (
      dim === "price" &&
      this.priceActive(slice) &&
      String(slice.msPriceMin) === String(this.msPriceMinValue) &&
      String(slice.msPriceMax) === String(this.msPriceMaxValue)
    ) {
      return this.priceLabelValue?.trim() || null;
    }
    if (dim === "model" && slice.msModel && String(slice.msModel) === String(this.msModelValue)) {
      return this.modelLabelValue?.trim() || null;
    }

    return null;
  }

  parseSlice(href) {
    const url = new URL(href, window.location.origin);
    return {
      msCity: url.searchParams.get("ms_city") || "",
      msPriceMin: url.searchParams.get("ms_price_min") || "",
      msPriceMax: url.searchParams.get("ms_price_max") || "",
      msModel: url.searchParams.get("ms_model") || "",
    };
  }

  buildHref(overrides) {
    return this.buildHrefForSlice({
      msCity: this.state.msCity,
      msPriceMin: this.state.msPriceMin,
      msPriceMax: this.state.msPriceMax,
      msModel: this.state.msModel,
      ...overrides,
    });
  }

  buildHrefForSlice(slice) {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "snapshot");
    url.searchParams.set("window", String(this.windowValue));

    if (slice.msCity) url.searchParams.set("ms_city", slice.msCity);
    else url.searchParams.delete("ms_city");

    if (slice.msPriceMin) url.searchParams.set("ms_price_min", slice.msPriceMin);
    else url.searchParams.delete("ms_price_min");

    if (slice.msPriceMax) url.searchParams.set("ms_price_max", slice.msPriceMax);
    else url.searchParams.delete("ms_price_max");

    if (slice.msModel) url.searchParams.set("ms_model", slice.msModel);
    else url.searchParams.delete("ms_model");

    return `${url.pathname}?${url.searchParams.toString()}`;
  }
}
