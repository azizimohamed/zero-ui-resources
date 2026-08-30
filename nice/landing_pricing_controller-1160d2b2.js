import { Controller } from "@hotwired/stimulus";

// Interactively switches pricing tiers on the landing pricing page
export default class extends Controller {
  static targets = ["billingButton", "price", "pricePeriod", "annualNote", "checkoutLink"];

  connect() {
    this.billing = "monthly";
    this.syncCheckoutLinks();
    this.dispatchChanged();
  }

  toggle(event) {
    const nextBilling = event.currentTarget.dataset.billing;
    if (this.billing === nextBilling) return;

    this.billing = nextBilling;

    this.billingButtonTargets.forEach((btn) => {
      const isTarget = btn.dataset.billing === nextBilling;
      if (isTarget) {
        btn.classList.add("bg-[color:var(--accent)]", "text-[color:var(--accent-fg)]");
        btn.classList.remove(
          "bg-transparent",
          "text-[color:var(--text-2)]",
          "hover:text-[color:var(--text)]",
        );
      } else {
        btn.classList.remove("bg-[color:var(--accent)]", "text-[color:var(--accent-fg)]");
        btn.classList.add(
          "bg-transparent",
          "text-[color:var(--text-2)]",
          "hover:text-[color:var(--text)]",
        );
      }
    });

    this.priceTargets.forEach((el) => {
      const val = this.billing === "annual" ? el.dataset.annual : el.dataset.monthly;

      el.style.opacity = "0";
      el.style.transform = "translateY(-4px)";

      setTimeout(() => {
        el.textContent = val;
        el.style.opacity = "1";
        el.style.transform = "translateY(0)";
      }, 150);
    });

    this.pricePeriodTargets.forEach((el) => {
      const val = this.billing === "annual" ? el.dataset.annual : el.dataset.monthly;

      el.style.opacity = "0";
      setTimeout(() => {
        el.textContent = val;
        el.style.opacity = "1";
      }, 150);
    });

    this.annualNoteTargets.forEach((el) => {
      el.classList.toggle("hidden", this.billing !== "annual");
    });

    this.syncCheckoutLinks();
    this.dispatchChanged();
  }

  dispatchChanged() {
    this.dispatch("changed", { detail: { billing: this.billing } });
  }

  syncCheckoutLinks() {
    if (!this.hasCheckoutLinkTarget) return;

    this.checkoutLinkTargets.forEach((link) => {
      const base = link.dataset.checkoutBase;
      if (!base) return;

      const url = new URL(base, window.location.origin);
      url.searchParams.set("interval", this.billing);
      link.href = url.pathname + url.search;
    });
  }
}
