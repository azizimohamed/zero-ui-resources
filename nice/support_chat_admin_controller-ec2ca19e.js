import { Controller } from "@hotwired/stimulus";
import { unlockSupportChime } from "lib/support_chime";
import { armChatScrollPin, scrollChatToEnd } from "lib/chat_scroll";

const PRESENCE_MS = 30_000;
const WAIT_MS = 30_000;
const PIN_MS = 700;

// Staff presence, wait-timer tick, and saved-reply insert on the desk.
export default class extends Controller {
  static targets = ["messages", "wait", "input", "file", "pending", "send"];
  static values = {
    presenceUrl: String,
    maxBytes: { type: Number, default: 5_242_880 },
    accept: {
      type: String,
      default: "image/png,image/jpeg,image/webp,image/gif,application/pdf",
    },
  };

  connect() {
    this.boundUnlock = () => unlockSupportChime();
    this.boundBeforeStream = (event) => this.#skipDuplicateAppend(event);
    this.element.addEventListener("pointerdown", this.boundUnlock, { once: true });
    document.addEventListener("turbo:before-stream-render", this.boundBeforeStream);
    this.#refreshFormTokens();
    this.csrfObserver = new MutationObserver(() => this.#refreshFormTokens());
    this.csrfObserver.observe(this.element, { childList: true, subtree: true });
    this.#armScrollPin();
    this.#ping();
    this.timer = window.setInterval(() => this.#ping(), PRESENCE_MS);
    this.waitTimer = window.setInterval(() => this.#tickWaits(), WAIT_MS);
    this.#tickWaits();
    if (this.hasMessagesTarget) {
      this.scrollObserver = new MutationObserver(() => this.#scroll());
      this.scrollObserver.observe(this.messagesTarget, { childList: true, subtree: true });
    }
    this.autosize();
    this.#syncSend();
  }

  disconnect() {
    this.#revokePendingPreview();
    if (this.boundUnlock) {
      this.element.removeEventListener("pointerdown", this.boundUnlock);
      this.boundUnlock = null;
    }
    if (this.boundBeforeStream) {
      document.removeEventListener("turbo:before-stream-render", this.boundBeforeStream);
      this.boundBeforeStream = null;
    }
    if (this.timer) window.clearInterval(this.timer);
    if (this.waitTimer) window.clearInterval(this.waitTimer);
    if (this.scrollObserver) this.scrollObserver.disconnect();
    if (this.csrfObserver) this.csrfObserver.disconnect();
    this.#stopScrollPin();
  }

  insertReply(event) {
    event.preventDefault();
    if (!this.hasInputTarget) return;
    const template = event.params.body || "";
    this.inputTarget.value = template;
    this.inputTarget.focus();
    this.autosize();
    this.#syncSend();
  }

  slash() {
    if (!this.hasInputTarget) return;
    const value = this.inputTarget.value;
    if (!value.startsWith("/") || !value.endsWith(" ")) {
      this.#syncSend();
      return;
    }
    const slug = value.slice(1).trim().toLowerCase();
    const match = [...this.element.querySelectorAll(".macro")].find((button) => {
      return (button.dataset.slug || "") === slug;
    });
    if (match) match.click();
    this.#syncSend();
  }

  autosize() {
    if (!this.hasInputTarget) return;
    this.inputTarget.style.height = "auto";
    this.inputTarget.style.height = `${Math.min(this.inputTarget.scrollHeight, 120)}px`;
  }

  hotkey(event) {
    if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
    event.preventDefault();
    event.currentTarget.requestSubmit();
  }

  filePicked(event) {
    const input = event.target;
    const file = input.files?.[0];
    if (file && !this.#clientAccepts(file)) {
      this.#setClientError(this.#rejectMessage(file));
      input.value = "";
      this.#renderPending(null);
      return;
    }
    this.#setClientError(null);
    this.#renderPending(file || null);
    this.#syncSend();
  }

  clearFile(event) {
    event?.preventDefault();
    this.fileTargets.forEach((input) => {
      input.value = "";
    });
    this.#renderPending(null);
    this.#syncSend();
  }

  sent(event) {
    if (event.detail?.success === false) return;
    if (this.hasInputTarget) this.inputTarget.value = "";
    this.fileTargets.forEach((input) => {
      input.value = "";
    });
    this.#renderPending(null);
    this.#setClientError(null);
    this.#refreshFormTokens();
    this.autosize();
    this.#syncSend();
  }

  #csrf() {
    return document.querySelector('meta[name="csrf-token"]')?.content;
  }

  // HTTP send and the INBOX cable can both append the same bubble.
  #skipDuplicateAppend(event) {
    const stream = event.target;
    if (stream?.tagName !== "TURBO-STREAM") return;
    if ((stream.getAttribute("action") || stream.action) !== "append") return;
    const content = stream.templateContent || stream.querySelector("template")?.content;
    const incoming = content?.querySelector?.("[id^='support_admin_message_']");
    if (incoming?.id && document.getElementById(incoming.id)) {
      event.preventDefault();
    }
  }

  // Cable-replaced claim/composer forms bake a token outside this session.
  #refreshFormTokens() {
    const token = this.#csrf();
    if (!token) return;
    this.element.querySelectorAll('input[name="authenticity_token"]').forEach((input) => {
      input.value = token;
    });
  }

  #ping() {
    const token = this.#csrf();
    if (!token || !this.presenceUrlValue) return;
    fetch(this.presenceUrlValue, {
      method: "POST",
      headers: {
        "X-CSRF-Token": token,
        Accept: "text/plain",
      },
      credentials: "same-origin",
      keepalive: true,
    }).catch(() => {});
  }

