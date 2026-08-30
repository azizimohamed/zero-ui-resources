import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static targets = ["status", "primary"];
  static values = {
    clientToken: String,
    environment: { type: String, default: "sandbox" },
    priceId: String,
    completeUrl: String,
    autoOpen: { type: Boolean, default: false },
  };

  connect() {
    if (!this.clientTokenValue || !this.priceIdValue) return;

    this.loadPaddle()
      .then(() => {
        this.initializePaddle();
        if (this.autoOpenValue) {
          this.open();
        }
      })
      .catch(() => {
        // CSP / network failures surface in the console; open() retries via ensurePaddleReady.
      });
  }

  async open(event) {
    event?.preventDefault();
    if (this.completedTransactionId) {
      this.redirectToComplete(this.completedTransactionId);
      return;
    }

    await this.ensurePaddleReady();
    this.setPrimaryBusy("Opening secure checkout…");

    window.Paddle.Checkout.open({
      items: [{ priceId: this.priceIdValue, quantity: 1 }],
      settings: {
        displayMode: "overlay",
      },
    });
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

    // eventCallback must be set on Initialize — Checkout.open does not receive it.
    window.Paddle.Initialize({
      token: this.clientTokenValue,
      eventCallback: (event) => this.handlePaddleEvent(event),
    });
    this.initialized = true;
  }

  handlePaddleEvent(event) {
    if (event.name === "checkout.completed") {
      const transactionId = this.transactionIdFrom(event.data);
      if (!transactionId) {
        this.setStatus(
          "Payment succeeded, but we could not read the checkout reference. Contact support with your receipt email.",
        );
        this.resetPrimary("Continue to checkout");
        return;
      }

      this.completedTransactionId = transactionId;
      this.setPrimaryReady("Continue to create account");
      this.setStatus("Payment received. Creating your account next…");

      // Brief pause so the Paddle success screen is visible, then hand off to claim flow.
      window.setTimeout(() => this.redirectToComplete(transactionId), 1500);
      return;
    }

    if (event.name === "checkout.closed") {
      if (this.completedTransactionId) {
        this.redirectToComplete(this.completedTransactionId);
        return;
      }

      // Overlay dismissed without payment — restore the single CTA.
      this.resetPrimary("Continue to checkout");
      this.clearStatus();
    }
  }

  transactionIdFrom(data) {
    if (!data) return null;
    // Paddle.js checkout.completed: data.id is the checkout id (che_…);
    // the API transaction id lives on data.transaction_id (txn_…).
    return data.transaction_id || data.transactionId || null;
  }

  redirectToComplete(transactionId) {
    if (this.redirecting || !this.completeUrlValue) return;
    this.redirecting = true;

    const url = new URL(this.completeUrlValue, window.location.origin);
    url.searchParams.set("txn", transactionId);
    window.location.assign(url.toString());
  }

  setPrimaryBusy(message) {
    if (this.hasPrimaryTarget) {
      this.primaryTarget.disabled = true;
      this.primaryTarget.textContent = "Continue to checkout";
    }
    this.setStatus(message);
  }

  setPrimaryReady(label) {
    if (!this.hasPrimaryTarget) return;
    this.primaryTarget.disabled = false;
    this.primaryTarget.textContent = label;
  }

  resetPrimary(label) {
    if (!this.hasPrimaryTarget) return;
    this.primaryTarget.disabled = false;
    this.primaryTarget.textContent = label;
  }

  setStatus(message) {
    if (!this.hasStatusTarget) return;
    this.statusTarget.hidden = false;
    this.statusTarget.textContent = message;
  }

  clearStatus() {
    if (!this.hasStatusTarget) return;
    this.statusTarget.hidden = true;
    this.statusTarget.textContent = "";
  }
}
