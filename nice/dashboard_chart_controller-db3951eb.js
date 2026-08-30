import { Controller } from "@hotwired/stimulus";

const TOOLTIP_CLASS = "chart-tooltip";
const TOOLTIP_VERTICAL_GAP_PX = 10;
const TOOLTIP_EDGE_INSET_PX = 6;

/** After Turbo/HTML swap, copy these from the fresh SVG root so tooltips read the visible range. */
const CHART_DATA_ATTR_NAMES = [
  "data-labels",
  "data-discovered-series",
  "data-matched-series",
  "data-ribbon-series",
  "data-series-labels",
  "data-plot-config",
];
const DEFAULT_SERIES_LABELS = ["Discovered", "Matched"];
const CHART_ROOT_ATTR_NAMES = [
  "viewBox",
  "preserveAspectRatio",
  "style",
  "data-scrollable",
  ...CHART_DATA_ATTR_NAMES,
];

const PERIOD_BUTTON_ACTIVE_CLASS = "dashboard-seg__item on";
const PERIOD_BUTTON_INACTIVE_CLASS = "dashboard-seg__item";
const PERIOD_META_TARGETS = ["periodBadge", "summaryDiscovered", "summaryMatched"];

export default class extends Controller {
  static targets = [
    "form",
    "chart",
    "tooltipHost",
    "readout",
    "periodBadge",
    "summaryDiscovered",
    "summaryMatched",
  ];

  connect() {
    this.activeIndex = null;
    this.highlightedIndex = null;
    this.defaultReadoutHtml = this.hasReadoutTarget ? this.readoutTarget.innerHTML : null;
    this.bindChartHover();
  }

  disconnect() {
    this.#unbindHoverLayer();
  }

