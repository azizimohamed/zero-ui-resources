import { Controller } from "@hotwired/stimulus";

// In-page hash links inside #turbo-main-pane. Native fragment navigation
// flickers then snaps back because Turbo restores the pane scroll position.
export default class extends Controller {
  connect() {
    this.onClick = (event) => this.#handleClick(event);
    this.onHash = () => this.#scrollToHash({ smooth: false });
    this.element.addEventListener("click", this.onClick);
    window.addEventListener("hashchange", this.onHash);
    window.addEventListener("popstate", this.onHash);
    // Beat native hash scroll + Turbo pane restore on first paint.
    this.#scrollToHash({ smooth: false });
    window.requestAnimationFrame(() => this.#scrollToHash({ smooth: false }));
  }

  disconnect() {
    this.element.removeEventListener("click", this.onClick);
    window.removeEventListener("hashchange", this.onHash);
    window.removeEventListener("popstate", this.onHash);
  }

  #handleClick(event) {
    const link = event.target.closest('a[href^="#"]');
    if (!link || !this.element.contains(link)) return;
    if (
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    const id = link.getAttribute("href")?.slice(1);
    if (!id) return;
    if (!document.getElementById(id)) return;

    event.preventDefault();
    history.pushState(null, "", `#${id}`);
    this.#scrollToId(id, { smooth: true });
  }

  #scrollToHash({ smooth }) {
    const id = window.location.hash.replace(/^#/, "");
    if (!id) return;
    this.#scrollToId(id, { smooth });
  }

  #scrollToId(id, { smooth }) {
    const target = document.getElementById(id);
    if (!target || !this.element.contains(target)) return;

    target.scrollIntoView({
      behavior: smooth ? "smooth" : "auto",
      block: "start",
    });
  }
}
