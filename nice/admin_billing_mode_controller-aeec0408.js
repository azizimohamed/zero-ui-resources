import { Controller } from "@hotwired/stimulus";

/** Toggle give-package / sell-Scale / overrides-only on the admin billing form. */
export default class extends Controller {
  static targets = [
    "compFields",
    "paidFields",
    "submitLabel",
    "planTier",
    "defaultsTierLabel",
    "limitField",
    "limitHint",
    "unlimitedCheckbox",
  ];
  static values = {
    mode: { type: String, default: "comp" },
    packageLabel: String,
    checkoutLabel: String,
    overridesLabel: String,
    planLimits: Object,
    hasOverrides: Boolean,
    currentTier: String,
  };

  connect() {
    this.render();
    this.refreshDefaults();
  }

  setMode(event) {
    this.modeValue = event.target.value;
    this.render();
    this.refreshDefaults();
  }

  tierChanged() {
    this.refreshDefaults();
  }

  fieldChanged(event) {
    this.refreshHintFor(event.target.dataset.limitKey);
  }

  toggleUnlimited(event) {
    const key = event.target.dataset.limitKey;
    const field = this.limitFieldTargets.find((el) => el.dataset.limitKey === key);
    if (!field) return;

    field.disabled = event.target.checked;
    if (event.target.checked) field.value = "";
    this.refreshHintFor(key);
  }

  confirmWipe(event) {
    if (!this.hasOverridesValue) return;
    if (!this.allOverridesBlank()) return;

    const ok = window.confirm(
      "Clear all limit overrides? Caps will fall back to the tier defaults.",
    );
    if (!ok) event.preventDefault();
  }

  render() {
    const mode = this.modeValue;
    const paid = mode === "paid";
    const packageMode = mode === "comp";

    this.compFieldsTargets.forEach((el) => el.classList.toggle("hidden", !packageMode));
    this.paidFieldsTargets.forEach((el) => el.classList.toggle("hidden", !paid));
    this.planTierTargets.forEach((el) => {
      el.disabled = !packageMode;
    });
    if (this.hasSubmitLabelTarget) {
      this.submitLabelTarget.value = this.submitLabelFor(mode);
    }
  }

  submitLabelFor(mode) {
    switch (mode) {
      case "paid":
        return this.checkoutLabelValue;
      case "overrides":
        return this.overridesLabelValue;
      default:
        return this.packageLabelValue;
    }
  }

  refreshDefaults() {
    const tier = this.defaultsTierName();
    this.defaultsTierLabelTargets.forEach((el) => {
      el.textContent = tier;
    });

    const defaults = this.planLimitsValue?.[tier] || {};
    this.limitFieldTargets.forEach((field) => {
      const key = field.dataset.limitKey;
      if (!key) return;
      const value = defaults[key];
      field.placeholder = value === undefined || value === null ? "" : String(value);
      this.refreshHintFor(key, defaults);
    });
  }

  refreshHintFor(key, defaults = null) {
    const hint = this.limitHintTargets.find((el) => el.dataset.limitKey === key);
    if (!hint) return;

    const tier = this.defaultsTierName();
    const tierDefaults = defaults || this.planLimitsValue?.[tier] || {};
    const defaultValue = tierDefaults[key];
    const unlimited = this.unlimitedCheckboxTargets.find((el) => el.dataset.limitKey === key);
    const field = this.limitFieldTargets.find((el) => el.dataset.limitKey === key);

    if (unlimited?.checked) {
      hint.textContent = "Unlimited (override)";
      return;
    }

    const raw = field?.value?.trim();
    if (raw) {
      hint.textContent = `${raw} (override)`;
      return;
    }

    const shown = defaultValue === undefined || defaultValue === null ? "—" : String(defaultValue);
    hint.textContent = `${shown} (${tier} default)`;
  }

  defaultsTierName() {
    if (this.modeValue === "paid") return "scale";
    if (this.modeValue === "overrides") {
      return this.currentTierValue || "free";
    }
    const select = this.planTierTargets[0];
    return select?.value || "free";
  }

  allOverridesBlank() {
    const anyUnlimited = this.unlimitedCheckboxTargets.some((el) => el.checked);
    if (anyUnlimited) return false;

    return this.limitFieldTargets.every((field) => {
      if (field.disabled) return true;
      return !field.value?.trim();
    });
  }
}
