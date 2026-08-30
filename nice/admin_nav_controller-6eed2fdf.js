import { Controller } from "@hotwired/stimulus";

const OPS_SHELL_META = 'meta[name="admin-ops-shell-sections"]';

// Keep admin sidebar / topbar / mobile tabs stable across Turbo Drive visits.
// Active chrome is synced from server meta tags and optimistic clicks.
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
    const section = link?.dataset?.adminNavSection;
    if (!section) return;

    this.applyActive(section, this.shellSectionFor(section));
  }

  onBeforeRender(event) {
    this.syncFromDocument(event.detail.newBody);
  }

  onLoad() {
    this.syncFromDocument(document);
  }

  syncFromDocument(root) {
    this.opsShell = this.readOpsShell(root);
    const section = root.querySelector('meta[name="admin-nav-section"]')?.content?.trim();
    const shellSection =
      root.querySelector('meta[name="admin-nav-shell-section"]')?.content?.trim() || section;
    if (section) this.applyActive(section, shellSection);
    else this.clearActive();

    const title = root.querySelector('meta[name="admin-page-title"]')?.content?.trim();
    if (title) this.setTitle(title);
  }

  applyActive(section, shellSection = section) {
    const opsShell = this.opsShell || this.readOpsShell(document);

    document.querySelectorAll("[data-admin-nav-section]").forEach((link) => {
      const linkSection = link.dataset.adminNavSection;
      const isTab = link.classList.contains("admin-shell__tab");
      const on = isTab
        ? this.tabActive(linkSection, section, shellSection, opsShell)
        : linkSection === section;

      if (isTab) {
        link.classList.toggle("admin-shell__tab--on", on);
      } else {
        link.classList.toggle("active", on);
      }

      if (on) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }

  tabActive(linkSection, section, shellSection, opsShell) {
    if (linkSection === "crawl") return opsShell.has(shellSection);

    return linkSection === section;
  }

  clearActive() {
    document.querySelectorAll("[data-admin-nav-section]").forEach((link) => {
      const isTab = link.classList.contains("admin-shell__tab");
      if (isTab) link.classList.remove("admin-shell__tab--on");
      else link.classList.remove("active");
      link.removeAttribute("aria-current");
    });
  }

  readOpsShell(root) {
    const raw = root.querySelector(OPS_SHELL_META)?.content || "";
    return new Set(
      raw
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
    );
  }

  shellSectionFor(section) {
    const opsShell = this.opsShell || this.readOpsShell(document);
    return opsShell.has(section) ? "crawl" : section;
  }

  setTitle(title) {
    document
      .querySelector("[data-admin-nav-title]")
      ?.replaceChildren(document.createTextNode(title));
  }
}
