import { Controller } from "@hotwired/stimulus";
import {
  clearFixedDropdownStyles,
  positionFixedDropdown,
  restoreDropdownListPortal,
} from "fixed_dropdown_position";

const PANEL_MAX_HEIGHT = 560;
const PANEL_WIDTH = 380;
const PORTAL_Z_INDEX = "50";

// Desktop Filters popover on the matches Ask-vs-comp rail. The panel is portaled to
// body and positioned against the viewport so its footer (Clear / Show matches) stays
// on screen and only the field list scrolls.
export default class extends Controller {
  static targets = ["button", "panel"];

  connect() {
    this._onDocClick = this.onDocClick.bind(this);
    this._onKeyDown = this.onKeyDown.bind(this);
    this._onReposition = this.reposition.bind(this);
    this._onPanelSubmit = () => this.close();
    document.addEventListener("click", this._onDocClick);
    document.addEventListener("keydown", this._onKeyDown);
  }

  disconnect() {
    document.removeEventListener("click", this._onDocClick);
    document.removeEventListener("keydown", this._onKeyDown);
    this.close();
  }

  toggle(event) {
    event.preventDefault();
    event.stopPropagation();
    if (this.isOpen()) this.close();
    else this.open();
  }

  isOpen() {
    return this.element.classList.contains("open");
  }

  panel() {
    if (this._panel?.isConnected) return this._panel;
    return this.hasPanelTarget ? this.panelTarget : null;
  }

  open() {
    const panel = this.panel();
    if (!panel) return;

    this._panel = panel;
    this.element.classList.add("open");
    panel.removeAttribute("hidden");
    this.buttonTarget.setAttribute("aria-expanded", "true");
    panel.addEventListener("submit", this._onPanelSubmit);
    document.addEventListener("scroll", this._onReposition, true);
    window.addEventListener("resize", this._onReposition);
    this.reposition();
  }

  close() {
    const panel = this.panel();
    document.removeEventListener("scroll", this._onReposition, true);
    window.removeEventListener("resize", this._onReposition);
    this.element.classList.remove("open");
    if (this.hasButtonTarget) this.buttonTarget.setAttribute("aria-expanded", "false");
    if (!panel) return;

    panel.removeEventListener("submit", this._onPanelSubmit);
    panel.setAttribute("hidden", "");
    restoreDropdownListPortal(panel);
    clearFixedDropdownStyles(panel);
    this._panel = null;
  }

  reposition() {
    const panel = this.panel();
    if (!panel || !this.isOpen()) return;

    positionFixedDropdown(this.buttonTarget.getBoundingClientRect(), panel, {
      align: "right",
      gap: 6,
      margin: 12,
      width: Math.min(PANEL_WIDTH, window.innerWidth - 24),
      preferredMaxHeight: PANEL_MAX_HEIGHT,
      zIndex: PORTAL_Z_INDEX,
    });
  }

  onKeyDown(event) {
    if (event.key !== "Escape" || !this.isOpen()) return;

    this.close();
    // Return focus to the trigger so keyboard focus does not drop to the document.
    this.buttonTarget.focus();
  }

  onDocClick(event) {
    if (this.element.contains(event.target)) return;
    if (this.panel()?.contains(event.target)) return;

    this.close();
  }
}
