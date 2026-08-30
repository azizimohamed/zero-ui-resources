import { Controller } from "@hotwired/stimulus";

// Keep mobile bottom tabs stable across Turbo Drive visits (mirrors admin-nav).
export default class extends Controller {
  connect() {
    this.onBeforeRender = this.onBeforeRender.bind(this);
    this.onLoad = this.onLoad.bind(this);
    document.addEventListener("turbo:before-render", this.onBeforeRender);
    document.addEventListener("turbo:load", this.onLoad);
    this.syncFromDocument(document);
  }

  disconnect() {
    document.removeEventListener("turbo:before-render", this.onBeforeRender);
    document.removeEventListener("turbo:load", this.onLoad);
  }

  select(event) {
    const link = event.currentTarget;
    const section = link?.dataset?.appNavSection;
    if (!section) return;

    this.applyActive(section);
  }

  onBeforeRender(event) {
    this.syncFromDocument(event.detail.newBody);
  }

  onLoad() {
    this.syncFromDocument(document);
  }

  syncFromDocument(root) {
    const section = root.querySelector('meta[name="app-nav-section"]')?.content?.trim();
    if (section) this.applyActive(section);
    else this.clearActive();
  }

  applyActive(section) {
    document.querySelectorAll("[data-app-nav-section]").forEach((link) => {
      const on = link.dataset.appNavSection === section;
      link.classList.toggle("active", on);
      if (on) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }

  clearActive() {
    document.querySelectorAll("[data-app-nav-section]").forEach((link) => {
      link.classList.remove("active");
      link.removeAttribute("aria-current");
    });
  }
}
