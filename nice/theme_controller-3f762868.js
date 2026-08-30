import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  connect() {
    const stored = window.localStorage.getItem("crawlbench-theme");
    if (stored === "light" || stored === "dark") {
      document.documentElement.dataset.theme = stored;
    }
    this.#syncToggleHints();
  }

  toggle() {
    const root = document.documentElement;
    const next = root.dataset.theme === "light" ? "dark" : "light";
    root.dataset.theme = next;
    window.localStorage.setItem("crawlbench-theme", next);
    this.#syncToggleHints();
  }

  #syncToggleHints() {
    const dark = document.documentElement.dataset.theme !== "light";
    const label = dark ? "Light mode" : "Dark mode";
    document.querySelectorAll("[data-theme-toggle]").forEach((el) => {
      el.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
      el.setAttribute("title", label);
    });
    document.querySelectorAll("[data-theme-toggle-label]").forEach((el) => {
      el.textContent = label;
    });
  }
}