  #scroll() {
    if (!this.hasMessagesTarget) return;
    scrollChatToEnd(this.messagesTarget);
  }

  // Flex/layout settles after connect; pin to the latest message briefly.
  #armScrollPin() {
    if (!this.hasMessagesTarget) return;
    this.#stopScrollPin();
    this.stopPin = armChatScrollPin(this.messagesTarget, { ms: PIN_MS });
  }

  #stopScrollPin() {
    if (this.stopPin) {
      this.stopPin();
      this.stopPin = null;
    }
  }

  #tickWaits() {
    this.waitTargets.forEach((el) => {
      const at = el.dataset.waitAt;
      if (!at) return;
      const seconds = Math.max(0, (Date.now() - Date.parse(at)) / 1000);
      const minutes = Math.floor(seconds / 60);
      el.textContent = minutes < 1 ? `${Math.floor(seconds)}s` : `${minutes}m`;
      el.classList.toggle("warn", minutes >= 3 && minutes < 10);
      el.classList.toggle("bad", minutes >= 10);
    });
  }

  #renderPending(file) {
    this.#revokePendingPreview();
    if (!this.hasPendingTarget) return;
    if (!file) {
      this.pendingTarget.innerHTML = "";
      return;
    }

    this.pendingTarget.innerHTML =
      `<div class="pend"><span class="th"></span><span class="nm"></span>` +
      `<button type="button" data-action="support-chat-admin#clearFile" aria-label="Remove"></button></div>`;
    const thumb = this.pendingTarget.querySelector(".th");
    const label = this.pendingTarget.querySelector(".nm");
    const remove = this.pendingTarget.querySelector("button");
    if (label) label.textContent = file.name;
    if (remove) remove.textContent = "×";
    if (thumb && file.type?.startsWith("image/")) {
      this.pendingPreviewUrl = URL.createObjectURL(file);
      thumb.style.backgroundImage = `url("${this.pendingPreviewUrl}")`;
      thumb.style.backgroundSize = "cover";
      thumb.style.backgroundPosition = "center";
    } else if (thumb) {
      thumb.textContent = "PDF";
    }
  }

  #revokePendingPreview() {
    if (!this.pendingPreviewUrl) return;
    URL.revokeObjectURL(this.pendingPreviewUrl);
    this.pendingPreviewUrl = null;
  }

  #clientAccepts(file) {
    if (!file) return false;
    if (file.size > this.maxBytesValue) return false;
    const type = (file.type || "").toLowerCase();
    const name = (file.name || "").toLowerCase();
    if (type === "image/svg+xml" || name.endsWith(".svg")) return false;
    return this.#acceptedTypes().includes(type);
  }

  #acceptedTypes() {
    return this.acceptValue
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
  }

  #rejectMessage(file) {
    if (file.size > this.maxBytesValue) {
      return `Keep uploads under ${Math.round(this.maxBytesValue / 1_048_576)} MB.`;
    }
    return "Only PNG, JPEG, WebP, GIF, or PDF files are allowed.";
  }

  #setClientError(message) {
    const form = this.hasInputTarget ? this.inputTarget.closest("form") : null;
    if (!form) return;
    let box = form.querySelector("[data-client-error]");
    if (!message) {
      box?.remove();
      return;
    }
    if (!box) {
      box = document.createElement("div");
      box.className = "collide";
      box.dataset.clientError = "true";
      form.append(box);
    }
    box.textContent = message;
  }

  #syncSend() {
    if (!this.hasSendTarget) return;
    const hasText = this.hasInputTarget && this.inputTarget.value.trim().length > 0;
    const hasFile = this.fileTargets.some((input) => input.files?.length > 0);
    this.sendTarget.disabled = !hasText && !hasFile;
  }
}
