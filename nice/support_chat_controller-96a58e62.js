import { Controller } from "@hotwired/stimulus";
import { nudgeSupportElement, playSupportChime, unlockSupportChime } from "lib/support_chime";
import { armChatScrollPin, scrollChatToEnd } from "lib/chat_scroll";
import {
  notifyVisitorReply,
  visitorAlertsEnabled,
  visitorAlertsOffered,
} from "lib/support_visitor_alerts";
import { subscribeSupportPush } from "lib/support_push";
import { lockScroll, unlockScroll } from "lib/scroll_lock";
import { markPrivacyDismissed, syncPrivacyNotice } from "lib/support_privacy";

const PRESENCE_MS = 30_000;
const PANEL_CLOSE_MS = 180;

// Floating live support widget. Cached HTML has no visitor cookie. After paint,
// /support_chat/state hydrates unread (and polls) so the badge moves without
// opening the panel. Signed-in visitors also ride a user Cable stream. First
// open still mints the cookie.
export default class extends Controller {
  static targets = [
    "launcher",
    "panel",
    "frame",
    "csrf",
    "input",
    "messages",
    "pageUrl",
    "presenceForm",
    "deliveredForm",
    "file",
    "fileName",
    "pending",
    "composer",
    "send",
    "presence",
    "unread",
    "notifyBanner",
    "privacyNotice",
  ];
  static values = {
    panelUrl: String,
    stateUrl: String,
    pushUrl: String,
    pushOwner: String,
    hiddenPaths: { type: String, default: "/admin" },
    maxBytes: { type: Number, default: 5_242_880 },
    accept: { type: String, default: "image/png,image/jpeg,image/webp,image/gif,application/pdf" },
  };

