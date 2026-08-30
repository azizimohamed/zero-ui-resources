import { Controller } from "@hotwired/stimulus";
import { toast } from "lib/toast";

/** Mounts the shared toast stack and adopts Turbo-stream-appended cards. */
export default class extends Controller {
  connect() {
    toast.mount(this.element);
    this._observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;
          if (node.classList?.contains("tst")) toast.adoptServerToast(node);
          node.querySelectorAll?.(".tst").forEach((el) => toast.adoptServerToast(el));
        });
      }
    });
    this._observer.observe(this.element, { childList: true });
  }

  disconnect() {
    this._observer?.disconnect();
  }
}
