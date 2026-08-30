import { Controller } from "@hotwired/stimulus";
import { confirmAction, payloadFromElement, themeToVariant, inferConfirmLabel } from "lib/confirm";

/** For non-Turbo forms: show confirm modal, then submit via the clicked button. */
export default class extends Controller {
  static values = {
    message: String,
    theme: { type: String, default: "primary" },
  };

  async submit(event) {
    event.preventDefault();
    const btn = event.currentTarget;
    const form = btn.form;
    if (form && !form.reportValidity()) return;

    const payload = payloadFromElement(btn) || payloadFromElement(form);
    const ok = payload
      ? await confirmAction(payload)
      : await confirmAction({
          title: this.messageValue,
          variant: themeToVariant(this.themeValue),
          confirmLabel: inferConfirmLabel(this.messageValue),
        });
    if (!ok) return;
    form?.requestSubmit(btn);
  }
}
