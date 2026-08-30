import { Controller } from "@hotwired/stimulus";
import { closeSupportChat } from "lib/open_support_chat";
import { lockScroll, unlockScroll } from "lib/scroll_lock";

const CLOSE_MS = 200;

export default class extends Controller {
  static targets = ["overlay", "drawer"];
  static values = { glanceUrl: String, matchRef: String };

  connect() {
    this.#closeSupportChat();
    lockScroll(this);
    document.body.classList.add("drawer-open");
    this.closeTimeoutId = null;

    this.drawerTarget.focus({ preventScroll: true });

    this.boundKeydown = this.handleKeydown.bind(this);
    document.addEventListener("keydown", this.boundKeydown);

    this.recordGlance();
  }

  disconnect() {
    unlockScroll(this);
    document.body.classList.remove("drawer-open");
    document.removeEventListener("keydown", this.boundKeydown);
    if (this.closeTimeoutId != null) {
      clearTimeout(this.closeTimeoutId);
      this.closeTimeoutId = null;
    }
  }

  async recordGlance() {
    if (!this.hasGlanceUrlValue) return;

    try {
      const response = await fetch(this.glanceUrlValue, {
        method: "PATCH",
        headers: {
          Accept: "text/vnd.turbo-stream.html",
          "X-CSRF-Token": this.csrfToken(),
        },
        credentials: "same-origin",
      });
      if (!response.ok) return;

      const html = await response.text();
      if (html.trim().length > 0) {
        window.Turbo.renderStreamMessage(html);
      }
    } catch {
      // Drawer stays usable if glance fails; next navigation reconciles counts.
    }
  }

  csrfToken() {
    return document.querySelector('meta[name="csrf-token"]')?.content ?? "";
  }

  #closeSupportChat() {
    closeSupportChat(this.application);
  }

  close() {
    if (this.closeTimeoutId != null) {
      clearTimeout(this.closeTimeoutId);
      this.closeTimeoutId = null;
    }

    if (this.hasOverlayTarget) {
      this.overlayTarget.style.opacity = "0";
    }
    if (this.hasDrawerTarget) {
      this.drawerTarget.style.transform = "translateX(20px)";
      this.drawerTarget.style.opacity = "0";
    }

    const matchRef = this.hasMatchRefValue ? this.matchRefValue : null;

    this.closeTimeoutId = setTimeout(() => {
      this.closeTimeoutId = null;
      this.element.remove();
      if (matchRef) {
        document.dispatchEvent(
          new CustomEvent("match-drawer:closed", {
            detail: { matchRef },
          }),
        );
      }
    }, CLOSE_MS);
  }

  stopPropagation(event) {
    event.stopPropagation();
  }

  handleKeydown(event) {
    if (event.key === "Escape") {
      this.close();
    }
  }
}
