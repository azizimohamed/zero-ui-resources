import { Controller } from "@hotwired/stimulus";
import {
  criteriaChromeTypeFor,
  criteriaPanelTypeFor,
  criteriaSummaryForReviewType,
  normalizedChipCsv,
  realEstateLabelMapsFromSection,
} from "wizard/criteria";
import { readField, findField as findWizardField } from "wizard/field_access";
import {
  fillLaneFields,
  laneMarketFields,
  laneMarketFor,
  markLaneButtons,
  paintLaneCardTags,
  relocalizeMarketFields,
  showLaneGroups,
} from "wizard/lanes";
import {
  applyChipInputValidity,
  searchKeywordValidationMessage,
} from "wizard/search_keyword_validation";
import {
  coverageEstimateLabel as formatCoverageEstimate,
  modeLabel,
  priceCurrencySymbol as currencySymbolFor,
  priceRangeLabel,
  radiusScaleNumber as scaleRadiusNumber,
  radiusSummaryLabel as formatRadiusSummary,
} from "wizard/labels";
import { reportFieldValidity, validationAnchorFor } from "validation_anchor";
import { rowResolvedEnabled } from "lib/alerts_channel_state";

export default class extends Controller {
  static targets = [
    "step",
    "stepButton",
    "stepper",
    "progressFill",
    "progressText",
    "stepTitle",
    "nextButton",
    "backButton",
    "submitButton",
    "reviewName",
    "reviewCategory",
    "reviewStatus",
    "reviewPrice",
    "reviewCoverage",
    "reviewSearchKeywords",
    "reviewExclusions",
    "reviewAlerts",
    "reviewEstimate",
    "reviewCriteriaSection",
    "pendingMessage",
    "radiusValue",
    "radiusScaleLabel",
    "categoryCriteriaSection",
    "priceMinLabel",
    "priceMaxLabel",
    "laneGroup",
    "laneButton",
    "laneKeyInput",
    "railName",
    "railCategory",
    "railCoverage",
    "railCriteria",
    "railSearchKeywords",
    "railPrice",
    "railAlerts",
    "railEstimate",
    "criteriaTip",
    "slotMeter",
    "slotMeterFill",
    "slotMeterText",
    "factCadence",
    "factAnchors",
    "factSlots",
    "scopeAllAnchorsMeta",
  ];

  static values = {
    metricCountryCodes: { type: Array, default: ["DE"] },
    kmPerMile: { type: Number, default: 1.60934 },
    countryCurrencies: { type: Object, default: { US: { symbol: "$" } } },
    namePlaceholderMap: { type: Object, default: {} },
    lanes: { type: Object, default: {} },
    laneMarkets: { type: Object, default: {} },
    initialLaneKey: { type: String, default: "custom" },
    anchorCounts: { type: Object, default: {} },
    scanIntervalMinutes: { type: Number, default: 10 },
    citySlotLimit: { type: Number, default: -1 },
    createMode: { type: Boolean, default: false },
    wizardErrorStep: { type: String, default: "" },
    fieldErrors: { type: Object, default: {} },
    searchKeywordMessages: { type: Object, default: {} },
  };

  connect() {
    this.onChannelsChanged = () => this.syncAlertsRail();
    document.addEventListener("alerts:channels-changed", this.onChannelsChanged);

    this.totalSteps = this.stepTargets.length;
    this.index = this.initialStepIndex();
    this.categorySelect = this.element.querySelector("#search_profile_category_filter");
    this.nameInput = this.element.querySelector("#search_profile_name");
    this.lastSelectableCategory = null;
    this.activeLaneKey = null;
    this.laneMarketCountry = (this.readValue("search_profile_country") || "US").toUpperCase();
    this.bindCategoryCards();
    this.bindCategorySelect();
    this.syncCategoryCriteria();
    this.syncNamePlaceholder();
    this.syncLaneGroups();
    this.syncLocationModeUi();
    this.syncSliderLabels();
    this.syncPriceLabels();
    this.sync();
    this.applyServerFieldErrors();
    this.persistStepInUrl();
    this.maybeApplyDefaultLane();
    this.syncLaneCardTags(this.laneMarketCountry);
    this.refreshReview();
    if (this.index > 0) this.scrollStepperToCurrentStep();
  }

