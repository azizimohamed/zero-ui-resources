import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static targets = ["form", "answer", "detail"];

  pick({ params, currentTarget }) {
    if (this.submitting) return;

    this.element.querySelectorAll(".source-opt").forEach((b) => {
      b.classList.toggle("is-on", b === currentTarget);
    });
    this.answerTarget.value = params.value;

    const isOther = currentTarget.dataset.other === "true";
    this.detailTarget.hidden = !isOther;
    if (isOther) {
      this.detailTarget.querySelector("input[type=text]")?.focus();
      return;
    }

    // Chip tap persists immediately (handoff and strip). "Other" waits for Send.
    this.submitting = true;
    this.element.querySelectorAll(".source-opt").forEach((b) => {
      b.disabled = true;
    });
    this.formTarget.requestSubmit();
  }
}
