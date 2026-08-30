import { Controller } from "@hotwired/stimulus";
import { toast } from "lib/toast";

const DEBOUNCE_MS = 1500;

export default class extends Controller {
  static targets = ["status"];

  static values = {
    enabled: { type: Boolean, default: false },
    url: { type: String, default: "" },
  };

  connect() {
    this.debounceTimer = null;
    this.inFlight = false;
    this.pendingSave = false;
    this.firstSaveToasted = false;
    this.savedAt = null;
    this.failed = false;
    this.dirty = false;
    this.lastSavedSnapshot = null;
    this.suppressSchedule = false;

    if (!this.enabledValue || !this.urlValue) return;

    this.boundSchedule = this.scheduleSave.bind(this);
    this.element.addEventListener("input", this.boundSchedule, true);
    this.element.addEventListener("change", this.boundSchedule, true);

    // Child controllers (chip-input, combobox, …) hydrate on connect and may
    // dispatch input/change; capture a baseline after they settle so we do not
    // autosave in a loop when flushChipInputs re-dispatches the same values.
    this.suppressSchedule = true;
    requestAnimationFrame(() => {
      this.flushChipInputs();
      this.lastSavedSnapshot = this.formSnapshot();
      this.suppressSchedule = false;
    });
  }

  disconnect() {
    if (this.boundSchedule) {
      this.element.removeEventListener("input", this.boundSchedule, true);
      this.element.removeEventListener("change", this.boundSchedule, true);
    }

    if (this.enabledValue && (this.debounceTimer || this.pendingSave || this.dirty)) {
      this.flushPendingSave({ keepalive: true });
    }
    this.clearDebounce();
  }

  scheduleSave(event) {
    if (!this.enabledValue || this.suppressSchedule) return;
    if (event.target?.name === "authenticity_token") return;
    if (event.target?.name === "autosave") return;

    this.dirty = true;
    this.failed = false;
    this.clearDebounce();
    this.debounceTimer = window.setTimeout(() => this.saveNow(), DEBOUNCE_MS);
  }

  async flushBeforeLeave(event) {
    if (!this.enabledValue) return;

    event.preventDefault();
    this.clearDebounce();
    await this.saveNow();
    window.location.href = event.currentTarget.href;
  }

  retry(event) {
    event?.preventDefault();
    this.failed = false;
    this.saveNow({ force: true });
  }

  async saveNow({ force = false } = {}) {
    if (!this.enabledValue || this.inFlight) {
      this.pendingSave = true;
      return;
    }

    this.flushChipInputs();
    const snapshot = this.formSnapshot();
    if (!force && snapshot === this.lastSavedSnapshot) {
      this.dirty = false;
      this.pendingSave = false;
      this.clearDebounce();
      if (this.failed) {
        this.failed = false;
        if (this.savedAt) {
          this.setStatus("saved");
        } else if (this.hasStatusTarget) {
          this.statusTarget.hidden = true;
          this.statusTarget.textContent = "";
        }
      }
      return;
    }

    this.inFlight = true;
    this.pendingSave = false;
    this.setStatus("saving");

    const formData = new FormData(this.element);
    formData.set("search_profile[submit_kind]", "save_draft");
    formData.set("autosave", "1");

    try {
      const response = await fetch(this.urlValue, {
        method: "PATCH",
        body: formData,
        headers: {
          Accept: "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        credentials: "same-origin",
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        this.failed = true;
        this.setStatus("error");
        toast.error("Could not save draft", {
          detail: Array.isArray(payload.errors) ? payload.errors.join(". ") : "Try again.",
        });
        return;
      }

      this.dirty = false;
      this.lastSavedSnapshot = snapshot;
      this.savedAt = payload.updated_at ? new Date(payload.updated_at) : new Date();
      this.setStatus("saved");
      if (!this.firstSaveToasted) {
        this.firstSaveToasted = true;
        toast.success("Draft saved");
      }
    } catch (_err) {
      this.failed = true;
      this.setStatus("error");
      toast.error("Could not save draft", { detail: "Network error. Try again." });
    } finally {
      this.inFlight = false;
      if (this.pendingSave) {
        this.pendingSave = false;
        this.saveNow();
      }
    }
  }

  flushPendingSave({ keepalive = false } = {}) {
    this.clearDebounce();
    if (this.inFlight) {
      this.pendingSave = true;
      return;
    }

    this.flushChipInputs();
    const snapshot = this.formSnapshot();
    if (snapshot === this.lastSavedSnapshot && !this.failed) return;

    const formData = new FormData(this.element);
    formData.set("search_profile[submit_kind]", "save_draft");
    formData.set("autosave", "1");

    fetch(this.urlValue, {
      method: "PATCH",
      body: formData,
      headers: {
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      credentials: "same-origin",
      keepalive,
    }).catch(() => {});
  }

  flushChipInputs() {
    this.suppressSchedule = true;
    try {
      this.element.querySelectorAll('[data-controller~="chip-input"]').forEach((element) => {
        const controller = this.application.getControllerForElementAndIdentifier(
          element,
          "chip-input",
        );
        if (!controller) return;
        controller.commitPendingInput?.();
        controller.persist?.();
      });
    } finally {
      this.suppressSchedule = false;
    }
  }

  formSnapshot() {
    const formData = new FormData(this.element);
    formData.delete("autosave");

    const entries = [...formData.entries()]
      .filter(([name]) => name !== "authenticity_token")
      .sort(([left], [right]) => left.localeCompare(right));

    return JSON.stringify(entries);
  }

  clearDebounce() {
    if (!this.debounceTimer) return;
    window.clearTimeout(this.debounceTimer);
    this.debounceTimer = null;
  }

  setStatus(kind) {
    if (!this.hasStatusTarget) return;

    const el = this.statusTarget;
    el.classList.remove("wiz-autosave-status--error");

    if (kind === "saving") {
      el.textContent = "Saving…";
      el.hidden = false;
      return;
    }

    if (kind === "saved") {
      const time = this.savedAt ? this.formatTime(this.savedAt) : null;
      el.textContent = time ? `Saved · ${time}` : "Saved";
      el.hidden = false;
      return;
    }

    if (kind === "error") {
      el.innerHTML = "";
      const label = document.createElement("span");
      label.textContent = "Couldn't save · ";
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "wiz-autosave-status__retry";
      retry.textContent = "Retry";
      retry.addEventListener("click", (event) => this.retry(event));
      el.append(label, retry);
      el.classList.add("wiz-autosave-status--error");
      el.hidden = false;
    }
  }

  formatTime(date) {
    try {
      return new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
      }).format(date);
    } catch {
      return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }
  }
}
