import { Controller } from "@hotwired/stimulus";

// Cascading vehicle kind → make → model. Catalog is global (not gated by profile country).
export default class extends Controller {
  static targets = [
    "catalog",
    "hints",
    "kind",
    "make",
    "model",
    "bodyStyle",
    "makeModelRow",
    "kindHint",
    "modelHint",
    "mileageHint",
    "keywordsHint",
    "keywordsInput",
  ];
  static values = {
    taxonomyKinds: { type: Array, default: [] },
    bodyStyleKinds: { type: Array, default: [] },
    wildcardLabel: { type: String, default: "All models" },
    wildcardValue: { type: String, default: "all" },
    makeWildcardLabel: { type: String, default: "All makes" },
    makeWildcardValue: { type: String, default: "all" },
    defaultKind: { type: String, default: "car_truck" },
  };

  connect() {
    this.catalog = this.readCatalog();
    this.hintsByKind = this.readHints();
    if (!this.hasMakeTarget || !this.hasModelTarget) return;

    this.syncKindUi();
    this.refreshModels();
  }

  onKindChange() {
    if (this.hasMakeTarget) {
      const catalog = this.activeCatalog();
      this.makeTarget.innerHTML = this._makeOptions(catalog, this.makeTarget.value);
      this.makeTarget.dispatchEvent(new Event("change", { bubbles: true }));
    }

    this.syncKindUi();
    this.onMakeChange();
  }

  syncHints(kind) {
    const hints = this.hintsByKind[kind] || this.hintsByKind[this.defaultKindValue] || {};
    if (this.hasKindHintTarget) {
      this.kindHintTarget.textContent = hints.kind_hint || "";
    }
    if (this.hasModelHintTarget) {
      this.modelHintTarget.innerHTML = hints.model_hint || "";
      this.modelHintTarget.hidden = !hints.model_hint;
    }
    if (this.hasMileageHintTarget) {
      this.mileageHintTarget.textContent = hints.mileage_hint || "";
    }
    if (this.hasKeywordsHintTarget) {
      this.keywordsHintTarget.textContent = hints.keywords_hint || "";
    }
    if (this.hasKeywordsInputTarget && hints.keywords_placeholder) {
      this.keywordsInputTarget.placeholder = hints.keywords_placeholder;
      this.keywordsInputTarget.setAttribute("aria-label", hints.keywords_placeholder);
    }
  }

  onMakeChange() {
    if (!this.hasModelTarget) return;
    this.refreshModels();
    this.syncKindUi();
  }

  refreshModels() {
    if (!this.hasModelTarget) return;
    if (this.isAnyMake()) {
      this.populateAnyMakeModels();
      return;
    }
    this.populateModels(this.makeTarget.value, this.modelTarget.value || "");
  }

  populateModels(makeName, selected) {
    const catalog = this.activeCatalog();
    const select = this.modelTarget;
    const list = catalog[makeName] || [];
    const optionStrings = [this._option(this.wildcardLabelValue, this.wildcardValueValue)];

    list.forEach((name) => optionStrings.push(this._option(name, name)));

    select.innerHTML = optionStrings.join("");
    select.disabled = false;
    const pick =
      selected === this.wildcardValueValue || list.includes(selected)
        ? selected
        : this.wildcardValueValue;
    select.value = pick;
    if (select.value !== pick) select.value = this.wildcardValueValue;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  populateAnyMakeModels() {
    const select = this.modelTarget;
    select.innerHTML = this._option(this.wildcardLabelValue, this.wildcardValueValue);
    select.value = this.wildcardValueValue;
    select.disabled = true;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  isAnyMake() {
    return this.hasMakeTarget && this.makeTarget.value === this.makeWildcardValueValue;
  }

  syncKindUi() {
    const kind = this.currentKind();
    const taxonomyKind = this.taxonomyKindsValue.includes(kind);

    this.syncHints(kind);

    if (this.hasMakeModelRowTarget) {
      this.makeModelRowTarget.hidden = !taxonomyKind;
    }
    if (this.hasMakeTarget) {
      this.makeTarget.required = taxonomyKind;
      this.makeTarget.disabled = !taxonomyKind;
    }
    if (this.hasModelTarget) {
      this.modelTarget.required = taxonomyKind && !this.isAnyMake();
      this.modelTarget.disabled = !taxonomyKind;
    }
    if (this.hasBodyStyleTarget) {
      const showBodyStyle = this.bodyStyleKindsValue.includes(kind);
      this.bodyStyleTarget.hidden = !showBodyStyle;
      this.bodyStyleTarget.disabled = !showBodyStyle;
    }
  }

  readCatalog() {
    if (!this.hasCatalogTarget) return {};

    try {
      return JSON.parse(this.catalogTarget.textContent);
    } catch {
      return {};
    }
  }

  readHints() {
    if (!this.hasHintsTarget) return {};

    try {
      return JSON.parse(this.hintsTarget.textContent);
    } catch {
      return {};
    }
  }

  currentKind() {
    if (!this.hasKindTarget) return this.defaultKindValue;
    return this.kindTarget.value || this.defaultKindValue;
  }

  activeCatalog() {
    const kind = this.currentKind();
    return this.catalog[kind] || this.catalog[this.defaultKindValue] || {};
  }

  _makeOptions(catalog, selected) {
    const names = Object.keys(catalog).sort((a, b) => a.localeCompare(b));
    const options = [this._option(this.makeWildcardLabelValue, this.makeWildcardValueValue)];
    names.forEach((name) => options.push(this._option(name, name)));
    if (selected && selected !== this.makeWildcardValueValue && !names.includes(selected)) {
      options.push(this._option(`${selected} (custom)`, selected));
    }
    return options.join("");
  }

  _option(label, value) {
    return `<option value="${this._escapeAttr(value)}">${this._escapeText(label)}</option>`;
  }

  _escapeText(value) {
    return String(value).replace(
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

  _escapeAttr(value) {
    return this._escapeText(value).replace(/`/g, "&#96;");
  }
}