  changePeriod(event) {
    event.preventDefault();
    const period = event.target.value;

    const formData = new FormData(this.formTarget);
    formData.set("chart_period", period);

    const params = new URLSearchParams(formData);
    fetch(`${this.formTarget.action}?${params}`, {
      headers: { Accept: "text/vnd.turbo-stream.html, text/html" },
    })
      .then((r) => r.text())
      .then((html) => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        const newChart = doc.querySelector('[data-dashboard-chart-target="chart"]');
        if (!newChart) return;

        this.#unbindHoverLayer();
        this.chartTarget.innerHTML = newChart.innerHTML;
        for (const attr of CHART_ROOT_ATTR_NAMES) {
          const v = newChart.getAttribute(attr);
          if (v != null) this.chartTarget.setAttribute(attr, v);
          else this.chartTarget.removeAttribute(attr);
        }
        this.#syncPeriodButtons(period);
        this.#syncPeriodMeta(doc);
        this.activeIndex = null;
        this.highlightedIndex = null;
        this.bindChartHover();
      });
  }

  #syncPeriodMeta(doc) {
    for (const targetName of PERIOD_META_TARGETS) {
      if (!this.targets.has(targetName)) continue;
      const current = this.targets.find(targetName);
      const next = doc.querySelector(`[data-dashboard-chart-target="${targetName}"]`);
      if (next) current.textContent = next.textContent;
    }

    if (this.hasReadoutTarget) {
      const nextReadout = doc.querySelector('[data-dashboard-chart-target="readout"]');
      if (nextReadout) {
        this.readoutTarget.innerHTML = nextReadout.innerHTML;
        this.defaultReadoutHtml = this.readoutTarget.innerHTML;
      }
    }
  }

  /** Root <svg> keeps data-* attrs; innerHTML swap only replaces children — tooltips read those attrs. */
  #syncPeriodButtons(activePeriod) {
    const form = this.formTarget;
    if (!form) return;
    const buttons = form.querySelectorAll('button[type="button"][name="chart_period"]');
    buttons.forEach((btn) => {
      const isActive = btn.value === activePeriod;
      btn.className = isActive ? PERIOD_BUTTON_ACTIVE_CLASS : PERIOD_BUTTON_INACTIVE_CLASS;
    });
  }

  /** Non-scrolling host so tooltips do not extend scroll width of overflow-x chart. */
  get chartHost() {
    return this.hasTooltipHostTarget ? this.tooltipHostTarget : this.chartTarget.parentElement;
  }

  bindChartHover() {
    this.#loadPlotConfig();

    const layer = this.chartTarget.querySelector(".dashboard-throughput-chart__hover-layer");
    if (!layer || !this.plotConfig) return;

    this.#bindHoverLayer(layer);
  }

  #loadPlotConfig() {
    const config = this.#parseJsonAttr("data-plot-config", null);
    this.plotConfig =
      config && Array.isArray(config.x_positions) && config.x_positions.length > 0 ? config : null;
  }

  #bindHoverLayer(layer) {
    this.hoverLayer = layer;

    this.onHoverMove = (event) => {
      const index = this.#indexFromClientX(event.clientX);
      if (index === this.activeIndex) return;

      this.activeIndex = index;
      this.#highlightPoint(index);
      this.#updateReadout(index);
      if (!this.hasReadoutTarget) this.showTooltipAtIndex(index);
    };

    this.onHoverLeave = () => {
      this.activeIndex = null;
      this.#highlightPoint(null);
      this.#resetReadout();
      if (!this.hasReadoutTarget) this.hideTooltip();
    };

    layer.addEventListener("mousemove", this.onHoverMove);
    layer.addEventListener("mouseleave", this.onHoverLeave);
  }

  #unbindHoverLayer() {
    if (!this.hoverLayer) return;

    this.hoverLayer.removeEventListener("mousemove", this.onHoverMove);
    this.hoverLayer.removeEventListener("mouseleave", this.onHoverLeave);
    this.hoverLayer = null;
  }

  hideTooltip() {
    const existing = this.chartHost?.querySelector(`.${TOOLTIP_CLASS}`);
    if (existing) existing.remove();
  }

  showTooltipAtIndex(index) {
    this.hideTooltip();

    const discoveredValue = this.getDataValue("discovered", index);
    const matchedValue = this.getDataValue("matched", index);
    const label = this.getLabel(index);

    const tooltip = this.#buildTooltipElement(index, label, discoveredValue, matchedValue);

    this.chartHost.style.position = "relative";
    this.chartHost.appendChild(tooltip);

    const tooltipRect = tooltip.getBoundingClientRect();
    const anchorRect = this.#anchorRectForIndex(index, discoveredValue, matchedValue);
    const hostRect = this.chartHost.getBoundingClientRect();
    const { left, top } = this.#positionTooltip(
      tooltipRect.width,
      tooltipRect.height,
      anchorRect,
      hostRect,
    );

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  /** Centered on point; clamped inside tooltip host to avoid overflow-x scroll. */
  #positionTooltip(tooltipW, tooltipH, anchorRect, hostRect) {
    const inset = TOOLTIP_EDGE_INSET_PX;
    const hostW = this.chartHost.clientWidth;

    let left = anchorRect.left - hostRect.left + anchorRect.width / 2 - tooltipW / 2;
    const maxLeft = hostW - tooltipW - inset;
    if (maxLeft < inset) left = inset;
    else left = Math.max(inset, Math.min(left, maxLeft));

    let top = anchorRect.top - hostRect.top - tooltipH - TOOLTIP_VERTICAL_GAP_PX;
    if (top < inset) {
      top = anchorRect.top - hostRect.top + anchorRect.height + TOOLTIP_VERTICAL_GAP_PX;
    }
    const maxTop = this.chartHost.clientHeight - tooltipH - inset;
    if (top > maxTop) top = Math.max(inset, maxTop);

    return { left, top };
  }

  #buildTooltipElement(index, label, discoveredValue, matchedValue) {
    const tooltip = document.createElement("div");
    tooltip.className = TOOLTIP_CLASS;
    tooltip.dataset.index = String(index);

    const labelEl = document.createElement("div");
    labelEl.className = "chart-tooltip__label";
    labelEl.textContent = label;
    tooltip.appendChild(labelEl);

    const seriesLabels = this.#seriesLabels();
    for (const [rowLabel, value] of [
      [seriesLabels[0], discoveredValue],
      [seriesLabels[1], matchedValue],
    ]) {
      const row = document.createElement("div");
      row.className = "chart-tooltip__row";
      row.append(`${rowLabel}: `);
      const strong = document.createElement("strong");
      strong.textContent = String(value);
      row.appendChild(strong);
      tooltip.appendChild(row);
    }

    return tooltip;
  }

  #seriesLabels() {
    const labels = this.#parseJsonAttr("data-series-labels", null);
    if (Array.isArray(labels) && labels.length >= 2) return labels;
    return DEFAULT_SERIES_LABELS;
  }

  #parseJsonAttr(attrName, fallback) {
    const attr = this.chartTarget.getAttribute(attrName);
    if (!attr) return fallback;
    try {
      return JSON.parse(attr);
    } catch {
      return fallback;
    }
  }

  getDataValue(series, index) {
    const values = this.#parseJsonAttr(`data-${series}-series`, null);
    if (!Array.isArray(values)) return 0;
    return values[index] ?? 0;
  }

  #updateReadout(index) {
    if (!this.hasReadoutTarget) return;

    const requests = this.getDataValue("discovered", index);
    const successes = this.getDataValue("matched", index);
    const failures = this.getDataValue("ribbon", index);
    const okPct = requests > 0 ? ((100 * successes) / requests).toFixed(1) : "0.0";
    const label = this.getLabel(index);

    this.readoutTarget.replaceChildren();
    this.readoutTarget.append(`${label} · `);
    const strong = document.createElement("b");
    strong.textContent = this.#formatCount(requests);
    this.readoutTarget.append(
      strong,
      ` req · ${okPct}% ok · ${this.#formatCount(failures)} failed`,
    );
  }

  #resetReadout() {
    if (!this.hasReadoutTarget || this.defaultReadoutHtml == null) return;
    this.readoutTarget.innerHTML = this.defaultReadoutHtml;
  }

  #formatCount(value) {
    return Number(value).toLocaleString();
  }

  getLabel(index) {
    const labels = this.#parseJsonAttr("data-labels", null);
    if (!Array.isArray(labels)) return "N/A";
    return labels[index] ?? "N/A";
  }

  #clientXToSvgX(clientX) {
    const ctm = this.chartTarget.getScreenCTM();
    if (!ctm) return null;

    const point = this.chartTarget.createSVGPoint();
    point.x = clientX;
    point.y = 0;
    return point.matrixTransform(ctm.inverse()).x;
  }

  #indexFromClientX(clientX) {
    if (!this.plotConfig) return 0;

    const svgX = this.#clientXToSvgX(clientX);
    if (svgX == null) return this.activeIndex ?? 0;

    const { x_positions: xs } = this.plotConfig;
    let nearest = 0;
    let minDist = Infinity;
    for (let i = 0; i < xs.length; i += 1) {
      const dist = Math.abs(xs[i] - svgX);
      if (dist < minDist) {
        minDist = dist;
        nearest = i;
      }
    }
    return nearest;
  }

  #plotMatchedValue(index, matchedValue) {
    const plotted = this.plotConfig?.plot_matched_series;
    if (Array.isArray(plotted) && plotted[index] != null) return plotted[index];
    return matchedValue;
  }

  #yAt(value) {
    const { pad_top: padTop, pad_bottom: padBottom, height, chart_max: chartMax } = this.plotConfig;
    const plotHeight = height - padTop - padBottom;
    const baselineY = height - padBottom;
    const y = padTop + (1 - value / chartMax) * plotHeight;
    return Math.min(y, baselineY);
  }

  #anchorRectForIndex(index, discoveredValue, matchedValue) {
    const ctm = this.chartTarget.getScreenCTM();
    if (!ctm || !this.plotConfig) {
      return { left: 0, top: 0, width: 0, height: 0 };
    }

    const x = this.plotConfig.x_positions[index] ?? 0;
    const plottedMatched = this.#plotMatchedValue(index, matchedValue);
    const anchorY = Math.min(this.#yAt(discoveredValue), this.#yAt(plottedMatched));
    const point = this.chartTarget.createSVGPoint();
    point.x = x;
    point.y = anchorY;
    const screen = point.matrixTransform(ctm);

    return {
      left: screen.x,
      top: screen.y,
      width: 0,
      height: 0,
    };
  }

  #highlightPoint(index) {
    if (this.highlightedIndex === index) return;

    if (this.highlightedCircles) {
      this.highlightedCircles.forEach((circle) => {
        circle.classList.remove("dashboard-throughput-chart__point--active");
      });
    }

    this.highlightedIndex = index;
    if (index == null) {
      this.highlightedCircles = null;
      return;
    }

    this.highlightedCircles = this.chartTarget.querySelectorAll(`[data-index="${index}"]`);
    this.highlightedCircles.forEach((circle) => {
      circle.classList.add("dashboard-throughput-chart__point--active");
    });
  }
}
