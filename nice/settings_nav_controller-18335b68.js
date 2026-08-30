import { Controller } from "@hotwired/stimulus";

// Shared section rail: one panel visible, active state from click + URL only.
// Used by account settings and workspace settings (no scroll-spy).
export default class extends Controller {
  static targets = ["navItem", "panel"];
  static classes = ["active"];
  static values = { defaultSection: { type: String, default: "billing" } };

  connect() {
    this.activeClassName = this.hasActiveClass ? this.activeClass : "active";
    this.onNavigate = this.syncFromLocation.bind(this);
    window.addEventListener("hashchange", this.onNavigate);
    window.addEventListener("popstate", this.onNavigate);
    this.syncFromLocation();
    // Beat native hash scroll into #billing / #general (and peers) inside #turbo-main-pane.
    this.resetPaneScroll();
    window.requestAnimationFrame(() => this.resetPaneScroll());
  }

  disconnect() {
    window.removeEventListener("hashchange", this.onNavigate);
    window.removeEventListener("popstate", this.onNavigate);
  }

  select(event) {
    event.preventDefault();
    const id = event.currentTarget.dataset.section;
    if (!id) return;
    this.showSection(id);
  }

  syncFromLocation() {
    const slug = this.requestedSlug();
    // Notifications moved to /alerts; old bookmarks used #notifications / ?section=.
    if (slug === "notifications" && this.element.closest(".settings-page")) {
      window.location.replace("/alerts");
      return;
    }
    if (slug && this.panelFor(slug)) {
      this.showSection(slug, { updateHash: true, preferHash: true });
      return;
    }
    this.showSection(this.defaultSectionValue, { updateHash: Boolean(slug) });
  }

  requestedSlug() {
    const fromQuery = new URLSearchParams(window.location.search).get("section");
    if (fromQuery) return fromQuery;

    return window.location.hash.replace(/^#/, "") || null;
  }

  showSection(slug, { updateHash = true, preferHash = false } = {}) {
    if (!this.panelFor(slug)) slug = this.defaultSectionValue;

    this.panelTargets.forEach((panel) => {
      panel.classList.toggle("hidden", panel.dataset.section !== slug);
    });

    this.navItemTargets.forEach((item) => {
      const active = item.dataset.section === slug;
      item.classList.toggle(this.activeClassName, active);
      if (active) {
        item.setAttribute("aria-current", "page");
      } else {
        item.removeAttribute("aria-current");
      }
    });

    if (updateHash) {
      this.replaceLocation(slug === this.defaultSectionValue ? null : slug, { preferHash });
    }

    this.resetPaneScroll();
  }

  panelFor(id) {
    return this.panelTargets.find((panel) => panel.dataset.section === id);
  }

  resetPaneScroll() {
    const pane = document.getElementById("turbo-main-pane");
    if (pane) pane.scrollTop = 0;
  }

  replaceLocation(slug, { preferHash = false } = {}) {
    const url = new URL(window.location.href);
    const hadSectionParam = url.searchParams.has("section");

    if (preferHash || hadSectionParam) {
      url.searchParams.delete("section");
    }

    if (slug) {
      url.hash = slug;
    } else {
      url.hash = "";
    }

    const next = `${url.pathname}${url.search}${url.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (current === next) return;

    // replaceState alone can still leave a prior hash-scroll; pin the pane after.
    history.replaceState(null, "", next);
    this.resetPaneScroll();
  }
}