  disconnect() {
    document.removeEventListener("alerts:channels-changed", this.onChannelsChanged);
  }

  syncAlertsRail() {
    const panel = document.getElementById("wizard_notifications_panel");
    if (!panel) return;

    const rows = Array.from(panel.querySelectorAll('[data-notification-settings-target="row"]'));
    const enabledRows = rows.filter((row) => rowResolvedEnabled(row));
    const label = this.alertsSummaryLabel(enabledRows);

    this.writeTarget("railAlerts", label);
    this.writeTarget("reviewAlerts", label);
  }

  alertsSummaryLabel(enabledRows) {
    if (enabledRows.length === 0) return "none on";

    const labels = enabledRows.map((row) =>
      (row.dataset.channelLabel || row.dataset.channel).toLowerCase(),
    );

    if (labels.length === 1) return labels[0];
    if (labels.length === 2) return `${labels[0]} + ${labels[1]}`;

    return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
  }

  // Create-mode starter lanes. Default is blank ("custom"); templates are opt-in.
  // `force` re-applies when the category changes so shared fields (name/price/coverage)
  // do not keep the previous vertical's defaults. Seeded creates (`?lane=`) keep server
  // fields and only sync the highlight when a name is already present.
  maybeApplyDefaultLane({ force = false } = {}) {
    if (!this.createModeValue) return;
    const category = this.currentSelectableCategory();
    const lanes = this.lanesValue[category] || [];
    const preferredKey = force ? "custom" : this.initialLaneKeyValue || "custom";
    const lane =
      lanes.find((entry) => entry.key === preferredKey) ||
      lanes.find((entry) => entry.key === "custom") ||
      lanes[0];
    if (!lane) return;

    this.activeLaneKey = lane.key;
    this.markActiveLane(lane.key);
    this.persistActiveLaneKey(lane.key);

    const country = this.readValue("search_profile_country") || "US";

    // Name already set (onboarding seed or typed before connect): highlight only.
    if (!force && (this.nameInput?.value || "").trim()) {
      this.syncLaneCardTags(country);
      return;
    }

    this.applyLaneFields(
      {
        ...(lane.fields || {}),
        ...laneMarketFields(laneMarketFor(this.laneMarketsValue, lane.key, country)),
      },
      { preserveName: force },
    );
    this.syncLaneCardTags(country);
  }

  goTo(event) {
    const idx = Number(event.currentTarget.dataset.stepIndex);
    if (!Number.isNaN(idx)) this.setStepIndex(idx);
  }

  next() {
    if (!this.validateCurrentStep()) return;
    this.setStepIndex(this.index + 1);
  }

  back() {
    this.setStepIndex(this.index - 1);
  }

  handleSubmit(event) {
    // Drafts intentionally skip field constraints (server only needs a name).
    // Form has novalidate so native bubbles never fire on hidden combobox selects.
    if (this.submitterSavesDraft(event)) {
      if (this.nameInput && !(this.nameInput.value || "").trim()) {
        event.preventDefault();
        this.revealInvalidField(this.nameInput);
        return;
      }

      this.allowWizardLeave();
      this.hidePendingMessage();
      return;
    }

    this.flushChipInputs(this.element);

    const invalidField = this.firstInvalidRequiredField(this.element);
    if (!invalidField) {
      this.allowWizardLeave();
      this.hidePendingMessage();
      return;
    }

    event.preventDefault();
    this.revealInvalidField(invalidField);
    this.showPendingMessage();
  }

  // wizard-leave owns the create-mode leave prompt; unlock it before Turbo
  // submits so the post-create redirect is not intercepted as a leave attempt.
  allowWizardLeave() {
    const leave = this.application.getControllerForElementAndIdentifier(
      this.element,
      "wizard-leave",
    );
    leave?.allowNextLeave();
  }

  setStepIndex(nextIndex) {
    const previousIndex = this.index;
    this.index = Math.min(Math.max(nextIndex, 0), this.totalSteps - 1);
    this.sync();
    if (this.index !== previousIndex) {
      this.scrollStepperToCurrentStep();
      this.persistStepInUrl();
    }
    this.refreshReview();
  }

