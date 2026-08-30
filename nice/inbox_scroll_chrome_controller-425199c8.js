import { Controller } from "@hotwired/stimulus";

const MOBILE_MQ = "(max-width: 767px)";

export default class extends Controller {
  static targets = ["header", "chip"];

  static values = {
    scrollId: String,
  };

  connect() {
    this.scrollEl = document.getElementById(this.scrollIdValue);
    if (!this.scrollEl || !this.hasHeaderTarget || !this.hasChipTarget) return;

    this.mq = window.matchMedia(MOBILE_MQ);
    this.ticking = false;

    this.boundOnScroll = this.onScroll.bind(this);
    this.boundMqChange = this.onMqChange.bind(this);
    this.scrollEl.addEventListener("scroll", this.boundOnScroll, { passive: true });
    this.mq.addEventListener("change", this.boundMqChange);
    this.syncChip();
  }

  disconnect() {
    this.scrollEl?.removeEventListener("scroll", this.boundOnScroll);
    this.mq?.removeEventListener("change", this.boundMqChange);
  }

  get mobileChrome() {
    return this.mq?.matches ?? false;
  }

  onMqChange() {
    this.syncChip();
  }

  onScroll() {
    if (this.ticking) return;
    this.ticking = true;
    requestAnimationFrame(() => {
      this.syncChip();
      this.ticking = false;
    });
  }

  syncChip() {
    if (!this.hasChipTarget) return;

    if (!this.mobileChrome || !this.scrollEl || !this.hasHeaderTarget) {
      this.chipTarget.hidden = true;
      return;
    }

    const scrollRect = this.scrollEl.getBoundingClientRect();
    const headerRect = this.headerTarget.getBoundingClientRect();
    this.chipTarget.hidden = headerRect.bottom > scrollRect.top + 1;
  }

  showChrome(event) {
    event?.preventDefault();
    if (!this.scrollEl) return;
    this.scrollEl.scrollTo({ top: 0, behavior: "smooth" });
  }
}
