import { Controller } from "@hotwired/stimulus";
import { toast } from "lib/toast";

/** Server-rendered toast card — lifecycle owned by lib/toast once adopted. */
export default class extends Controller {
  static targets = ["count", "detail", "progress"];
  static values = {
    dismissAfter: { type: Number, default: 5000 },
    title: String,
    detail: String,
  };

  connect() {
    toast.adoptServerToast(this.element);
  }

  dismiss(event) {
    event?.preventDefault();
    const id = this.element.dataset.toastId;
    if (id) toast.dismiss(id);
  }

  action(event) {
    // Server-rendered action buttons without href are no-ops unless wired by JS API.
    event?.preventDefault();
  }
}
