import { Controller } from "@hotwired/stimulus";

// Records marketing CTA clicks via Ahoy (server-side event on POST).
export default class extends Controller {
  static values = {
    url: String,
    family: String,
    slot: String,
    offer: String,
    label: String,
    href: String,
  };

  connect() {
    this.boundClick = this.record.bind(this);
    this.element.addEventListener("click", this.boundClick);
  }

  disconnect() {
    this.element.removeEventListener("click", this.boundClick);
  }

  record(event) {
    if (event.defaultPrevented) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (event.button !== 0) return;

    const url = this.urlValue || "/marketing/cta_clicks";
    const body = JSON.stringify({
      family: this.familyValue,
      slot: this.slotValue,
      offer: this.offerValue,
      label: this.labelValue,
      href: this.hrefValue || this.element.getAttribute("href"),
    });

    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(url, blob);
      return;
    }

    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "*/*" },
      body,
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => {});
  }
}
