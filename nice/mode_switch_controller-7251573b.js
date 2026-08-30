import { Controller } from "@hotwired/stimulus";

const STORAGE_KEY = "crawlbench-admin-last";

function isModeShortcut(event) {
  return (event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "a";
}

/** Cross between customer desk and staff admin (full document swap). */
export default class extends Controller {
  static targets = ["desk", "admin"];
  static values = {
    adminUrl: String,
    deskUrl: String,
  };

  connect() {
    this.onKeydown = this.onKeydown.bind(this);
    document.addEventListener("keydown", this.onKeydown);
  }

  disconnect() {
    document.removeEventListener("keydown", this.onKeydown);
  }

  onKeydown(event) {
    if (!isModeShortcut(event)) return;
    if (event.defaultPrevented || this.isTypingTarget(event.target)) return;
    event.preventDefault();
    if (this.adminUrlValue && window.location.pathname.startsWith("/admin")) {
      this.rememberAdminPath();
      window.location.assign(this.deskUrlValue);
    } else if (this.adminUrlValue) {
      window.location.assign(this.storedAdminUrl() || this.adminUrlValue);
    }
  }

  goDesk(event) {
    if (event) event.preventDefault();
    this.rememberAdminPath();
    window.location.assign(this.deskUrlValue);
  }

  goAdmin(event) {
    if (event) event.preventDefault();
    window.location.assign(this.storedAdminUrl() || this.adminUrlValue);
  }

  rememberAdminPath() {
    if (!window.location.pathname.startsWith("/admin")) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, window.location.pathname + window.location.search);
    } catch {
      /* ignore */
    }
  }

  storedAdminUrl() {
    try {
      const path = window.localStorage.getItem(STORAGE_KEY);
      if (path && path.startsWith("/admin")) return path;
    } catch {
      /* ignore */
    }
    return null;
  }

  isTypingTarget(target) {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  }
}
