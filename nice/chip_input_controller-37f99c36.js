import { Controller } from "@hotwired/stimulus";
import { reportFieldValidity } from "validation_anchor";
import { searchKeywordTokens } from "wizard/criteria";

export default class extends Controller {
  static targets = ["hidden", "chips", "input", "addButton"];

  static values = {
    required: { type: Boolean, default: false },
    chipClass: { type: String, default: "exclude" },
    removeLabelPrefix: { type: String, default: "Remove" },
  };

  connect() {
    this.chipsTarget.innerHTML = "";
    this.syncFromHidden();
    this.syncAddButtonState();
    this.bindFormFlush();
  }

  disconnect() {
    this.unbindFormFlush();
  }

  add(event) {
    event.preventDefault();
    this.commitInput();
  }

  addClick() {
    this.commitInput();
  }

  focusInput() {
    this.inputTarget.focus();
  }

  onInvalid(event) {
    event.preventDefault();
    reportFieldValidity(this.hiddenTarget);
  }

  commitInput() {
    this.commitTokensFromInput();
    this.persist();
  }

  syncAddButtonState() {
    if (!this.hasAddButtonTarget) return;
    const hasText = this.inputTarget.value.trim().length > 0;
    this.addButtonTarget.classList.toggle("btn-primary", hasText);
  }

  appendChip(text) {
    const pill = document.createElement("span");
    pill.className = `chip ${this.chipClassValue}`;
    pill.dataset.chipValue = text;
    pill.setAttribute("role", "listitem");

    const label = document.createElement("span");
    label.textContent = text;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "chip-x";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `${this.removeLabelPrefixValue} ${text}`);
    remove.title = `${this.removeLabelPrefixValue} ${text}`;
    remove.addEventListener("click", () => {
      pill.remove();
      this.persist();
    });

    pill.appendChild(label);
    pill.appendChild(remove);
    this.chipsTarget.appendChild(pill);
  }

  persist() {
    const values = this.chipValueNodes().map((node) => node.dataset.chipValue.trim());
    const next = values.join(",");
    const changed = this.hiddenTarget.value !== next;
    this.hiddenTarget.value = next;
    this.validateRequired();
    if (changed) {
      this.hiddenTarget.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  validateRequired() {
    // type=hidden is barred from constraint validation — keep customValidity on the
    // visible entry so wizard Continue / form submit can checkValidity() it.
    const message =
      this.requiredValue && this.chipValueNodes().length === 0
        ? "Add at least one keyword and press Enter."
        : "";
    this.hiddenTarget.setCustomValidity(message);
    if (this.hasInputTarget) this.inputTarget.setCustomValidity(message);
  }

  syncFromHidden() {
    const uniqueTokens = [...new Set(this.normalizedTokens(this.hiddenTarget.value))];
    uniqueTokens.forEach((token) => this.appendChip(token));
    this.persist();
  }

  replaceTokens(csv) {
    if (!this.hasChipsTarget || !this.hasHiddenTarget) return;
    this.chipsTarget.innerHTML = "";
    this.hiddenTarget.value = csv || "";
    this.syncFromHidden();
    this.syncAddButtonState();
  }

  normalizedTokens(value) {
    return searchKeywordTokens(value);
  }

  normalizedToken(value) {
    return this.normalizedTokens(value)[0] || "";
  }

  hasToken(value) {
    const normalized = this.normalizedToken(value).toLowerCase();
    if (!normalized) return false;

    return this.chipValueNodes().some(
      (node) => node.dataset.chipValue.toLowerCase() === normalized,
    );
  }

  chipValueNodes() {
    return [...this.chipsTarget.querySelectorAll("[data-chip-value]")];
  }

  bindFormFlush() {
    this.formElement = this.element.closest("form");
    if (!this.formElement) return;

    this.flushHandler = () => {
      this.commitPendingInput();
      this.persist();
    };
    this.formElement.addEventListener("submit", this.flushHandler, { capture: true });
  }

  unbindFormFlush() {
    if (!this.formElement || !this.flushHandler) return;

    this.formElement.removeEventListener("submit", this.flushHandler, { capture: true });
  }

  commitPendingInput() {
    this.commitTokensFromInput();
  }

  commitTokensFromInput() {
    const tokens = this.normalizedTokens(this.inputTarget.value);
    if (tokens.length === 0) return;

    tokens.forEach((token) => {
      if (!this.hasToken(token)) this.appendChip(token);
    });
    this.inputTarget.value = "";
    this.syncAddButtonState();
  }
}
