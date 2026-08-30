import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static targets = ["intervalButton", "tierCard", "tierField", "intervalField", "submitButton"];
  static values = {
    currentTier: String,
    currentInterval: { type: String, default: "monthly" },
    tier: String,
    interval: { type: String, default: "monthly" },
  };

  connect() {
    this.tierValue = this.currentTierValue;
    this.intervalValue = this.currentIntervalValue;
    this.syncIntervalButtons();
    this.syncTierCards();
    this.syncTierPricing();
    this.syncFields();
    this.syncSubmitButton();
  }

  setInterval(event) {
    event.preventDefault();
    const next = event.currentTarget.dataset.interval;
    if (!next || next === this.intervalValue) return;

    this.intervalValue = next;
    this.syncIntervalButtons();
    this.syncTierPricing();
    this.syncFields();
    this.syncSubmitButton();
  }

  selectTier(event) {
    event.preventDefault();
    const next = event.currentTarget.dataset.tier;
    if (!next || next === this.tierValue) return;

    this.tierValue = next;
    this.syncTierCards();
    this.syncFields();
    this.syncSubmitButton();
  }

  syncIntervalButtons() {
    if (!this.hasIntervalButtonTarget) return;

    this.intervalButtonTargets.forEach((btn) => {
      btn.classList.toggle("on", btn.dataset.interval === this.intervalValue);
    });
  }

  syncTierCards() {
    if (!this.hasTierCardTarget) return;

    this.tierCardTargets.forEach((card) => {
      card.classList.toggle("sel", card.dataset.tier === this.tierValue);
    });
  }

  syncTierPricing() {
    if (!this.hasTierCardTarget) return;

    const annual = this.intervalValue === "annual";
    this.tierCardTargets.forEach((card) => {
      const amtEl = card.querySelector(".amt");
      const perEl = card.querySelector(".per");
      if (!amtEl || !perEl) return;

      if (annual) {
        amtEl.textContent = card.dataset.annualAmt;
        perEl.textContent = "/ yr";
      } else {
        amtEl.textContent = card.dataset.monthlyAmt;
        perEl.textContent = "/ mo";
      }
    });
  }

  syncFields() {
    if (this.hasTierFieldTarget) this.tierFieldTarget.value = this.tierValue;
    if (this.hasIntervalFieldTarget) this.intervalFieldTarget.value = this.intervalValue;
  }

  syncSubmitButton() {
    if (!this.hasSubmitButtonTarget) return;

    const same =
      this.tierValue === this.currentTierValue && this.intervalValue === this.currentIntervalValue;

    this.submitButtonTarget.disabled = same;

    if (same) {
      this.submitButtonTarget.textContent = "Current plan";
      return;
    }

    const tierChanged = this.tierValue !== this.currentTierValue;
    const name = this.tierValue.charAt(0).toUpperCase() + this.tierValue.slice(1);
    this.submitButtonTarget.textContent = tierChanged ? `Switch to ${name}` : "Update billing";
  }
}
