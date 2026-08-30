import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  connect() {
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE && node.id) {
              const duplicates = this.element.querySelectorAll(`[id="${CSS.escape(node.id)}"]`);
              /* Infinite scroll can append an ID Turbo already streamed; drop the duplicate node. */
              if (duplicates.length > 1 && node.parentNode) {
                node.parentNode.removeChild(node);
              }
            }
          });
        }
      }
    });

    this.observer.observe(this.element, { childList: true });
  }

  disconnect() {
    if (this.observer) {
      this.observer.disconnect();
    }
  }
}