  connect() {
    if (this.#hiddenForPath()) {
      this.element.hidden = true;
      return;
    }
    this.element.hidden = false;
    this.#resetCachedOpenState();
    this.boundBeforeCache = () => this.closeImmediate();
    document.addEventListener("turbo:before-cache", this.boundBeforeCache);
    this.boundEscape = (event) => this.#onEscape(event);
    this.boundSheetTab = (event) => this.#trapSheetFocus(event);
    if (!this.#panelOpen() && this.hasPanelTarget) this.panelTarget.hidden = true;
    this.presenceTimer = null;
    this.deliveredPending ||= new Set();
    this.seenDeliveryIds ||= new Set();
    this.frameMissingRetries = 0;
    this.lastUnread = this.lastUnread ?? Number(this.element.dataset.supportLastUnread || 0);
    this.frameLoadedOnce =
      this.frameLoadedOnce || Boolean(this.hasFrameTarget && this.frameTarget.getAttribute("src"));
    this.#watchLauncherState();
    if (this.boundVisibility) {
      document.removeEventListener("visibilitychange", this.boundVisibility);
    }
    this.boundVisibility = () => {
      if (document.visibilityState === "visible") {
        this.#bootstrapInbox();
        this.#subscribePushIfEnabled();
        if (this.#panelOpen()) {
          this.#reloadAfterBackground();
          this.#pingPresence();
        }
      }
      if (document.visibilityState === "hidden") {
        this.wasBackgrounded = true;
        this.#maybeAskEmail();
      }
    };
    document.addEventListener("visibilitychange", this.boundVisibility);
    this.#bindLaunchHints();
    if (this.frameLoadedOnce) {
      this.#captureFrameCsrf();
      this.#watchCsrf();
      this.#watchMessages();
      this.#watchWidgetState();
      this.#applyWidgetState();
      if (this.#panelOpen()) this.#startPresence();
      this.#bootstrapInbox();
    } else {
      this.#scheduleBootstrapInbox();
    }
    this.#subscribePushIfEnabled();
    this.#openFromLaunchHint();
    this.#syncPrivacyNotice();
    this.#watchPanelBody();
  }

  disconnect() {
    if (this.boundBeforeCache) {
      document.removeEventListener("turbo:before-cache", this.boundBeforeCache);
    }
    document.removeEventListener("keydown", this.boundEscape);
    document.removeEventListener("keydown", this.boundSheetTab);
    this.#stopStatePoll();
    this.#stopPresence();
    window.clearTimeout(this.hideTimer);
    window.clearTimeout(this.lateScroll);
    if (this.openFrame) cancelAnimationFrame(this.openFrame);
    if (this.boundVisibility) {
      document.removeEventListener("visibilitychange", this.boundVisibility);
    }
    this.#unbindLaunchHints();
    this.#stopScrollWatch();
    this.#stopWidgetWatch();
    this.#stopLauncherWatch();
    this.#stopCsrfWatch();
    this.#stopPanelBodyWatch();
    this.#lockPageScroll(false);
  }

  toggle(event) {
    event?.preventDefault();
    if (this.#panelOpen()) {
      this.close();
    } else {
      this.open();
    }
  }

  #resetCachedOpenState() {
    window.clearTimeout(this.hideTimer);
    this.element.classList.remove("support-chat--open", "support-chat--closing");
    if (this.hasPanelTarget) this.panelTarget.hidden = true;
    if (this.hasLauncherTarget) this.launcherTarget.setAttribute("aria-expanded", "false");
    document.removeEventListener("keydown", this.boundEscape);
    document.removeEventListener("keydown", this.boundSheetTab);
  }

  #onEscape(event) {
    if (event.key !== "Escape" || !this.#panelOpen()) return;
    event.preventDefault();
    this.close();
  }

  open({ refresh = false } = {}) {
    if (this.#hiddenForPath() || this.#drawerBlocksOpen()) return;
    if (!this.hasPanelTarget || !this.hasFrameTarget) return;
    unlockSupportChime();
    this.#subscribePushIfEnabled();
    this.#syncNotifyBanner();
    window.clearTimeout(this.hideTimer);
    this.element.classList.remove("support-chat--closing");
    this.#cancelPendingOpen();
    // Apply panel visibility and --open together so mobile display:none and desktop
    // opacity transitions do not flash an intermediate hidden/open state.
    this.openFrame = requestAnimationFrame(() => {
      this.openFrame = null;
      if (!this.hasPanelTarget) return;
      this.panelTarget.hidden = false;
      this.element.classList.add("support-chat--open");
      this.element.classList.remove("has-unread");
      if (this.hasLauncherTarget) this.launcherTarget.setAttribute("aria-expanded", "true");
      if (this.hasUnreadTarget) this.unreadTarget.hidden = true;
      this.#paintEntryBadges(this.lastUnread ?? 0, true);
      document.addEventListener("keydown", this.boundEscape);
      if (this.#isMobileSheetOverlay()) document.addEventListener("keydown", this.boundSheetTab);
      this.#lockPageScroll(true);
      // Pin after the sheet is visible so scrollHeight is real (reopen path).
      this.#armScrollPin();
    });

    const src = this.frameTarget.getAttribute("src");
    if (!src) {
      this.frameTarget.setAttribute("src", this.panelUrlValue);
    } else if (refresh || (this.wasBackgrounded && !this.#composerDirty())) {
      this.#scheduleFrameReload();
    }
    this.wasBackgrounded = false;

    this.#fillPageUrl();
    // Presence starts after the frame has content (frameLoaded). Avoid a
    // second presence broadcast while the panel is still painting.
    if (this.frameLoadedOnce) {
      this.#startPresence();
    }
  }

  openFromNotification() {
    if (this.#hiddenForPath()) return;
    this.frameMissingRetries = 0;
    const hadSrc = Boolean(this.frameTarget.getAttribute("src"));
    this.open({ refresh: false });
    if (hadSrc) this.#scheduleFrameReload();
    this.#bootstrapInbox();
  }

  close() {
    this.#cancelPendingOpen();
    if (!this.#panelOpen() && !this.element.classList.contains("support-chat--closing")) return;

    if (this.hasLauncherTarget) this.launcherTarget.setAttribute("aria-expanded", "false");
    document.removeEventListener("keydown", this.boundEscape);
    document.removeEventListener("keydown", this.boundSheetTab);
    this.#stopPresence();
    this.#stopScrollPin();
    this.#applyWidgetState();
    this.#maybeAskEmail();

    window.clearTimeout(this.hideTimer);
    this.element.classList.add("support-chat--closing");
    this.hideTimer = window.setTimeout(() => this.#finishClose(), PANEL_CLOSE_MS);
  }

  closeImmediate() {
    this.#cancelPendingOpen();
    window.clearTimeout(this.hideTimer);
    if (this.hasLauncherTarget) this.launcherTarget.setAttribute("aria-expanded", "false");
    document.removeEventListener("keydown", this.boundEscape);
    document.removeEventListener("keydown", this.boundSheetTab);
    this.#stopPresence();
    this.#stopScrollPin();
    this.#finishClose();
  }

  #finishClose() {
    this.element.classList.remove("support-chat--open", "support-chat--closing");
    if (this.hasPanelTarget) this.panelTarget.hidden = true;
    this.#lockPageScroll(false);
    this.#applyWidgetState();
  }

  #cancelPendingOpen() {
    if (!this.openFrame) return;
    cancelAnimationFrame(this.openFrame);
    this.openFrame = null;
  }

  frameLoaded() {
    this.frameLoadedOnce = true;
    // HTTP frame responses carry a real session CSRF (inner bearer). Cable
    // morphs of panel_body do not — capture here and keep form fields in sync.
    this.#captureFrameCsrf();
    this.#refreshFormTokens();
    this.#watchCsrf();
    this.#fillPageUrl();
    if (this.#panelOpen()) this.#startPresence();
    this.#watchMessages();
    this.#watchWidgetState();
    this.#applyWidgetState();
    this.#syncNotifyBanner();
    if (this.#panelOpen()) this.#armScrollPin();
    this.#subscribePushIfEnabled();
    this.autosize();
    this.syncSend();
    this.#syncPrivacyNotice();
    this.#watchPanelBody();
  }

  // Turbo submit-start: stamp visitor CSRF onto Cable-rendered forms before
  // the request leaves (rating / composer / email card).
  ensureCsrf() {
    this.#captureFrameCsrf();
    this.#refreshFormTokens();
  }

  started(event) {
    if (event.detail?.success === false) {
      if (this.#staleThreadResponse(event)) this.#reloadFrame();
      return;
    }
    this.#captureFrameCsrf();
    this.#refreshFormTokens();
    this.#watchCsrf();
    this.#fillPageUrl();
    this.#startPresence();
    this.#armScrollPin();
    this.autosize();
    this.syncSend();
  }

  rated(event) {
    if (event.detail?.success === false) {
      if (this.#staleThreadResponse(event)) this.#reloadFrame();
      return;
    }
    this.#captureFrameCsrf();
    this.#refreshFormTokens();
    this.#fillPageUrl();
    this.#watchMessages();
    this.#watchWidgetState();
    this.#applyWidgetState();
    this.#syncNotifyBanner();
    if (this.#panelOpen()) {
      this.#startPresence();
      this.#armScrollPin();
    }
  }

  messageSent(event) {
    if (event.detail?.success === false) return;
    this.#captureFrameCsrf();
    this.#refreshFormTokens();
    if (this.hasInputTarget) this.inputTarget.value = "";
    this.fileTargets.forEach((input) => {
      input.value = "";
    });
    this.fileNameTargets.forEach((el) => {
      el.hidden = true;
      el.textContent = "";
    });
    this.#renderPending(null);
    if (this.hasInputTarget) this.autosize();
    this.syncSend();
    this.#pingPresence();
    this.#scrollMessages();
  }

  dragover(event) {
    event.preventDefault();
    this.hasComposerTarget && this.composerTarget.classList.add("is-drag");
  }

  dragleave() {
    this.hasComposerTarget && this.composerTarget.classList.remove("is-drag");
  }

  drop(event) {
    event.preventDefault();
    this.hasComposerTarget && this.composerTarget.classList.remove("is-drag");
    const file = event.dataTransfer?.files?.[0];
    if (file) this.#assignFile(file);
  }

  paste(event) {
    const item = [...(event.clipboardData?.items || [])].find((entry) => entry.kind === "file");
    const file = item?.getAsFile();
    if (!file) return;
    event.preventDefault();
    this.#assignFile(file);
  }

  filePicked(event) {
    const input = event.target;
    const file = input.files?.[0];
    if (file && !this.#clientAccepts(file)) {
      this.#setClientError(this.#rejectMessage(file));
      input.value = "";
      this.#renderPending(null);
      this.syncSend();
      return;
    }
    const name = file?.name;
    if (this.hasPendingTarget) {
      this.#renderPending(name);
      this.syncSend();
      return;
    }
    const label = input.closest("form")?.querySelector('[data-support-chat-target="fileName"]');
    if (!label) return;
    if (name) {
      label.textContent = name;
      label.hidden = false;
    } else {
      label.textContent = "";
      label.hidden = true;
    }
  }

  suggest(event) {
    event.preventDefault();
    if (!this.hasInputTarget) return;
    this.inputTarget.value = event.params.text || "";
    this.inputTarget.focus();
    this.autosize();
    this.syncSend();
  }

  dismissPrivacy(event) {
    event?.preventDefault();
    markPrivacyDismissed();
    this.#syncPrivacyNotice();
  }

  syncSend() {
    if (!this.hasSendTarget) return;
    const hasText = this.hasInputTarget && this.inputTarget.value.trim().length > 0;
    const hasFile = this.fileTargets.some((input) => input.files?.length > 0);
    this.sendTarget.disabled = !hasText && !hasFile;
  }

  keydown(event) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    this.hasComposerTarget
      ? this.composerTarget.requestSubmit()
      : this.inputTarget.form?.requestSubmit();
  }

  autosize() {
    if (!this.hasInputTarget) return;
    this.inputTarget.style.height = "auto";
    this.inputTarget.style.height = `${Math.min(this.inputTarget.scrollHeight, 120)}px`;
  }

  #renderPending(name) {
    if (!this.hasPendingTarget) return;
    if (!name) {
      this.pendingTarget.innerHTML = "";
      return;
    }
    this.pendingTarget.innerHTML =
      `<div class="pend"><span class="th"></span><span class="nm"></span>` +
      `<button type="button" data-action="support-chat#clearFile" aria-label="Remove"></button></div>`;
    const label = this.pendingTarget.querySelector(".nm");
    const remove = this.pendingTarget.querySelector("button");
    if (label) label.textContent = name;
    if (remove) remove.textContent = "×";
  }

  clearFile(event) {
    event?.preventDefault();
    this.fileTargets.forEach((input) => {
      input.value = "";
    });
    this.#renderPending(null);
    this.syncSend();
  }

  #assignFile(file) {
    if (!this.#clientAccepts(file)) {
      this.#setClientError(this.#rejectMessage(file));
      return;
    }
    const input = this.fileTargets[0];
    if (!input) return;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    this.#setClientError(null);
    this.#renderPending(file.name);
    this.syncSend();
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
    if (!this.hasComposerTarget) return;
    let box = this.composerTarget.querySelector("[data-client-error]");
    if (!message) {
      box?.remove();
      return;
    }
    if (!box) {
      box = document.createElement("ul");
      box.className = "support-chat__errors";
      box.dataset.clientError = "true";
      this.composerTarget.prepend(box);
    }
    box.innerHTML = "";
    const item = document.createElement("li");
    item.textContent = message;
    box.appendChild(item);
  }

  // Mobile sheet: shared scroll lock pins body (marketing) or #turbo-main-pane (app).
  #lockPageScroll(lock) {
    if (lock && this.#locksMobileViewport()) {
      lockScroll(this);
      document.documentElement.classList.add("support-sheet-open");
      this.element.querySelector(".support-chat__sheet-close")?.focus({ preventScroll: true });
      return;
    }
    unlockScroll(this);
    document.documentElement.classList.remove("support-sheet-open");
  }

  #locksMobileViewport() {
    return (
      window.matchMedia("(max-width: 640px)").matches &&
      (this.element.classList.contains("support-chat--app") ||
        this.element.classList.contains("support-chat--marketing"))
    );
  }

  #isMobileSheetOverlay() {
    return (
      window.matchMedia("(max-width: 640px)").matches &&
      this.element.classList.contains("support-chat--marketing")
    );
  }

  #trapSheetFocus(event) {
    if (event.key !== "Tab" || !this.#panelOpen() || !this.#isMobileSheetOverlay()) return;
    const panel = this.hasPanelTarget ? this.panelTarget : null;
    if (!panel) return;
    const focusable = panel.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  #drawerBlocksOpen() {
    return document.body.classList.contains("drawer-open");
  }

  #maybeAskEmail() {
    const card = this.frameTarget.querySelector("#support_chat_email_card");
    if (card) card.hidden = false;
  }

  #applyWidgetState(state = null) {
    const launcher = this.element.querySelector("#support_chat_launcher_state");
    const el = this.hasFrameTarget
      ? this.frameTarget.querySelector("#support_chat_widget_state")
      : null;
    if (this.applyingWidget) return;
    if (!state && !el && !launcher) return;
    this.applyingWidget = true;
    try {
      const unread = Number(state?.unread ?? el?.dataset?.unread ?? launcher?.dataset?.unread ?? 0);
      const away = state
        ? state.away === true
        : (el?.dataset?.away ?? launcher?.dataset?.away) === "true";
      const closed = state
        ? state.closed === true
        : (el?.dataset?.closed ?? launcher?.dataset?.closed) === "true";
      const conversationId =
        state?.conversation ?? el?.dataset?.conversation ?? launcher?.dataset?.conversation ?? "";
      if (launcher) {
        this.#setLauncherDataset(launcher, { unread, away, closed, conversationId });
      }
      const frameId = this.#frameConversationId();
      const clearedChrome = !conversationId && frameId;
      const idMismatch = conversationId && frameId && conversationId !== frameId;
      if (clearedChrome || idMismatch) {
        const mismatchKey = `${conversationId}:${frameId}`;
        if (this.conversationMismatchKey !== mismatchKey) {
          this.conversationMismatchKey = mismatchKey;
          this.#reloadFrame();
        }
      } else {
        this.conversationMismatchKey = null;
      }
      const prevUnread = this.lastUnread ?? 0;
      this.lastUnread = unread;
      this.element.dataset.supportLastUnread = String(unread);
      const open = this.#panelOpen();
      const grew = unread > prevUnread;
      this.element.classList.toggle("is-away", away);
      this.element.classList.toggle("is-closed", closed);
      this.element.classList.toggle("has-unread", unread > 0 && !open);
      this.#paintUnread(unread, open);
      if (grew && open) {
        this.#noteOpenPanelReply();
        if (document.hidden) this.#alertClosedUnread();
      } else if (grew && !open) {
        this.#alertClosedUnread();
      }
      this.#syncNotifyBanner();
    } finally {
      this.applyingWidget = false;
    }
  }

  #scheduleBootstrapInbox() {
    const run = () => this.#bootstrapInbox();
    if ("requestIdleCallback" in window) {
      requestIdleCallback(run, { timeout: 4000 });
      return;
    }
    setTimeout(run, 2000);
  }

