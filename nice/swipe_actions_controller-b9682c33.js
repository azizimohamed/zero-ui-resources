import { Controller } from "@hotwired/stimulus";
import { Turbo } from "@hotwired/turbo-rails";
import { visitMatchDrawer, visitTurboFrame, MATCH_SHEET_FRAME } from "match_drawer_visit";

export default class extends Controller {
  static targets = ["card", "leftAction", "rightAction", "link", "drawerLink"];
  static values = {
    url: String,
    leftAction: String, // e.g. "watchlist"
    rightAction: String, // e.g. "skipped"
  };

  connect() {
    this.startX = 0;
    this.startY = 0;
    this.currentX = 0;
    this.currentY = 0;
    this.isDragging = false;
    this.gestureAxis = null;
    this.hasSwiped = false;
    this.cardWidth = this.cardTarget.offsetWidth;
    this.threshold = this.cardWidth * 0.3;

    this._clickHandler = this.handleClick.bind(this);
    this.cardTarget.addEventListener("click", this._clickHandler, true);
  }

  disconnect() {
    this.cardTarget.removeEventListener("click", this._clickHandler, true);
  }

  handleClick(e) {
    /* Real links (e.g. Facebook) must not be intercepted — incl. after a swipe. */
    if (e.target.closest("a[href]")) return;

    if (this.hasSwiped) {
      e.preventDefault();
      e.stopPropagation();
      this.hasSwiped = false;
    } else if (!e.target.closest("button, input")) {
      // Prefer Turbo drawer link over legacy modal sheet
      if (this.hasDrawerLinkTarget) {
        e.preventDefault();
        visitMatchDrawer(this.drawerLinkTarget);
      } else if (this.hasLinkTarget) {
        e.preventDefault();
        visitTurboFrame(this.linkTarget, MATCH_SHEET_FRAME);
      } else if (this.cardTarget.dataset.externalUrl) {
        window.open(this.cardTarget.dataset.externalUrl, "_blank");
      }
    }
  }

  touchstart(e) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (e.touches.length !== 1) {
      this._cancelSwipeGesture();
      return;
    }

    this.startX = e.touches[0].clientX;
    this.startY = e.touches[0].clientY;
    this.currentX = 0;
    this.currentY = 0;
    this.isDragging = true;
    this.gestureAxis = null;
    this.hasSwiped = false;
    this.cardTarget.style.transition = "none";
  }

  touchmove(e) {
    if (!this.isDragging) return;
    if (e.touches.length !== 1) {
      this._cancelSwipeGesture();
      return;
    }

    this.currentX = e.touches[0].clientX - this.startX;
    this.currentY = e.touches[0].clientY - this.startY;
    const absX = Math.abs(this.currentX);
    const absY = Math.abs(this.currentY);

    // Wait for clear movement, then lock to one axis for natural feel.
    if (!this.gestureAxis) {
      if (absX < 8 && absY < 8) return;
      this.gestureAxis = absX > absY ? "x" : "y";
    }

    // Vertical intent should scroll the page, not drag the card.
    if (this.gestureAxis !== "x") {
      this._cancelSwipeGesture();
      return;
    }

    // List view owns horizontal pan for column scroll; do not steal it.
    if (this.element.closest(".m-rowscroll")) {
      this._cancelSwipeGesture();
      return;
    }

    if (e.cancelable) e.preventDefault();
    this.hasSwiped = absX > 12;

    this.cardTarget.style.transform = `translateX(${this.currentX}px)`;

    if (this.currentX > 0 && this.hasLeftActionTarget) {
      this.leftActionTarget.style.opacity = Math.min(this.currentX / this.threshold, 1);
      if (this.hasRightActionTarget) this.rightActionTarget.style.opacity = 0;
    } else if (this.currentX < 0 && this.hasRightActionTarget) {
      this.rightActionTarget.style.opacity = Math.min(Math.abs(this.currentX) / this.threshold, 1);
      if (this.hasLeftActionTarget) this.leftActionTarget.style.opacity = 0;
    }
  }

  _leftSwipeAction() {
    const fromCard = this.hasCardTarget && this.cardTarget.dataset.swipeLeftAction;
    return fromCard && fromCard.length > 0 ? fromCard : this.leftActionValue;
  }

  _rightSwipeAction() {
    const fromCard = this.hasCardTarget && this.cardTarget.dataset.swipeRightAction;
    return fromCard && fromCard.length > 0 ? fromCard : this.rightActionValue;
  }

  touchend(e) {
    if (!this.isDragging) return;
    this.isDragging = false;
    if (this.gestureAxis !== "x") {
      this._cancelSwipeGesture();
      return;
    }

    this.cardTarget.style.transition = "transform 0.3s ease-out";

    const leftAct = this._leftSwipeAction();
    const rightAct = this._rightSwipeAction();

    if (this.currentX > this.threshold && leftAct) {
      this.cardTarget.style.transform = `translateX(${this.cardWidth}px)`;
      this.performAction(leftAct);
    } else if (this.currentX < -this.threshold && rightAct) {
      this.cardTarget.style.transform = `translateX(-${this.cardWidth}px)`;
      this.performAction(rightAct);
    } else {
      this._revert();
    }

    this.currentX = 0;
    this.currentY = 0;
    this.gestureAxis = null;
  }

  touchcancel() {
    if (!this.isDragging) return;

    this._cancelSwipeGesture();
  }

  _cancelSwipeGesture() {
    this.isDragging = false;
    this.gestureAxis = null;
    this.currentX = 0;
    this.currentY = 0;
    this.hasSwiped = false;
    this.cardTarget.style.transition = "";
    this._revert();
  }

  async performAction(action) {
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
    if (!csrfToken) {
      console.error("CSRF meta tag missing");
      this._revert();
      return;
    }

    try {
      const response = await fetch(this.urlValue, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/vnd.turbo-stream.html",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({ user_action: action }),
      });

      if (response.ok) {
        Turbo.renderStreamMessage(await response.text());
      } else {
        this._revert();
      }
    } catch (error) {
      console.error("Action failed:", error);
      this._revert();
    }
  }

  _revert() {
    this.cardTarget.style.transform = "translateX(0)";
    if (this.hasLeftActionTarget) this.leftActionTarget.style.opacity = 0;
    if (this.hasRightActionTarget) this.rightActionTarget.style.opacity = 0;
  }

  triggerAction(e) {
    e.preventDefault();
    e.stopPropagation();

    const kind = e.currentTarget.dataset.actionKind;
    let action;

    if (kind === "watchlist" && this.hasCardTarget) {
      const watchlist = this.cardTarget.dataset.userWatchlist === "true";
      action = watchlist ? "neutral" : "watchlist";
    } else if (kind === "skip" && this.hasCardTarget) {
      const skipped = this.cardTarget.dataset.userSkipped === "true";
      action = skipped ? "neutral" : "skipped";
    } else {
      action = e.currentTarget.dataset.actionName;
    }

    if (!action) return;

    this.performAction(action);
  }
}
