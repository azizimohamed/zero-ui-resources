import { Controller } from "@hotwired/stimulus";

// Typewriter for curated “you say” lines on the homepage assistant CTA.
export default class extends Controller {
  static targets = ["text"];
  static values = {
    lines: Array,
    typeMs: { type: Number, default: 34 },
    holdMs: { type: Number, default: 2800 },
  };

  connect() {
    this.index = 0;
    this.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.lines = (this.linesValue || []).filter(
      (line) => typeof line === "string" && line.length > 0,
    );

    if (!this.hasTextTarget || this.lines.length === 0) return;

    if (this.reduced) {
      this.paint(this.lines[0], false);
      return;
    }

    this.run();
  }

  disconnect() {
    this.clearTimers();
  }

  run() {
    const line = this.lines[this.index];
    let n = 0;
    this.paint("", true);
    this.clearTimers();

    this.typeTimer = window.setInterval(() => {
      n += 1;
      this.paint(line.slice(0, n), n < line.length);
      if (n >= line.length) {
        window.clearInterval(this.typeTimer);
        this.typeTimer = null;
        this.holdTimer = window.setTimeout(() => {
          this.index = (this.index + 1) % this.lines.length;
          this.run();
        }, this.holdMsValue);
      }
    }, this.typeMsValue);
  }

  paint(text, caret) {
    this.textTarget.replaceChildren();
    this.textTarget.appendChild(document.createTextNode(`“${text}${caret ? "" : "”"}`));
    if (caret) {
      const span = document.createElement("span");
      span.className = "landing-assistant-cta__caret";
      span.setAttribute("aria-hidden", "true");
      this.textTarget.appendChild(span);
    }
  }

  clearTimers() {
    if (this.typeTimer) {
      window.clearInterval(this.typeTimer);
      this.typeTimer = null;
    }
    if (this.holdTimer) {
      window.clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
  }
}