  // Restore step from ?step=notifications (slug) or ?step=4 (1-based).
  initialStepIndex() {
    const fromServer = this.wizardErrorStepValue?.trim();
    if (fromServer) {
      const serverIdx = this.stepIndexForSlug(fromServer);
      if (serverIdx >= 0) return serverIdx;
    }

    const raw = new URL(window.location.href).searchParams.get("step");
    if (!raw) return 0;

    const asNumber = Number(raw);
    if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= this.totalSteps) {
      return asNumber - 1;
    }

    const idx = this.stepIndexForSlug(raw);
    return idx >= 0 ? idx : 0;
  }

  stepIndexForSlug(raw) {
    const slug = this.stepSlug(raw);
    return this.stepButtonTargets.findIndex(
      (button) => this.stepSlug(button.dataset.stepTitle) === slug,
    );
  }

  stepSlug(value) {
    return (value || "")
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  persistStepInUrl() {
    const url = new URL(window.location.href);
    const title = this.stepButtonTargets[this.index]?.dataset.stepTitle;
    const value = this.stepSlug(title) || String(this.index + 1);
    if (url.searchParams.get("step") === value) {
      this.notifyStepChanged();
      return;
    }

    url.searchParams.set("step", value);
    const next = `${url.pathname}${url.search}${url.hash}`;
    history.replaceState(null, "", next);
    this.notifyStepChanged();
  }

  // Telegram card (and anything else) can refresh return_to without the wizard
  // reaching into its DOM.
  notifyStepChanged() {
    window.dispatchEvent(new CustomEvent("crawlbench:wizard-step"));
  }

  refreshReview() {
    this.hidePendingMessage();
    this.syncSliderLabels();
    this.syncPriceLabels();
    this.refreshCoverageFacts();

    const name = this.readValue("search_profile_name") || "—";
    const status = this.readValue("search_profile_status") || "active";
    const min = this.readValue("search_profile_price_min_dollars");
    const max = this.readValue("search_profile_price_max_dollars");
    const mode = this.readValue("search_profile_location_mode");
    const country = this.readValue("search_profile_country") || "US";
    const radius = this.readValue("search_profile_radius_miles");
    const searchKeywords = this.readValue("search_profile_search_keywords");
    const exclusions = this.readValue("search_profile_excludes_csv");
    const priceSymbol = this.priceCurrencySymbol(country);
    const categoryLabel = this.selectedCategoryLabel();
    const criteria = criteriaSummaryForReviewType(
      criteriaPanelTypeFor(this.selectedCategorySlug()),
      (id) => this.readValue(id),
      realEstateLabelMapsFromSection(
        this.categoryCriteriaSectionTargets?.find(
          (el) => el.dataset.categoryCriteriaType === "real_estate",
        ),
      ),
    );
    const keywordsLabel = normalizedChipCsv(searchKeywords);
    const priceLabel = priceRangeLabel(min, max, priceSymbol);
    const coverageLabel = [
      country,
      modeLabel(mode),
      radius ? this.radiusSummaryLabel(radius, country, true) : null,
    ]
      .filter(Boolean)
      .join(" · ");
    const estimateLabel = this.coverageEstimateLabel(country, mode, radius);

    this.writeTarget("reviewName", name);
    this.writeTarget("reviewCategory", this.categoryWithLaneLabel(categoryLabel));
    this.writeTarget("reviewStatus", status);
    this.writeTarget("reviewPrice", priceLabel);
    this.writeTarget("reviewCoverage", coverageLabel);
    this.writeTarget("reviewSearchKeywords", keywordsLabel);
    this.writeTarget("reviewExclusions", normalizedChipCsv(exclusions));
    this.writeTarget("reviewEstimate", estimateLabel);
    this.syncReviewCriteriaSections();

    this.writeTarget("railName", name === "—" ? "Untitled monitor" : name);
    this.writeTarget("railCategory", this.categoryWithLaneLabel(categoryLabel));
    this.writeTarget("railCoverage", coverageLabel);
    this.writeTarget("railCriteria", criteria);
    this.writeTarget("railSearchKeywords", keywordsLabel);
    this.writeTarget("railPrice", priceLabel);
    this.writeTarget("railEstimate", estimateLabel);
    this.syncAlertsRail();
  }

  refreshCoverageFacts() {
    const country = this.readValue("search_profile_country") || "US";
    const mode = this.readValue("search_profile_location_mode");
    const anchors = this.anchorCountFor(country);
    const limit = this.citySlotLimitValue;
    const unlimited = limit < 0;
    const selectedCities = this.selectedCityCount();
    let used = selectedCities;
    if (mode === "all_cities") used = unlimited ? anchors : limit;

    if (this.hasScopeAllAnchorsMetaTarget) {
      this.scopeAllAnchorsMetaTarget.textContent =
        anchors > 0 ? `all_cities · ${anchors}` : "all_cities";
    }

    if (this.hasFactCadenceTarget) {
      const mins = this.scanIntervalMinutesValue;
      this.factCadenceTarget.innerHTML = mins > 0 ? `${mins} <small>min</small>` : "—";
    }
    if (this.hasFactAnchorsTarget) {
      this.factAnchorsTarget.textContent = anchors > 0 ? String(anchors) : "—";
    }
    if (this.hasFactSlotsTarget) {
      this.factSlotsTarget.textContent = unlimited ? "∞" : String(limit);
    }

    if (!unlimited && this.hasSlotMeterFillTarget && this.hasSlotMeterTextTarget) {
      const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
      this.slotMeterFillTarget.style.width = `${pct}%`;
      this.slotMeterTextTarget.textContent = `${used} / ${limit}`;
    }
  }

  syncLocationModeFromUi(event) {
    const select = this.element.querySelector("#search_profile_location_mode");
    const value = event?.currentTarget?.value;
    if (!select || !value || select.value === value) {
      this.refreshCoverageFacts();
      return;
    }
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  syncLocationModeUi() {
    const mode = this.readValue("search_profile_location_mode") || "single_city";
    this.element.querySelectorAll('input[name="wiz_location_mode_ui"]').forEach((radio) => {
      radio.checked = radio.value === mode;
    });
  }

  applyLane(event) {
    if (!this.createModeValue) return;

    const button = event.currentTarget;
    const key = button?.dataset?.laneKey;
    const category = this.currentSelectableCategory();
    const lanes = this.lanesValue[category] || [];
    const lane = lanes.find((entry) => entry.key === key);
    if (!lane) return;

    this.activeLaneKey = key;
    this.markActiveLane(key);
    this.persistActiveLaneKey(key);
    const country = this.readValue("search_profile_country") || "US";
    this.applyLaneFields({
      ...(lane.fields || {}),
      ...laneMarketFields(laneMarketFor(this.laneMarketsValue, key, country)),
    });
    this.syncLaneCardTags(country);
    this.laneMarketCountry = country.toString().toUpperCase();
    this.refreshReview();
  }

  persistActiveLaneKey(key) {
    if (!this.hasLaneKeyInputTarget) return;
    this.laneKeyInputTarget.value = key || "custom";
  }

  // Rewrite template prices / model / name for the selected country. No-op on
  // Build your own, on edit, and when the operator already changed the band.
  relocalizeLaneMarket() {
    if (!this.createModeValue) return;

    const next = (this.readValue("search_profile_country") || "US").toUpperCase();
    const prev = (this.laneMarketCountry || "US").toUpperCase();
    const key = this.activeLaneKey;
    if (key && key !== "custom" && next !== prev) {
      const fields = relocalizeMarketFields(this.laneMarketsValue, key, prev, next, (id) =>
        this.readValue(id),
      );
      if (fields) this.applyLaneFields(fields);
    }
    this.syncLaneCardTags(next);
    this.laneMarketCountry = next;
  }

  syncLaneCardTags(country) {
    if (!this.hasLaneButtonTarget) return;
    paintLaneCardTags(
      this.laneButtonTargets,
      this.currentSelectableCategory(),
      this.laneMarketsValue,
      country,
    );
  }

  applyLaneFields(fields, { preserveName = false } = {}) {
    fillLaneFields(this.element, fields, {
      criteriaScope: this.activeCategoryCriteriaSection(),
      nameInput: this.nameInput,
      preserveName,
      onLocationMode: () => this.syncLocationModeUi(),
      replaceChipTokens: (id, csv) => this.replaceChipTokens(id, csv),
    });
  }

  // Category panels reuse ids for keywords / days_since_listed; prefer the active panel.
  findField(id) {
    return findWizardField(this.element, id, this.activeCategoryCriteriaSection());
  }

  activeCategoryCriteriaSection() {
    if (!this.hasCategoryCriteriaSectionTarget) return null;
    const type = criteriaPanelTypeFor(this.currentSelectableCategory());
    return (
      this.categoryCriteriaSectionTargets.find(
        (section) => section.dataset.categoryCriteriaType === type,
      ) || null
    );
  }

  replaceChipTokens(id, csv) {
    const hidden = this.findField(id);
    const shell = hidden?.closest('[data-controller~="chip-input"]');
    if (!shell) return;
    const controller = this.application.getControllerForElementAndIdentifier(shell, "chip-input");
    if (controller?.replaceTokens) {
      controller.replaceTokens(csv || "");
      return;
    }
    if (hidden) {
      hidden.value = csv || "";
      hidden.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  syncLaneGroups() {
    if (!this.hasLaneGroupTarget) return;
    showLaneGroups(this.laneGroupTargets, this.currentSelectableCategory());
  }

  markActiveLane(key) {
    if (!this.hasLaneButtonTarget) return;
    markLaneButtons(this.laneButtonTargets, key, this.currentSelectableCategory());
  }

  categoryWithLaneLabel(categoryLabel) {
    if (!this.activeLaneKey || this.activeLaneKey === "custom") return categoryLabel;
    const lanes = this.lanesValue[this.currentSelectableCategory()] || [];
    const lane = lanes.find((entry) => entry.key === this.activeLaneKey);
    if (!lane?.title) return categoryLabel;
    return `${categoryLabel} · ${lane.title}`;
  }

  coverageEstimateLabel(country, mode, radius) {
    return formatCoverageEstimate({
      scanIntervalMinutes: this.scanIntervalMinutesValue,
      mode,
      country,
      anchors: this.anchorCountFor(country),
      cityCount: this.selectedCityCount(),
      radiusLabel: radius ? this.radiusSummaryLabel(radius, country, false) : null,
    });
  }

  anchorCountFor(country) {
    const code = country.toString().toUpperCase();
    return Number(this.anchorCountsValue[code] || 0);
  }

  selectedCityCount() {
    const select = this.element.querySelector("#search_profile_city_ids");
    if (!select) return 0;
    return Array.from(select.selectedOptions || []).length;
  }

  selectedCategorySlug() {
    return this.categorySelect?.value || "";
  }

  updateRadiusLabel(event) {
    const value = event?.currentTarget?.value || this.readValue("search_profile_radius_miles");
    const country = this.readValue("search_profile_country") || "US";
    if (this.hasRadiusValueTarget) {
      this.radiusValueTarget.textContent = value
        ? this.radiusSummaryLabel(value, country, false)
        : "—";
    }
  }

  distanceLabelOpts() {
    return {
      metricCountryCodes: this.metricCountryCodesValue,
      kmPerMile: this.kmPerMileValue,
    };
  }

  radiusScaleNumber(miles, country) {
    return scaleRadiusNumber(miles, country, this.distanceLabelOpts());
  }

  radiusSummaryLabel(miles, country, withRadiusSuffix = false) {
    return formatRadiusSummary(miles, country, withRadiusSuffix, this.distanceLabelOpts());
  }

  syncRadiusScaleLabels() {
    if (!this.hasRadiusScaleLabelTarget) return;

    const country = this.readValue("search_profile_country") || "US";
    this.radiusScaleLabelTargets.forEach((el) => {
      const miles = el.dataset.mileValue;
      if (!miles) return;
      el.textContent = this.radiusScaleNumber(miles, country);
    });
  }

  syncSliderLabels() {
    this.syncRadiusScaleLabels();
    this.updateRadiusLabel();
  }

  syncPriceLabels() {
    const country = this.readValue("search_profile_country") || "US";
    const symbol = this.priceCurrencySymbol(country);

    if (this.hasPriceMinLabelTarget) {
      this.priceMinLabelTarget.textContent = `Min price (${symbol})`;
    }
    if (this.hasPriceMaxLabelTarget) {
      this.priceMaxLabelTarget.textContent = `Max price (${symbol})`;
    }
  }

  priceCurrencySymbol(country) {
    return currencySymbolFor(country, this.countryCurrenciesValue);
  }

  scrollStepperToCurrentStep() {
    const button = this.stepButtonTargets[this.index];
    const stepper = this.hasStepperTarget ? this.stepperTarget : null;
    if (!button || !stepper || stepper.scrollWidth <= stepper.clientWidth) return;

    requestAnimationFrame(() => {
      const stepperRect = stepper.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      const delta =
        buttonRect.left + buttonRect.width / 2 - (stepperRect.left + stepperRect.width / 2);
      stepper.scrollBy({ left: delta, behavior: "smooth" });
    });
  }

  sync() {
    const isLast = this.index === this.totalSteps - 1;
    this.stepTargets.forEach((panel, idx) => {
      panel.classList.toggle("hidden", idx !== this.index);
    });

    this.stepButtonTargets.forEach((button, idx) => {
      button.classList.toggle("current", idx === this.index);
      button.classList.toggle("done", idx < this.index);
    });

    this.backButtonTargets.forEach((btn) => {
      btn.disabled = this.index === 0;
    });

    this.toggleButtons(this.nextButtonTargets, isLast);
    this.toggleButtons(this.submitButtonTargets, !isLast);

    if (this.hasProgressFillTarget) {
      const pct = ((this.index + 1) / this.totalSteps) * 100;
      this.progressFillTarget.style.width = `${pct}%`;
    }

    if (this.hasProgressTextTarget) {
      this.progressTextTarget.textContent = `${this.index + 1} of ${this.totalSteps}`;
    }

    if (this.hasStepTitleTarget) {
      const title = this.stepButtonTargets[this.index]?.dataset.stepTitle || "";
      this.stepTitleTarget.textContent = title;
    }
  }

  toggleButtons(buttons, hidden) {
    buttons.forEach((button) => {
      button.toggleAttribute("hidden", hidden);
      button.setAttribute("aria-hidden", hidden ? "true" : "false");
      button.classList.toggle("hidden", hidden);
    });
  }

  validateCurrentStep() {
    const panel = this.stepTargets[this.index];
    if (!panel) return true;

    this.flushChipInputs(panel);

    const invalidField = this.firstInvalidRequiredField(panel);

    if (!invalidField) return true;

    this.revealInvalidField(invalidField);
    return false;
  }

  firstInvalidRequiredField(scope) {
    const invalidChip = this.firstInvalidRequiredChipInput(scope);
    if (invalidChip) return invalidChip;

    const invalidKeywords = this.firstInvalidSearchKeywordsField(scope);
    if (invalidKeywords) return invalidKeywords;

    const requiredFields = Array.from(
      scope.querySelectorAll("input[required], select[required], textarea[required]"),
    );

    return requiredFields.find((field) => {
      if (!this.fieldParticipatesInValidation(field)) return false;
      return !field.checkValidity();
    });
  }

  firstInvalidSearchKeywordsField(scope) {
    const hidden = this.findField("search_profile_search_keywords");
    if (!hidden) return null;

    const entry = hidden
      .closest('[data-controller~="chip-input"]')
      ?.querySelector("[data-chip-input-target='input']");
    if (entry && !this.fieldParticipatesInValidation(entry)) return null;

    const message = searchKeywordValidationMessage(hidden.value, this.searchKeywordMessagesValue);
    if (!message) {
      applyChipInputValidity(hidden, "");
      return null;
    }

    return applyChipInputValidity(hidden, message);
  }

  applyServerFieldErrors() {
    const errors = this.fieldErrorsValue || {};
    const entries = Object.entries(errors);
    if (entries.length === 0) return;

    entries.forEach(([fieldId, message]) => {
      const field = this.findField(fieldId) || document.getElementById(fieldId);
      applyChipInputValidity(field, message);
    });

    const [firstId] = entries[0];
    const firstField = this.findField(firstId) || document.getElementById(firstId);
    if (firstField) {
      requestAnimationFrame(() => this.revealInvalidField(firstField));
    }
  }

  // Chip values live in a hidden input; browsers ignore required/customValidity on those.
  firstInvalidRequiredChipInput(scope) {
    for (const element of scope.querySelectorAll('[data-controller~="chip-input"]')) {
      const controller = this.application.getControllerForElementAndIdentifier(
        element,
        "chip-input",
      );
      if (!controller?.requiredValue || !controller.hasInputTarget) continue;

      const input = controller.inputTarget;
      if (!this.fieldParticipatesInValidation(input)) continue;

      controller.validateRequired();
      if (!input.checkValidity()) return input;
    }

    return null;
  }

  // Jump to the step that owns the field, then show the bubble on the visible control
  // (combobox input / chip entry), not on an sr-only select.
  revealInvalidField(field) {
    if (!field) return;

    const stepIndex = this.stepTargets.findIndex((step) => step.contains(field));
    if (stepIndex >= 0 && stepIndex !== this.index) {
      this.setStepIndex(stepIndex);
    }

    requestAnimationFrame(() => {
      reportFieldValidity(field);
      validationAnchorFor(field)?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    });
  }

  // Inactive category panels use class="hidden" + fieldset.disabled (not the HTML hidden attr).
  // Wizard step panels also use .hidden — those must still validate on full-form submit.
  fieldParticipatesInValidation(field) {
    if (!field || field.disabled) return false;
    if (field.type === "hidden") return false;
    if (field.closest("fieldset[disabled]")) return false;

    let node = field.parentElement;
    while (node && node !== this.element) {
      const isHidden = node.hasAttribute?.("hidden") || node.classList?.contains("hidden");
      if (isHidden && !this.isWizardStepElement(node)) return false;
      node = node.parentElement;
    }

    return true;
  }

  isWizardStepElement(node) {
    return this.stepTargets.includes(node);
  }

  submitterSavesDraft(event) {
    return event?.submitter?.value === "save_draft";
  }

  flushChipInputs(scope) {
    scope.querySelectorAll('[data-controller~="chip-input"]').forEach((element) => {
      const controller = this.application.getControllerForElementAndIdentifier(
        element,
        "chip-input",
      );
      if (!controller) return;

      controller.commitPendingInput();
      controller.persist();
    });
  }

  showPendingMessage() {
    if (!this.hasPendingMessageTarget) return;
    this.pendingMessageTarget.textContent =
      "Some required items are still pending. Complete them before activating.";
    this.pendingMessageTarget.classList.remove("hidden");
  }

  hidePendingMessage() {
    if (!this.hasPendingMessageTarget) return;
    this.pendingMessageTarget.classList.add("hidden");
  }

  bindCategoryCards() {
    const select = this.categorySelect;
    const cards = this.element.querySelectorAll("[data-step-category]");
    if (!select || cards.length === 0) return;

    cards.forEach((card) => {
      card.addEventListener("click", () => {
        const disabled =
          card.disabled ||
          card.getAttribute("aria-disabled") === "true" ||
          card.dataset.stepCategoryDisabled === "true";
        if (disabled) return;

        const slug = card.dataset.stepCategory;
        if (!slug || select.value === slug) return;
        select.value = slug;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
    });

    this.updateCategoryCards(this.currentSelectableCategory());
  }

  updateCategoryCards(selectedSlug) {
    const cards = this.element.querySelectorAll("[data-step-category]");
    cards.forEach((card) => {
      card.classList.toggle("selected", card.dataset.stepCategory === selectedSlug);
    });
  }

  bindCategorySelect() {
    if (!this.categorySelect) return;
    this.categorySelect.addEventListener("change", () => {
      this.activeLaneKey = null;
      this.syncCategoryCriteria();
      this.syncNamePlaceholder();
      this.syncLaneGroups();
      this.markActiveLane(null);
      this.maybeApplyDefaultLane({ force: true });
      this.refreshReview();
    });
  }

  syncNamePlaceholder() {
    if (!this.nameInput) return;

    const fromMap = this.namePlaceholderMapValue[this.currentSelectableCategory()];
    if (fromMap) this.nameInput.placeholder = fromMap;
  }

  syncCategoryCriteria() {
    const selectedCategory = this.currentSelectableCategory();
    const criteriaType = criteriaPanelTypeFor(selectedCategory);
    this.updateCategoryCards(selectedCategory);
    this.toggleCriteriaSections(criteriaType);
    this.syncCriteriaTip(selectedCategory);
    this.syncReviewCriteriaSections();
  }

  syncCriteriaTip(categorySlug) {
    if (!this.hasCriteriaTipTarget) return;
    const active = criteriaChromeTypeFor(categorySlug);
    this.criteriaTipTargets.forEach((tip) => {
      const on = tip.dataset.criteriaTipType === active;
      tip.classList.toggle("hidden", !on);
      tip.toggleAttribute("hidden", !on);
    });
  }

  syncReviewCriteriaSections() {
    if (!this.hasReviewCriteriaSectionTarget) return;

    const activeType = criteriaPanelTypeFor(this.selectedCategorySlug());

    this.reviewCriteriaSectionTargets.forEach((section) => {
      const sectionType = section.dataset.categoryReviewType;
      // Fallback criteria was keywords-only; Search keywords row owns that now.
      const isActive = sectionType === activeType && sectionType !== "fallback";
      section.classList.toggle("hidden", !isActive);

      const valueEl = section.querySelector("[data-review-criteria-value]");
      if (valueEl) {
        valueEl.textContent = isActive
          ? criteriaSummaryForReviewType(
              sectionType,
              (id) => this.readValue(id),
              realEstateLabelMapsFromSection(section),
            )
          : "—";
      }
    });
  }

  currentSelectableCategory() {
    if (!this.categorySelect) return this.lastSelectableCategory || "custom";

    // Edit locks category as a hidden input; create uses a <select>.
    if (!(this.categorySelect instanceof HTMLSelectElement)) {
      const value = this.categorySelect.value?.trim();
      if (value) {
        this.lastSelectableCategory = value;
        return value;
      }
      return this.lastSelectableCategory || "custom";
    }

    const selectedOption = this.categorySelect.selectedOptions?.[0];
    if (selectedOption && !selectedOption.disabled) {
      this.lastSelectableCategory = this.categorySelect.value;
      return this.categorySelect.value;
    }

    const firstSelectableOption = Array.from(this.categorySelect.options).find(
      (option) => !option.disabled,
    );
    if (!firstSelectableOption) {
      return this.lastSelectableCategory || "custom";
    }

    this.categorySelect.value = firstSelectableOption.value;
    this.lastSelectableCategory = firstSelectableOption.value;
    return firstSelectableOption.value;
  }

  toggleCriteriaSections(criteriaType) {
    if (!this.hasCategoryCriteriaSectionTarget) return;

    this.categoryCriteriaSectionTargets.forEach((section) => {
      const isActive = section.dataset.categoryCriteriaType === criteriaType;
      section.classList.toggle("hidden", !isActive);
      const fieldset = section.querySelector("fieldset");
      if (fieldset) fieldset.disabled = !isActive;
    });
  }

  readValue(id) {
    return readField(this.element, id, this.activeCategoryCriteriaSection());
  }

  selectedCategoryLabel() {
    const select = this.categorySelect;
    if (!select) return "—";

    const selectedOption = select.selectedOptions?.[0];
    if (selectedOption?.textContent?.trim()) {
      return selectedOption.textContent.trim();
    }

    if (select.dataset.categoryLabel?.trim()) {
      return select.dataset.categoryLabel.trim();
    }

    const cardTitle = select
      .closest(".wiz-field")
      ?.querySelector(".cat-card.selected .cat-card-title")
      ?.textContent?.trim();
    if (cardTitle) return cardTitle;

    const slug = select.value?.trim();
    if (slug) {
      return slug.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
    }

    return "—";
  }

  writeTarget(name, value) {
    const targetName = `has${name.charAt(0).toUpperCase() + name.slice(1)}Target`;
    if (this[targetName]) this[`${name}Target`].textContent = value || "—";
  }
}
