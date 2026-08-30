import { Controller } from "@hotwired/stimulus";
import { syncSidebarAlertsBadge } from "lib/alerts_sidebar_badge";
import { rowResolvedEnabled } from "lib/alerts_channel_state";

export default class extends Controller {
  static targets = ["row", "enabledCount", "subtitle"];
  static values = { url: String, defaultsUrl: String, channelTotal: Number };

  connect() {
    this.syncCounts();
  }

  async toggleDefault(event) {
    const el = event.currentTarget;
    const channel = el.dataset.channel;
    if (!channel || !this.defaultsUrlValue) return;

    const sw = el.querySelector(".alerts-sw");
    const previousOn = sw?.classList.contains("on");
    const enabled = !previousOn;
    this.setSwitch(sw, enabled);

    const body = new FormData();
    body.append(channel, enabled ? "1" : "0");

    try {
      const response = await this.patch(this.defaultsUrlValue, body);
      if (response.ok) {
        const row = this.rowFor(channel);
        if (row) row.dataset.defaultEnabled = enabled ? "true" : "false";
        this.renderRow(channel);
        this.broadcastChange();
        return;
      }
      this.setSwitch(sw, previousOn);
    } catch (_error) {
      this.setSwitch(sw, previousOn);
    }
  }

  async toggleWorkspace(event) {
    const el = event.currentTarget;
    const channel = el.dataset.channel;
    if (!channel || !this.urlValue) return;

    const sw = el.querySelector(".alerts-sw");
    const row = this.rowFor(channel);
    const previousOn = sw?.classList.contains("on");
    const enabled = !previousOn;

    this.setSwitch(sw, enabled);

    const body = new FormData();
    body.append(channel, enabled ? "on" : "off");

    try {
      const response = await this.patch(this.urlValue, body);
      if (response.ok) {
        if (row) {
          row.dataset.preference = enabled ? "on" : "off";
        }

        this.renderRow(channel, enabled ? "on" : "off");
        this.broadcastChange();
        return;
      }

      this.setSwitch(sw, previousOn);
    } catch (_error) {
      this.setSwitch(sw, previousOn);
    }
  }

  renderRow(channel, preferenceOverride = null) {
    const row = this.rowFor(channel);
    if (!row) return;

    if (preferenceOverride) {
      row.dataset.preference = preferenceOverride;
    }

    const resolvedEnabled = rowResolvedEnabled(row);
    row.classList.toggle("is-on", resolvedEnabled);

    const sw = row.querySelector(".alerts-cctl .alerts-sw");
    if (sw) this.setSwitch(sw, resolvedEnabled);

    const tile = row.querySelector(".alerts-ctile");
    if (tile) tile.classList.toggle("is-live", resolvedEnabled);

    const deskSnooze = this.deskSnooze();
    const snoozed = deskSnooze.snoozed && resolvedEnabled;
    const snoozeLabel = deskSnooze.label;
    row.dataset.snoozed = snoozed ? "true" : "false";
    if (snoozeLabel) row.dataset.snoozeLabel = snoozeLabel;

    row.classList.toggle("is-quiet", snoozed);

    const subtitle = row.querySelector('[data-notification-settings-target="subtitle"]');
    if (subtitle) {
      if (!resolvedEnabled) {
        subtitle.textContent = "off on this desk";
      } else if (snoozed && snoozeLabel) {
        subtitle.replaceChildren();
        const paused = document.createElement("span");
        paused.className = "paused";
        paused.textContent = `paused until ${snoozeLabel}`;
        subtitle.appendChild(paused);
        const destination = row.dataset.enabledSubtitle || "";
        if (destination) subtitle.appendChild(document.createTextNode(` · ${destination}`));
      } else {
        subtitle.textContent = row.dataset.enabledSubtitle || "";
      }
    }

    this.syncCounts();
  }

  deskSnooze() {
    const hero = document.getElementById("alerts_status_hero");
    if (!hero) return { snoozed: false, label: "" };

    return {
      snoozed: hero.dataset.snoozed === "true",
      label: hero.dataset.snoozeLabel || "",
    };
  }

  syncCounts() {
    let enabled = 0;

    this.rowTargets.forEach((row) => {
      if (rowResolvedEnabled(row)) enabled += 1;
    });

    const total = this.channelTotalValue || this.rowTargets.length;
    const label = `${enabled} of ${total} on`;

    this.enabledCountTargets.forEach((el) => {
      el.textContent = label;
    });

    syncSidebarAlertsBadge({
      rows: this.rowTargets,
      snoozed: this.deskSnooze().snoozed,
    });
  }

  broadcastChange() {
    const detail = this.channelState();
    document.dispatchEvent(new CustomEvent("alerts:channels-changed", { detail }));
  }

  channelState() {
    return {
      enabledCount: this.rowTargets.filter((row) => rowResolvedEnabled(row)).length,
      channelTotal: this.channelTotalValue || this.rowTargets.length,
      channels: this.rowTargets.map((row) => ({
        key: row.dataset.channel,
        label: row.dataset.channelLabel || row.dataset.channel,
        connected: row.dataset.connected === "true",
        preference: row.dataset.preference || "inherit",
        resolvedEnabled: rowResolvedEnabled(row),
        enabledSubtitle: row.dataset.enabledSubtitle || "",
      })),
    };
  }

  rowFor(channel) {
    return (
      this.rowTargets.find((el) => el.dataset.channel === channel) ||
      this.element.querySelector(`.alerts-crow[data-channel="${channel}"]`)
    );
  }

  setSwitch(el, enabled) {
    if (!el) return;
    el.classList.toggle("on", enabled);
    const button = el.closest("[role='switch']");
    if (button) button.setAttribute("aria-checked", enabled ? "true" : "false");
  }

  async patch(url, body) {
    return fetch(url, {
      method: "PATCH",
      headers: {
        "X-CSRF-Token": this.csrfToken,
      },
      body,
      credentials: "same-origin",
    });
  }

  get csrfToken() {
    return document.querySelector('meta[name="csrf-token"]')?.content || "";
  }
}
