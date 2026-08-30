import { Controller } from "@hotwired/stimulus";

const TOOLTIP_CLASS = "chart-tooltip";
const GAP_PX = 10;
const INSET_PX = 6;

/** Hover tip for admin Ops demand donut slices. */
export default class extends Controller {
  static targets = ["host"];

  connect() {
    this.onEnter = (event) => this.#show(event.currentTarget, event);
    this.onLeave = () => this.#hide();
    this.onMove = (event) => this.#reposition(event);
    this.sliceNodes = Array.from(this.element.querySelectorAll("[data-admin-pie-tip]"));
    this.sliceNodes.forEach((node) => {
      node.addEventListener("pointerenter", this.onEnter);
      node.addEventListener("pointerleave", this.onLeave);
      node.addEventListener("pointermove", this.onMove);
    });
  }

  disconnect() {
    this.#hide();
    this.sliceNodes?.forEach((node) => {
      node.removeEventListener("pointerenter", this.onEnter);
      node.removeEventListener("pointerleave", this.onLeave);
      node.removeEventListener("pointermove", this.onMove);
    });
    this.sliceNodes = null;
  }

  #host() {
    return this.hasHostTarget ? this.hostTarget : this.element;
  }

  #show(node, event) {
    this.#hide();
    const label = node.dataset.adminPieTipLabel || "";
    const detail = node.dataset.adminPieTipDetail || "";
    const tooltip = document.createElement("div");
    tooltip.className = TOOLTIP_CLASS;
    tooltip.setAttribute("role", "tooltip");

    const labelEl = document.createElement("div");
    labelEl.className = "chart-tooltip__label";
    labelEl.textContent = label;
    tooltip.appendChild(labelEl);

    if (detail) {
      const row = document.createElement("div");
      row.className = "chart-tooltip__row";
      row.textContent = detail;
      tooltip.appendChild(row);
    }

    this.tooltip = tooltip;
    this.#host().appendChild(tooltip);
    this.#place(event);
    node.classList.add("admin-crawl-pie__slice--active");
    this.activeNode = node;
  }

  #reposition(event) {
    if (!this.tooltip) return;
    this.#place(event);
  }

  #place(event) {
    const host = this.#host();
    const hostRect = host.getBoundingClientRect();
    const tipRect = this.tooltip.getBoundingClientRect();
    let left = event.clientX - hostRect.left + GAP_PX;
    let top = event.clientY - hostRect.top - tipRect.height - GAP_PX;
    left = Math.min(Math.max(INSET_PX, left), host.clientWidth - tipRect.width - INSET_PX);
    top = Math.min(Math.max(INSET_PX, top), host.clientHeight - tipRect.height - INSET_PX);
    this.tooltip.style.left = `${left}px`;
    this.tooltip.style.top = `${top}px`;
  }

  #hide() {
    this.activeNode?.classList.remove("admin-crawl-pie__slice--active");
    this.activeNode = null;
    this.tooltip?.remove();
    this.tooltip = null;
  }
}
