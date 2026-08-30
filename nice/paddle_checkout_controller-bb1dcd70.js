import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static targets = ["intervalButton", "tierCard", "checkoutButton"];
  static values = {
    clientToken: String,
    environment: { type: String, default: "sandbox" },
    checkoutUrl: String,
    successUrl: String,
    interval: { type: String, default: "monthly" },
    tier: { type: String, default: "pro" },
  };

  connect() {
    if (!this.clientTokenValue) return;

    this.syncIntervalButtons();
    this.syncTierCards();
    this.syncTierPricing();
    this.syncCheckoutButton();
    this.loadPaddle()
      .then(() => this.initializePaddle())
      .catch(() => {
        // CSP / network failures surface in the console; leave checkout buttons
        // able to retry via ensurePaddleReady on click.
      });
  }

  setInterval(event) {
    event.preventDefault();
    const next = event.currentTarget.dataset.interval;
    if (!next || next === this.intervalValue) return;

    this.intervalValue = next;
    this.syncIntervalButtons();
    this.syncTierPricing();
  }

  selectTier(event) {
    event.preventDefault();
    const next = event.currentTarget.dataset.tier;
    if (!next || next === this.tierValue) return;

    this.tierValue = next;
    this.syncTierCards();
    this.syncCheckoutButton();
  }

  checkoutSelected(event) {
    event.preventDefault();
    this.startCheckout(this.tierValue);
  }

  buyTier(event) {
    event.preventDefault();
    const tier = event.currentTarget.dataset.tier;
    if (!tier) return;

    this.startCheckout(tier);
  }

  syncInterval(event) {
    const billing = event.detail?.billing;
    if (!billing || billing === this.intervalValue) return;

    this.intervalValue = billing;
  }

  syncIntervalButtons() {
    if (!this.hasIntervalButtonTarget) return;

    this.intervalButtonTargets.forEach((btn) => {
      btn.classList.toggle("on", btn.dataset.interval === this.intervalValue);
    });
  }

  syncTierCards() {
    if (!this.hasTierCardTarget) return;

    this.tierCardTargets.forEach((card) => {
      card.classList.toggle("sel", card.dataset.tier === this.tierValue);
    });
  }

  syncTierPricing() {
    if (!this.hasTierCardTarget) return;

    const annual = this.intervalValue === "annual";
    this.tierCardTargets.forEach((card) => {
      const amtEl = card.querySelector(".amt");
      const perEl = card.querySelector(".per");
      if (!amtEl || !perEl) return;

      if (annual) {
        amtEl.textContent = card.dataset.annualAmt;
        perEl.textContent = "/ yr";
      } else {
        amtEl.textContent = card.dataset.monthlyAmt;
        perEl.textContent = "/ mo";
      }
    });
  }

  syncCheckoutButton() {
    if (!this.hasCheckoutButtonTarget) return;

    const name = this.tierValue.charAt(0).toUpperCase() + this.tierValue.slice(1);
    this.checkoutButtonTarget.textContent = `Start 7-day trial · ${name}`;
  }

  async startCheckout(tier) {
    if (!this.checkoutUrlValue || !tier) return;

    await this.ensurePaddleReady();

    const response = await fetch(this.checkoutUrlValue, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-CSRF-Token": this.csrfToken,
      },
      credentials: "same-origin",
      body: JSON.stringify({
        tier,
        interval: this.intervalValue,
      }),
    });

    if (!response.ok) {
      let message = "Checkout could not be started. Try again or contact support.";
      try {
        const err = await response.json();
        if (err.error) message = err.error;
      } catch (_e) {
        // keep default message
      }
      window.alert(message);
      return;
    }

    const data = await response.json();
    if (!data.transaction_id) {
      window.alert("Checkout could not be started. Try again or contact support.");
      return;
    }

    window.Paddle.Checkout.open({ transactionId: data.transaction_id });
  }

  async ensurePaddleReady() {
    await this.loadPaddle();
    if (!this.initialized) {
      this.initializePaddle();
    }
  }

  loadPaddle() {
    if (window.Paddle) return Promise.resolve();
    if (this.paddleLoadPromise) return this.paddleLoadPromise;

    this.paddleLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        this.paddleLoadPromise = null;
        reject(new Error("Paddle.js failed to load"));
      };
      document.head.appendChild(script);
    });

    return this.paddleLoadPromise;
  }

  initializePaddle() {
    if (!window.Paddle || this.initialized) return;

    if (
      this.environmentValue === "sandbox" &&
      typeof window.Paddle.Environment?.set === "function"
    ) {
      window.Paddle.Environment.set("sandbox");
    }

    window.Paddle.Initialize({
      token: this.clientTokenValue,
      eventCallback: (event) => this.handlePaddleEvent(event),
    });
    this.initialized = true;
  }

  handlePaddleEvent(event) {
    if (event.name === "checkout.completed") {
      if (!this.successUrlValue) return;

      this.completed = true;
      window.setTimeout(() => this.redirectToSuccess(), 1500);
      return;
    }

    if (event.name === "checkout.closed" && this.completed) {
      this.redirectToSuccess();
    }
  }

  redirectToSuccess() {
    if (this.redirecting || !this.successUrlValue) return;

    this.redirecting = true;
    window.location.assign(this.successUrlValue);
  }

  get csrfToken() {
    return document.querySelector('meta[name="csrf-token"]')?.content || "";
  }
}
