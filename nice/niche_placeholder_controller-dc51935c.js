import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static targets = ["select", "nameInput"];
  static values = { map: Object };

  connect() {
    this.update();
  }

  update() {
    if (!this.hasSelectTarget || !this.hasNameInputTarget) return;

    const niche = this.selectTarget.value;
    const fallback = "My workspace";
    const placeholder = this.mapValue[niche] || fallback;
    this.nameInputTarget.placeholder = placeholder;
  }
}
