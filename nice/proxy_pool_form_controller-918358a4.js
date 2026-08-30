import { Controller } from "@hotwired/stimulus";

// Reveal managed-IP capacity when Backconnect is checked.
// Live-preview fleet share % as weight changes (templates match Proxies::FleetShare).
export default class extends Controller {
  static targets = ["backconnect", "managedIps", "weight", "shareHint"];
  static values = {
    otherTotal: { type: Number, default: 0 },
    otherCount: { type: Number, default: 0 },
    inRotation: { type: Boolean, default: false },
    hintEmpty: { type: String, default: "" },
    hintInRotation: { type: String, default: "" },
    hintIdle: { type: String, default: "" },
  };

  connect() {
    this.sync();
    this.refreshShare();
  }

  sync() {
    if (!this.hasManagedIpsTarget || !this.hasBackconnectTarget) return;

    const on = this.backconnectTarget.checked;
    this.managedIpsTarget.hidden = !on;
    this.managedIpsTarget.setAttribute("aria-hidden", on ? "false" : "true");
  }

  refreshShare() {
    if (!this.hasShareHintTarget || !this.hasWeightTarget) return;

    const weight = Math.max(parseInt(this.weightTarget.value, 10) || 0, 1);
    const total = this.otherTotalValue + weight;
    const peers = this.otherCountValue + 1;
    if (total <= 0) {
      this.shareHintTarget.textContent = this.hintEmptyValue;
      return;
    }

    const percent = Math.round((weight * 100) / total);
    const poolWord = peers === 1 ? "pool" : "pools";
    const template = this.inRotationValue ? this.hintInRotationValue : this.hintIdleValue;
    this.shareHintTarget.textContent = template
      .replaceAll("%{percent}", String(percent))
      .replaceAll("%{weight}", String(weight))
      .replaceAll("%{total}", String(total))
      .replaceAll("%{peers}", String(peers))
      .replaceAll("%{pool_word}", poolWord)
      .replaceAll("%%", "%");
  }
}
