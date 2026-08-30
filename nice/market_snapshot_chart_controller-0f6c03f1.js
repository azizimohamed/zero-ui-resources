import { Controller } from "@hotwired/stimulus";

const TOOLTIP_CLASS = "chart-tooltip";
const TOOLTIP_VERTICAL_GAP_PX = 10;
const TOOLTIP_EDGE_INSET_PX = 6;

/**
 * Hover tooltips for Market Snapshot histogram bars and trend points.
 * Expects [data-ms-tip] nodes with data-ms-tip-k, data-ms-tip-v, data-ms-cx, data-ms-cy
 * in SVG user units, plus optional data-ms-opacity / data-ms-mark for highlight restore.
 */
export default class extends Controller {
  static targets = ["svg", "guide"];

  connect() {
    this.activeEl = null;
    this.onEnter = (event) => this.#showFor(event.currentTarget);
    this.onLeave = () => this.#clear();
    this.#bindTips();
  }

  disconnect() {
    this.#unbindTips();
    this.#clear();
  }

  #bindTips() {
    this.tipNodes = Array.from(this.element.querySelectorAll("[data-ms-tip]"));
    this.tipNodes.forEach((node) => {
      node.addEventListener("pointerenter", this.onEnter);
      node.addEventListener("pointerleave", this.onLeave);
      node.addEventListener("focus", this.onEnter);
      node.addEventListener("blur", this.onLeave);
    });
  }

  #unbindTips() {
    if (!this.tipNodes) return;
    this.tipNodes.forEach((node) => {
      node.removeEventListener("pointerenter", this.onEnter);
      node.removeEventListener("pointerleave", this.onLeave);
      node.removeEventListener("focus", this.onEnter);
      node.removeEventListener("blur", this.onLeave);
    });
    this.tipNodes = null;
  }

  #showFor(el) {
    if (!el || this.activeEl === el) return;
    this.#clearHighlight();
    this.activeEl = el;
    this.#applyHighlight(el);
    this.#positionGuide(el);
    this.#renderTooltip(el);
  }

  #clear() {
    this.#clearHighlight();
    this.hideTooltip();
    this.#hideGuide();
    this.activeEl = null;
  }

  #applyHighlight(el) {
    const mark = el.dataset.msMark;
    if (mark === "bar") {
      const bar = el.dataset.msBarId
        ? this.element.querySelector(`[data-ms-bar="${el.dataset.msBarId}"]`)
        : null;
      if (bar) {
        bar.dataset.msPrevOpacity = bar.getAttribute("fill-opacity") || "";
        bar.setAttribute("fill-opacity", "1");
        bar.classList.add("ms-chart__bar--active");
      }
      el.classList.add("ms-chart__hit--active");
      return;
    }

    if (mark === "point") {
      const point = el.dataset.msPointId
        ? this.element.querySelector(`[data-ms-point="${el.dataset.msPointId}"]`)
        : null;
      if (point) {
        point.classList.add("ms-chart__point--active");
        point.setAttribute("r", "5");
      }
      el.classList.add("ms-chart__hit--active");
    }
  }

  #clearHighlight() {
    this.element.querySelectorAll(".ms-chart__bar--active").forEach((bar) => {
      const prev = bar.dataset.msPrevOpacity;
      if (prev !== undefined && prev !== "") bar.setAttribute("fill-opacity", prev);
      bar.classList.remove("ms-chart__bar--active");
      delete bar.dataset.msPrevOpacity;
    });
    this.element.querySelectorAll(".ms-chart__point--active").forEach((point) => {
      point.classList.remove("ms-chart__point--active");
      point.setAttribute("r", "3.4");
    });
    this.element.querySelectorAll(".ms-chart__hit--active").forEach((hit) => {
      hit.classList.remove("ms-chart__hit--active");
    });
  }

  #positionGuide(el) {
    if (!this.hasGuideTarget) return;
    const cx = Number(el.dataset.msCx);
    if (!Number.isFinite(cx)) {
      this.#hideGuide();
      return;
    }
    this.guideTarget.setAttribute("x1", String(cx));
    this.guideTarget.setAttribute("x2", String(cx));
    this.guideTarget.classList.add("ms-chart__guide--on");
  }

  #hideGuide() {
    if (!this.hasGuideTarget) return;
    this.guideTarget.classList.remove("ms-chart__guide--on");
  }

  hideTooltip() {
    const existing = this.element.querySelector(`.${TOOLTIP_CLASS}`);
    if (existing) existing.remove();
  }

  #renderTooltip(el) {
    this.hideTooltip();

    const key = el.dataset.msTipK || "";
    const value = el.dataset.msTipV || "";
    const tooltip = document.createElement("div");
    tooltip.className = TOOLTIP_CLASS;
    tooltip.setAttribute("role", "tooltip");

    const labelEl = document.createElement("div");
    labelEl.className = "chart-tooltip__label";
    labelEl.textContent = key;
    tooltip.appendChild(labelEl);

    const row = document.createElement("div");
    row.className = "chart-tooltip__row";
    const strong = document.createElement("strong");
    strong.textContent = value;
    row.appendChild(strong);
    tooltip.appendChild(row);

    this.element.style.position = "relative";
    this.element.appendChild(tooltip);

    const tooltipRect = tooltip.getBoundingClientRect();
    const hostRect = this.element.getBoundingClientRect();
    const anchor = this.#anchorRect(el);
    const { left, top } = this.#positionTooltip(
      tooltipRect.width,
      tooltipRect.height,
      anchor,
      hostRect,
    );

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  #anchorRect(el) {
    const svg = this.hasSvgTarget ? this.svgTarget : this.element.querySelector("svg");
    const ctm = svg?.getScreenCTM?.();
    const cx = Number(el.dataset.msCx);
    const cy = Number(el.dataset.msCy);
    if (!ctm || !Number.isFinite(cx) || !Number.isFinite(cy)) {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    }

    const point = svg.createSVGPoint();
    point.x = cx;
    point.y = cy;
    const screen = point.matrixTransform(ctm);
    return { left: screen.x, top: screen.y, width: 0, height: 0 };
  }

  #positionTooltip(tooltipW, tooltipH, anchorRect, hostRect) {
    const inset = TOOLTIP_EDGE_INSET_PX;
    const hostW = this.element.clientWidth;

    let left = anchorRect.left - hostRect.left + anchorRect.width / 2 - tooltipW / 2;
    const maxLeft = hostW - tooltipW - inset;
    if (maxLeft < inset) left = inset;
    else left = Math.max(inset, Math.min(left, maxLeft));

    let top = anchorRect.top - hostRect.top - tooltipH - TOOLTIP_VERTICAL_GAP_PX;
    if (top < inset) {
      top = anchorRect.top - hostRect.top + anchorRect.height + TOOLTIP_VERTICAL_GAP_PX;
    }
    const maxTop = this.element.clientHeight - tooltipH - inset;
    if (top > maxTop) top = Math.max(inset, maxTop);

    return { left, top };
  }
}
