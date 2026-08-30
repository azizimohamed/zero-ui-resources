import { Controller } from "@hotwired/stimulus";

const THREAD_PATH = /\/admin\/support\/([a-zA-Z0-9]{12})$/;
const MESSAGES_PREFIX = "support_admin_messages_";
const COMPACT_MQ = "(max-width: 820px)";

// Keep the queue mounted while swapping the thread pane via Turbo Frame.
// Updates desk mode classes (mobile list/detail) and the active row highlight.
export default class extends Controller {
  static targets = ["row"];
  static values = { activeId: String };

  connect() {
    this.onFrameLoad = this.onFrameLoad.bind(this);
    this.onVisit = this.onVisit.bind(this);
    this.deferThreadMode = false;
    this.element.addEventListener("turbo:frame-load", this.onFrameLoad);
    document.addEventListener("turbo:load", this.onVisit);
    this.#adoptActiveId(this.#idFromPath(window.location.pathname));
    this.#syncMode();
    this.#syncActive();
  }

  disconnect() {
    this.element.removeEventListener("turbo:frame-load", this.onFrameLoad);
    document.removeEventListener("turbo:load", this.onVisit);
  }

  // Highlight immediately. On phones from the queue list, defer desk--thread
  // until the frame paints real thread HTML (avoids empty-pane flash).
  select(event) {
    const id = event.currentTarget.dataset.conversationId;
    if (!id) return;

    const fromQueue = this.#compact() && !this.element.classList.contains("desk--thread");
    this.deferThreadMode = fromQueue;
    this.activeIdValue = id;
  }

  rowTargetConnected() {
    this.#syncActive();
  }

  onVisit() {
    this.deferThreadMode = false;
    this.#adoptActiveId(this.#idFromPath(window.location.pathname));
  }

  onFrameLoad(event) {
    if (event.target?.id !== "support_desk_thread") return;

    this.deferThreadMode = false;
    this.#adoptActiveId(
      this.#idFromPath(window.location.pathname) || this.#idFromThread(event.target),
    );
  }

  activeIdValueChanged() {
    this.#syncMode();
    this.#syncActive();
  }

  #adoptActiveId(id) {
    const next = id || "";
    if (next !== this.activeIdValue) this.activeIdValue = next;
    else {
      this.#syncMode();
      this.#syncActive();
    }
  }

  #idFromPath(path) {
    const match = String(path || "").match(THREAD_PATH);
    return match ? match[1] : "";
  }

  // Turbo Frame visits replace the frame's children, not its attributes, so
  // data-conversation-id on #support_desk_thread stays stale after a click.
  #idFromThread(frame) {
    const messages = frame?.querySelector(`[id^="${MESSAGES_PREFIX}"]`);
    if (!messages) return "";
    return messages.id.slice(MESSAGES_PREFIX.length);
  }

  #compact() {
    return window.matchMedia(COMPACT_MQ).matches;
  }

  #syncMode() {
    const open = Boolean(this.activeIdValue) && !this.deferThreadMode;
    this.element.classList.toggle("desk--thread", open);
    this.element.classList.toggle("desk--queue", !open);
  }

  #syncActive() {
    if (!this.hasRowTarget) return;
    this.rowTargets.forEach((row) => {
      const on = row.dataset.conversationId === this.activeIdValue;
      row.classList.toggle("on", on);
    });
  }
}