  #bootstrapInbox({ peek = false } = {}) {
    if (!this.hasStateUrlValue || !this.stateUrlValue) return;
    const url = peek
      ? `${this.stateUrlValue}${this.stateUrlValue.includes("?") ? "&" : "?"}peek=1`
      : this.stateUrlValue;
    fetch(url, {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    })
      .then((response) => {
        if (response.status === 204) {
          this.#stopStatePoll();
          return null;
        }
        if (!response.ok) return null;
        return response.json();
      })
      .then((data) => {
        if (!data) return;
        this.#applyWidgetState(data);
        this.#prefetchPanel();
        this.#startStatePoll();
      })
      .catch(() => {});
  }

  #startStatePoll() {
    if (this.stateTimer) return;
    this.stateTimer = window.setInterval(() => this.#bootstrapInbox({ peek: true }), PRESENCE_MS);
  }

  #stopStatePoll() {
    if (this.stateTimer) {
      window.clearInterval(this.stateTimer);
      this.stateTimer = null;
    }
  }

  #subscribePushIfEnabled() {
    if (!visitorAlertsEnabled()) return;
    if (!this.hasPushUrlValue || !this.pushUrlValue) return;
    const run = () => {
      subscribeSupportPush(this.pushUrlValue, {
        csrf: this.#csrf(),
        ownerKey: this.pushOwnerValue,
      }).catch(() => {});
    };
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(run, { timeout: 2_000 });
    } else {
      window.setTimeout(run, 0);
    }
  }

  #frameConversationId() {
    if (!this.hasFrameTarget) return "";
    return (
      this.frameTarget.querySelector("#support_chat_widget_state")?.dataset?.conversation || ""
    );
  }

  #composerDirty() {
    return this.hasInputTarget && this.inputTarget.value.trim() !== "";
  }

  #reloadAfterBackground() {
    if (!this.wasBackgrounded || this.#composerDirty()) return;
    if (!this.hasFrameTarget || !this.frameTarget.getAttribute("src")) return;
    this.#scheduleFrameReload();
    this.wasBackgrounded = false;
  }

  #scheduleFrameReload() {
    if (!this.hasFrameTarget || !this.panelUrlValue) return;
    window.requestAnimationFrame(() => {
      if (!this.frameTarget.getAttribute("src")) {
        this.frameTarget.setAttribute("src", this.panelUrlValue);
        return;
      }
      this.#reloadFrame();
    });
  }

  #staleThreadResponse(event) {
    const status = event.detail?.fetchResponse?.response?.status;
    return status === 404 || status === 410;
  }

  #reloadFrame() {
    if (!this.hasFrameTarget || !this.panelUrlValue) return;
    this.wasBackgrounded = false;
    if (typeof this.frameTarget.reload === "function" && this.frameTarget.hasAttribute("src")) {
      this.frameTarget.reload();
      return;
    }
    this.frameTarget.setAttribute("src", this.panelUrlValue);
  }

  #watchPanelBody() {
    this.#stopPanelBodyWatch();
    if (!this.hasFrameTarget) return;

    const onPanelReplaced = (mutations) => {
      const replaced = mutations.some((mutation) =>
        [...mutation.addedNodes].some(
          (node) =>
            node.nodeType === Node.ELEMENT_NODE &&
            (node.id === "support_chat_panel_body" ||
              node.querySelector?.("#support_chat_panel_body")),
        ),
      );
      if (replaced) this.#onPanelBodyReplaced();
    };

    this.panelBodyObserver = new MutationObserver(onPanelReplaced);
    this.panelBodyObserver.observe(this.frameTarget, { childList: true, subtree: true });
  }

  #onPanelBodyReplaced() {
    this.#stopPresence();
    this.#stopScrollWatch();
    this.#captureFrameCsrf();
    this.#refreshFormTokens();
    this.#watchCsrf();
    this.#fillPageUrl();
    this.#watchMessages();
    this.#watchWidgetState();
    this.#applyWidgetState();
    this.#syncNotifyBanner();
    this.#syncPrivacyNotice();
    this.autosize();
    this.syncSend();
  }

  #stopPanelBodyWatch() {
    this.panelBodyObserver?.disconnect();
    this.panelBodyObserver = null;
  }

  #prefetchPanel() {
    if (!this.hasFrameTarget || this.frameTarget.getAttribute("src")) return;
    // Marketing HTML omits csrf_meta_tags so the edge can cache. Prefetching
    // /support_chat would mint _crawlbench_session via form_authenticity_token.
    if (!document.querySelector('meta[name="csrf-token"]')) return;
    this.frameTarget.setAttribute("src", this.panelUrlValue);
  }

  #alertClosedUnread() {
    playSupportChime();
    nudgeSupportElement(this.hasLauncherTarget ? this.launcherTarget : this.element);
    const latest = this.hasFrameTarget
      ? this.frameTarget.querySelector("[data-support-delivery-id]:last-of-type")
      : null;
    const messageId = latest?.dataset?.supportDeliveryId;
    notifyVisitorReply({
      title: "Crawlbench support",
      body: "You have a new reply.",
      tag: messageId ? `support-visitor-reply-${messageId}` : "support-visitor-reply",
      onClick: () => this.open({ refresh: true }),
    });
  }

  #paintUnread(unread, open) {
    if (this.hasUnreadTarget) {
      const label = unread > 0 && !open ? String(unread) : "";
      if (this.unreadTarget.textContent !== label) this.unreadTarget.textContent = label;
      this.unreadTarget.hidden = unread <= 0 || open;
    }
    this.#paintEntryBadges(unread, open);
  }

  #paintEntryBadges(unread, open) {
    const show = unread > 0 && !open;
    const label = show ? String(unread) : "";
    document.querySelectorAll("[data-support-entry-badge]").forEach((el) => {
      if (el.textContent !== label) el.textContent = label;
      el.hidden = !show;
    });
    document.querySelectorAll("[data-support-entry-trigger]").forEach((el) => {
      el.classList.toggle("has-unread", show);
    });
  }

  // Cable may append the bubble before the messages observer is bound.
  // Presence marks read (and COALESCE delivered_at) while the panel is open.
  #noteOpenPanelReply() {
    this.#ensureMessageWatch();
    this.#pingPresence();
    this.#scrollMessages();
    this.#armScrollPin();
    window.clearTimeout(this.lateScroll);
    this.lateScroll = window.setTimeout(() => this.#scrollMessages(), 80);
  }

  #syncNotifyBanner() {
    if (!this.hasNotifyBannerTarget) return;
    this.notifyBannerTarget.hidden = !visitorAlertsOffered();
  }

  #syncPrivacyNotice() {
    if (!this.hasPrivacyNoticeTarget) return;
    const home = Boolean(this.frameTarget?.querySelector("#support_chat_home"));
    syncPrivacyNotice(this.privacyNoticeTarget, { home });
  }

  #panelOpen() {
    return this.element.classList.contains("support-chat--open");
  }

  #hiddenForPath() {
    const path = window.location.pathname || "";
    return this.hiddenPathsValue
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
      .some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  }

  #bindLaunchHints() {
    this.#unbindLaunchHints();
    this.boundLaunchHint = () => this.#openFromLaunchHint();
    window.addEventListener("hashchange", this.boundLaunchHint);
    document.addEventListener("turbo:load", this.boundLaunchHint);
    if (!navigator.serviceWorker) return;
    this.boundSwMessage = (event) => {
      if (event.data?.type === "support:open") this.openFromNotification();
    };
    navigator.serviceWorker.addEventListener("message", this.boundSwMessage);
    if (this.hasFrameTarget) {
      this.boundFrameMissing = (event) => {
        if (event.target !== this.frameTarget) return;
        if (this.frameMissingRetries >= 2) return;
        this.frameMissingRetries += 1;
        event.preventDefault();
        window.setTimeout(() => this.#reloadFrame(), 0);
      };
      this.frameTarget.addEventListener("turbo:frame-missing", this.boundFrameMissing);
    }
  }

  #unbindLaunchHints() {
    if (this.boundLaunchHint) {
      window.removeEventListener("hashchange", this.boundLaunchHint);
      document.removeEventListener("turbo:load", this.boundLaunchHint);
    }
    this.boundLaunchHint = null;
    if (this.boundSwMessage && navigator.serviceWorker) {
      navigator.serviceWorker.removeEventListener("message", this.boundSwMessage);
    }
    this.boundSwMessage = null;
    if (this.boundFrameMissing && this.hasFrameTarget) {
      this.frameTarget.removeEventListener("turbo:frame-missing", this.boundFrameMissing);
    }
    this.boundFrameMissing = null;
  }

  #openFromLaunchHint() {
    if (this.#hiddenForPath()) return;
    if ((window.location.hash || "").replace(/^#/, "") !== "support-chat") return;
    this.openFromNotification();
    const url = new URL(window.location.href);
    url.hash = "";
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
  }

  #fillPageUrl() {
    const path = window.location.pathname + window.location.search;
    this.element.querySelectorAll('[data-support-chat-target="pageUrl"]').forEach((el) => {
      el.value = path;
    });
  }

  #startPresence() {
    this.#stopPresence();
    this.#pingPresence();
    this.presenceTimer = window.setInterval(() => this.#pingPresence(), PRESENCE_MS);
  }

  #stopPresence() {
    if (this.presenceTimer) {
      window.clearInterval(this.presenceTimer);
      this.presenceTimer = null;
    }
  }

  #pingPresence() {
    if (!this.hasPresenceFormTarget) return;
    this.#refreshFormTokens();
    const form = this.presenceFormTarget;
    const token = this.#csrf();
    if (!token) return;
    fetch(form.action, {
      method: "POST",
      headers: {
        "X-CSRF-Token": token,
        Accept: "text/plain",
      },
      credentials: "same-origin",
      keepalive: true,
    }).catch(() => {});
  }

  #csrf() {
    // Prefer the layout token when present so a stale frame bearer cannot win
    // after an account switch. Marketing pages omit meta and use the frame bearer.
    const meta = document.querySelector('meta[name="csrf-token"]')?.content || "";
    if (meta) return meta;
    return this.#csrfBearerToken() || this.csrfToken || "";
  }

  #csrfBearerToken() {
    if (!this.hasCsrfTarget) return "";
    return this.csrfTarget.dataset.token || "";
  }

  #captureFrameCsrf() {
    const token = this.#csrfBearerToken();
    if (!token) return;
    this.csrfToken = token;
    this.#installCsrfMeta(token);
  }

  #installCsrfMeta(token) {
    if (!token || !document.head) return;

    let param = document.querySelector('meta[name="csrf-param"]');
    if (!param) {
      param = document.createElement("meta");
      param.name = "csrf-param";
      param.content = "authenticity_token";
      document.head.appendChild(param);
    }

    let meta = document.querySelector('meta[name="csrf-token"]');
    // Never overwrite a layout-provided token. Clobbering it after an account
    // switch (permanent widget + stale frame bearer) produced full-page 422s.
    if (meta?.content) return;

    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "csrf-token";
      document.head.appendChild(meta);
    }
    meta.content = token;
  }

  #refreshFormTokens() {
    const token = this.#csrf();
    if (!token || !this.hasFrameTarget) return;
    this.frameTarget.querySelectorAll('input[name="authenticity_token"]').forEach((input) => {
      input.value = token;
    });
  }

  #watchCsrf() {
    this.#stopCsrfWatch();
    if (!this.hasFrameTarget) return;

    const bindCsrf = () => {
      this.csrfObserver?.disconnect();
      this.csrfObserver = null;
      const el = this.frameTarget.querySelector("#support_chat_csrf");
      if (!el) return;
      this.csrfObserver = new MutationObserver(() => {
        this.#captureFrameCsrf();
        this.#refreshFormTokens();
      });
      this.csrfObserver.observe(el, { attributes: true, attributeFilter: ["data-token"] });
    };

    bindCsrf();
    this.csrfFrameObserver = new MutationObserver((mutations) => {
      const csrfChanged = mutations.some((mutation) =>
        [...mutation.addedNodes, ...mutation.removedNodes].some(
          (node) =>
            node.nodeType === Node.ELEMENT_NODE &&
            (node.id === "support_chat_csrf" || node.querySelector?.("#support_chat_csrf")),
        ),
      );
      if (csrfChanged) bindCsrf();
    });
    this.csrfFrameObserver.observe(this.frameTarget, { childList: true, subtree: true });
  }

  #stopCsrfWatch() {
    this.csrfObserver?.disconnect();
    this.csrfObserver = null;
    this.csrfFrameObserver?.disconnect();
    this.csrfFrameObserver = null;
  }

  #scrollMessages() {
    if (!this.hasMessagesTarget) return;
    scrollChatToEnd(this.messagesTarget);
  }

  #armScrollPin() {
    if (!this.hasMessagesTarget || !this.#panelOpen()) return;
    this.#stopScrollPin();
    this.stopPin = armChatScrollPin(this.messagesTarget, { ms: 700 });
  }

  #ensureMessageWatch() {
    if (!this.hasMessagesTarget) return;
    if (this.watchedMessages === this.messagesTarget) return;
    this.#watchMessages();
  }

  #watchMessages() {
    this.#stopScrollWatch();
    if (!this.hasMessagesTarget) return;
    this.watchedMessages = this.messagesTarget;
    const existing = [...this.messagesTarget.querySelectorAll("[data-support-delivery-id]")]
      .map((el) => el.dataset.supportDeliveryId)
      .filter(Boolean);
    this.scrollObserver = new MutationObserver((mutations) => {
      this.#ackDelivered(mutations);
      if (this.#panelOpen()) this.#scrollMessages();
    });
    this.scrollObserver.observe(this.messagesTarget, { childList: true, subtree: true });
    this.#ackDeliveryIds(existing);
    if (this.#panelOpen()) this.#armScrollPin();
  }

  // Cable append of a staff bubble is the ping; ack when the panel is closed.
  // Open panel uses presence (COALESCE stamps delivered_at + read).
  #ackDelivered(mutations) {
    const ids = [];
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (node.dataset?.supportDeliveryId) ids.push(node.dataset.supportDeliveryId);
        node.querySelectorAll?.("[data-support-delivery-id]").forEach((el) => {
          if (el.dataset.supportDeliveryId) ids.push(el.dataset.supportDeliveryId);
        });
      }
    }
    this.#ackDeliveryIds(ids);
  }

  #ackDeliveryIds(ids) {
    const fresh = [...new Set(ids)].filter(
      (id) => id && !this.seenDeliveryIds.has(id) && !this.deliveredPending.has(id),
    );
    if (!fresh.length) return;

    if (this.#panelOpen()) {
      fresh.forEach((id) => this.seenDeliveryIds.add(id));
      this.#pingPresence();
      return;
    }

    fresh.forEach((id) => this.deliveredPending.add(id));
    this.#postDelivered(fresh);
  }

  #postDelivered(ids) {
    const release = () => ids.forEach((id) => this.deliveredPending.delete(id));
    const remember = () => {
      ids.forEach((id) => {
        this.deliveredPending.delete(id);
        this.seenDeliveryIds.add(id);
      });
    };
    if (!this.hasDeliveredFormTarget) {
      release();
      return;
    }
    this.#refreshFormTokens();
    const token = this.#csrf();
    if (!token) {
      release();
      return;
    }
    const body = new URLSearchParams();
    ids.forEach((id) => body.append("message_ids[]", id));
    fetch(this.deliveredFormTarget.action, {
      method: "POST",
      headers: {
        "X-CSRF-Token": token,
        Accept: "text/plain",
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body: body.toString(),
      credentials: "same-origin",
      keepalive: true,
    })
      .then((response) => {
        if (response.ok) remember();
        else release();
      })
      .catch(() => release());
  }

  #watchLauncherState() {
    this.#stopLauncherWatch();
    const bindLauncherState = () => {
      this.launcherStateObserver?.disconnect();
      this.launcherStateObserver = null;
      const el = this.element.querySelector("#support_chat_launcher_state");
      if (!el) return;
      this.launcherStateObserver = new MutationObserver(() => this.#applyWidgetState());
      // Badge paint touches child nodes; watching subtree here loops applyWidgetState.
      this.launcherStateObserver.observe(el, {
        attributes: true,
        attributeFilter: ["data-unread", "data-away", "data-closed", "data-conversation"],
      });
    };
    bindLauncherState();
    // Frame loads mutate the panel, not the launcher. Subtree here fired bind on every
    // bubble and froze the tab when frameLoaded ran.
    this.launcherObserver = new MutationObserver((mutations) => {
      const launcherChanged = mutations.some((mutation) =>
        [...mutation.addedNodes, ...mutation.removedNodes].some(
          (node) =>
            node.nodeType === Node.ELEMENT_NODE &&
            (node.id === "support_chat_launcher_state" ||
              node.querySelector?.("#support_chat_launcher_state")),
        ),
      );
      if (launcherChanged) bindLauncherState();
    });
    this.launcherObserver.observe(this.element, { childList: true });
  }

  #setLauncherDataset(launcher, { unread, away, closed, conversationId }) {
    const unreadValue = String(unread);
    const awayValue = String(away);
    const closedValue = String(closed);
    if (launcher.dataset.unread !== unreadValue) launcher.dataset.unread = unreadValue;
    if (launcher.dataset.away !== awayValue) launcher.dataset.away = awayValue;
    if (launcher.dataset.closed !== closedValue) launcher.dataset.closed = closedValue;
    if (conversationId) {
      if (launcher.dataset.conversation !== conversationId)
        launcher.dataset.conversation = conversationId;
    } else if (launcher.dataset.conversation) {
      delete launcher.dataset.conversation;
    }
  }

  #stopLauncherWatch() {
    this.launcherStateObserver?.disconnect();
    this.launcherStateObserver = null;
    this.launcherObserver?.disconnect();
    this.launcherObserver = null;
  }

  #stopScrollPin() {
    if (this.stopPin) {
      this.stopPin();
      this.stopPin = null;
    }
  }

  #stopScrollWatch() {
    this.#stopScrollPin();
    this.watchedMessages = null;
    if (this.scrollObserver) {
      this.scrollObserver.disconnect();
      this.scrollObserver = null;
    }
  }

  #watchWidgetState() {
    this.#stopWidgetWatch();
    if (!this.hasFrameTarget) return;

    const bindWidgetState = () => {
      this.widgetStateObserver?.disconnect();
      this.widgetStateObserver = null;
      const el = this.frameTarget.querySelector("#support_chat_widget_state");
      if (!el) return;
      this.widgetStateObserver = new MutationObserver(() => {
        this.#ensureMessageWatch();
        this.#applyWidgetState();
      });
      this.widgetStateObserver.observe(el, {
        attributes: true,
        attributeFilter: [
          "data-unread",
          "data-away",
          "data-closed",
          "data-conversation",
          "data-online",
        ],
      });
    };

    bindWidgetState();
    this.widgetFrameObserver = new MutationObserver((mutations) => {
      const stateChanged = mutations.some((mutation) =>
        [...mutation.addedNodes, ...mutation.removedNodes].some(
          (node) =>
            node.nodeType === Node.ELEMENT_NODE &&
            (node.id === "support_chat_widget_state" ||
              node.querySelector?.("#support_chat_widget_state")),
        ),
      );
      if (stateChanged) bindWidgetState();
    });
    this.widgetFrameObserver.observe(this.frameTarget, { childList: true, subtree: true });
  }

  #stopWidgetWatch() {
    this.widgetStateObserver?.disconnect();
    this.widgetStateObserver = null;
    this.widgetFrameObserver?.disconnect();
    this.widgetFrameObserver = null;
  }
}
