import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static targets = ["locationMode", "citySelect"];
  static values = { hasLegacyPlace: { type: Boolean, default: false } };

  connect() {
    this.syncCityRequired();
  }

  syncCityRequired() {
    if (!this.hasCitySelectTarget || !this.hasLocationModeTarget) return;

    const mode = this.locationModeTarget.value;
    const needsCities =
      (mode === "single_city" || mode === "multi_city") && !this.hasLegacyPlaceValue;
    this.citySelectTarget.required = needsCities;
  }
}
