import { Controller } from "@hotwired/stimulus";
import { Turbo } from "@hotwired/turbo-rails";

/**
 * Client-side year ladder controls: sort, hide low-sample, keep selected in view.
 * Overview columns dim when filtered; ladder rows reorder without a full reload.
 */
export default class extends Controller {
  static targets = ["note", "scroll", "rows", "row", "toggle", "sort", "overviewCol"];

  static values = {
    minListings: { type: Number, default: 20 },
    thinMin: { type: Number, default: 3 },
    selected: { type: String, default: "" },
    totalYears: { type: Number, default: 0 },
    totalListings: { type: Number, default: 0 },
    unit: { type: String, default: "years" },
  };

  connect() {
    this.hideLow = false;
    this.sortBy = "year";
    this.apply();
    // Defer scroll so Turbo Frame paint finishes before we nudge the ladder —
    // avoids a visible jump when the selected year was already on screen.
    requestAnimationFrame(() => this.keepSelectedInView());
  }

  toggleLow(event) {
    this.hideLow = !this.hideLow;
    if (this.hasToggleTarget) {
      this.toggleTarget.setAttribute("aria-pressed", this.hideLow ? "true" : "false");
    }
    this.apply();
    event.currentTarget?.blur?.();
  }

  sort(event) {
    const btn = event.target.closest("[data-sort]");
    if (!btn) return;
    this.sortBy = btn.dataset.sort;
    if (this.hasSortTarget) {
      this.sortTarget.querySelectorAll("[data-sort]").forEach((el) => {
        el.setAttribute("aria-pressed", el === btn ? "true" : "false");
      });
    }
    this.apply();
    this.keepSelectedInView();
  }

  apply() {
    const rows = this.rowTargets.slice();
    const visible = rows.filter((row) => {
      const thin = row.dataset.thin === "true";
      const selected = row.dataset.key === this.selectedValue;
      const show = !this.hideLow || !thin || selected;
      row.classList.toggle("is-filtered-out", !show);
      return show;
    });

    visible.sort((a, b) => {
      if (this.sortBy === "vol") {
        const dn = Number(b.dataset.n) - Number(a.dataset.n);
        if (dn !== 0) return dn;
        return String(b.dataset.year).localeCompare(String(a.dataset.year));
      }
      return Number(b.dataset.year) - Number(a.dataset.year);
    });

    if (this.hasRowsTarget) {
      visible.forEach((row) => this.rowsTarget.appendChild(row));
      rows
        .filter((row) => row.classList.contains("is-filtered-out"))
        .forEach((row) => this.rowsTarget.appendChild(row));
    }

    const hiddenCount = rows.length - visible.length;
    const unit = this.unitValue || "years";
    if (this.hasNoteTarget) {
      this.noteTarget.textContent =
        hiddenCount > 0
          ? `${visible.length} of ${this.totalYearsValue} ${unit} · ${hiddenCount} under ${this.thinMinValue} listings hidden`
          : `${this.totalYearsValue} ${unit}`;
    }

    this.overviewColTargets.forEach((col) => {
      const thin = col.dataset.thin === "true";
      const selected = col.dataset.key === this.selectedValue;
      const dim = this.hideLow && thin && !selected;
      col.classList.toggle("is-dim", dim);
      const bar = col.querySelector(".ms-overview__bar");
      if (bar && !col.classList.contains("is-on")) {
        bar.setAttribute("fill-opacity", dim ? "0.22" : "0.5");
      }
    });
  }

  keepSelectedInView() {
    if (!this.hasScrollTarget || !this.hasRowsTarget) return;
    const rows = this.rowTargets.filter((row) => !row.classList.contains("is-filtered-out"));
    const index = rows.findIndex((row) => row.dataset.key === this.selectedValue);
    if (index < 0) return;

    const head = 38;
    const rowH = 46;
    const top = head + index * rowH;
    const bottom = top + rowH;
    const box = this.scrollTarget;
    const view = box.clientHeight;
    if (top - head < box.scrollTop) {
      box.scrollTop = Math.max(0, top - head);
    } else if (bottom > box.scrollTop + view) {
      box.scrollTop = bottom - view;
    }
  }

  selectYear(event) {
    if (event.type === "keydown" && event.key !== "Enter" && event.key !== " ") return;
    if (event.type === "keydown") event.preventDefault();

    const href = event.currentTarget.dataset.href;
    if (!href) return;

    try {
      const next = new URL(href, window.location.origin);
      const cur = new URL(window.location.href);
      if (next.pathname === cur.pathname && next.search === cur.search) return;
    } catch {
      /* fall through */
    }

    const key = event.currentTarget.dataset.key;
    if (key) this.#paintSelected(key);

    Turbo.visit(href, { frame: "market_snapshot", action: "advance" });
  }

  #paintSelected(key) {
    this.selectedValue = key;
    this.rowTargets.forEach((row) => {
      const on = row.dataset.key === key;
      row.classList.toggle("is-on", on);
      if (on) row.setAttribute("aria-current", "true");
      else row.removeAttribute("aria-current");
    });
    this.overviewColTargets.forEach((col) => {
      const on = col.dataset.key === key;
      col.classList.toggle("is-on", on);
      if (on) col.setAttribute("aria-current", "true");
      else col.removeAttribute("aria-current");
    });
  }

  #formatN(n) {
    return Number(n).toLocaleString("en-US");
  }
}
