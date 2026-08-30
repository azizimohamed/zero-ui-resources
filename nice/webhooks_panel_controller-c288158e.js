import { Controller } from "@hotwired/stimulus";

// Settings → Webhooks: CSS-driven tabs/filter, secret dismiss, enabled toggle via XHR.
export default class extends Controller {
  static targets = [
    "secret",
    "enabledSwitch",
    "enabledLabel",
    "statusDot",
    "statusLabel",
    "testButton",
  ];
  static values = { updateUrl: String };

  select(event) {
    const button = event.currentTarget;
    const group = button.closest("[data-wh-select]");
    if (!group) return;

    const value = button.dataset.value;
    const kind = group.dataset.whSelect;
    if (kind === "filter") group.dataset.filter = value;
    if (kind === "ref") group.dataset.refActive = value;

    group.querySelectorAll(".wh-tabs button").forEach((tab) => {
      const on = tab === button;
      tab.classList.toggle("on", on);
      if (tab.hasAttribute("aria-pressed")) {
        tab.setAttribute("aria-pressed", on ? "true" : "false");
      }
      if (tab.hasAttribute("aria-selected")) {
        tab.setAttribute("aria-selected", on ? "true" : "false");
      }
    });
  }

  dismissSecret(event) {
    event.preventDefault();
    if (this.hasSecretTarget) this.secretTarget.remove();
  }

  async toggleEnabled(event) {
    const el = event.currentTarget;
    if (!this.updateUrlValue || el.disabled) return;

    const previousOn = el.classList.contains("on");
    const enabled = !previousOn;
    this.#applyEnabled(enabled);
    el.disabled = true;

    const body = new FormData();
    body.append("enabled", enabled ? "1" : "0");

    try {
      const response = await fetch(this.updateUrlValue, {
        method: "PATCH",
        headers: {
          Accept: "application/json",
          "X-CSRF-Token": this.#csrfToken,
        },
        body,
        credentials: "same-origin",
      });

      if (!response.ok) {
        this.#applyEnabled(previousOn);
        return;
      }

      const data = await response.json();
      this.#applyEnabled(Boolean(data.enabled), data);
    } catch (_error) {
      this.#applyEnabled(previousOn);
    } finally {
      el.disabled = false;
    }
  }

  #applyEnabled(enabled, labels = {}) {
    if (this.hasEnabledSwitchTarget) {
      this.enabledSwitchTarget.classList.toggle("on", enabled);
      this.enabledSwitchTarget.setAttribute("aria-checked", enabled ? "true" : "false");
    }

    if (this.hasEnabledLabelTarget) {
      this.enabledLabelTarget.textContent =
        labels.enabled_label || (enabled ? "Enabled" : "Disabled");
    }

    if (this.hasStatusLabelTarget) {
      this.statusLabelTarget.textContent =
        labels.status_label || (enabled ? "Delivering" : "Paused");
    }

    if (this.hasStatusDotTarget) {
      this.statusDotTarget.classList.toggle("dot-live", enabled);
      this.statusDotTarget.classList.toggle("dot-muted", !enabled);
    }

    if (this.hasTestButtonTarget) {
      this.testButtonTarget.disabled = !enabled;
    }
  }

  get #csrfToken() {
    return document.querySelector('meta[name="csrf-token"]')?.content || "";
  }
}
