import { Controller } from "@hotwired/stimulus";

// iOS status-bar clock — visitor's local hour:minute (no seconds / AM·PM).
export default class extends Controller {
  connect() {
    this.tick();
    this.armNextMinute();
  }

  disconnect() {
    if (this.timeout) clearTimeout(this.timeout);
    if (this.interval) clearInterval(this.interval);
  }

  tick() {
    this.element.textContent = this.format(new Date());
  }

  armNextMinute() {
    const now = new Date();
    const ms = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    this.timeout = setTimeout(
      () => {
        this.tick();
        this.interval = setInterval(() => this.tick(), 60_000);
      },
      Math.max(ms, 250),
    );
  }

  format(date) {
    const parts = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).formatToParts(date);
    const hour = parts.find((p) => p.type === "hour")?.value ?? "";
    const minute = parts.find((p) => p.type === "minute")?.value ?? "";
    return `${hour}:${minute}`;
  }
}
