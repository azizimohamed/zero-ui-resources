import { Controller } from "@hotwired/stimulus";

// Builds the on-this-page TOC from prose <h2>s, drives the reading-progress bar,
// scroll-spies the active heading, and handles the copy-link share button.
export default class extends Controller {
  static targets = ["prose", "toc", "progress", "copyBtn"];

  connect() {
    this.buildToc();
    this.onScroll = this.onScroll.bind(this);
    window.addEventListener("scroll", this.onScroll, { passive: true });
    window.addEventListener("resize", this.onScroll, { passive: true });
    this.onScroll();
  }

  disconnect() {
    window.removeEventListener("scroll", this.onScroll);
    window.removeEventListener("resize", this.onScroll);
  }

  buildToc() {
    if (!this.hasProseTarget || !this.hasTocTarget) return;
    this.headings = Array.from(this.proseTarget.querySelectorAll("h2"));
    this.tocTarget.replaceChildren();
    this.headings.forEach((h, i) => {
      if (!h.id) {
        h.id = `section-${i + 1}-${h.textContent
          .trim()
          .toLowerCase()
          .replace(/[^\w]+/g, "-")
          .replace(/^-+|-+$/g, "")}`;
      }
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.className = "blog-article__toc-link";
      a.href = `#${h.id}`;
      a.dataset.id = h.id;
      a.textContent = h.textContent;
      a.addEventListener("click", (e) => {
        e.preventDefault();
        const el = document.getElementById(a.dataset.id);
        if (!el) return;
        const offset = this.headerOffset() + 20;
        window.scrollTo({
          top: el.getBoundingClientRect().top + window.scrollY - offset,
          behavior: "smooth",
        });
      });
      li.appendChild(a);
      this.tocTarget.appendChild(li);
    });
    this.links = Array.from(this.tocTarget.querySelectorAll("a"));
  }

  headerOffset() {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(
      "--lp-site-hdr-sticky-height",
    );
    return parseInt(raw, 10) || 55;
  }

  onScroll() {
    const doc = document.documentElement;
    if (this.hasProgressTarget) {
      const max = doc.scrollHeight - doc.clientHeight;
      this.progressTarget.style.width = `${max > 0 ? (doc.scrollTop / max) * 100 : 0}%`;
    }
    if (this.links && this.headings.length) {
      const line = this.headerOffset() + 60;
      let current = this.headings[0].id;
      for (const h of this.headings) {
        if (h.getBoundingClientRect().top <= line) current = h.id;
      }
      this.links.forEach((l) => l.classList.toggle("is-active", l.dataset.id === current));
    }
  }

  async copyLink(event) {
    const btn = event.currentTarget;
    try {
      await navigator.clipboard.writeText(window.location.href);
      btn.classList.add("is-copied");
      const original = btn.getAttribute("title");
      btn.setAttribute("title", "Copied!");
      setTimeout(() => {
        btn.classList.remove("is-copied");
        btn.setAttribute("title", original);
      }, 1400);
    } catch (_e) {
      /* clipboard unavailable — no-op */
    }
  }
}
