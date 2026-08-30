import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static targets = ["input", "eyeOpen", "eyeClosed"];

  toggle() {
    const show = this.inputTarget.type === "password";
    this.inputTarget.type = show ? "text" : "password";
    if (this.hasEyeOpenTarget) this.eyeOpenTarget.classList.toggle("hidden", show);
    if (this.hasEyeClosedTarget) this.eyeClosedTarget.classList.toggle("hidden", !show);
    const btn = this.element.querySelector("[data-action*='toggle']");
    if (btn) btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
  }
}
