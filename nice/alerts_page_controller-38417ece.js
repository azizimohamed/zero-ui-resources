import { Controller } from "@hotwired/stimulus";
import { lockScroll, unlockScroll } from "lib/scroll_lock";
import { syncSidebarAlertsBadge } from "lib/alerts_sidebar_badge";
import { rowResolvedEnabled } from "lib/alerts_channel_state";

export default class extends Controller {
  static targets = [
    "pauseSheet",
    "connectSheet",
    "pauseActionTemplate",
    "snoozeActionTemplate",
    "railState",
  ];

  static values = {
    snoozed: Boolean,
    snoozeLabel: String,
    openConnect: String,
  };

  connect() {
    this.onKeydown = this.handleKeydown.bind(this);
    this.onChannelsChanged = this.syncFromChannels.bind(this);
    this.onSubmitEnd = this.handleSubmitEnd.bind(this);
    this.onCloseSheets = () => this.closeSheets();
    this.onOpenConnect = (event) => {
      const channel = event.detail?.channel;
      if (channel) this.showConnectSheet(channel);
    };
    document.addEventListener("alerts:channels-changed", this.onChannelsChanged);
    document.addEventListener("alerts:close-sheets", this.onCloseSheets);
    document.addEventListener("alerts:open-connect", this.onOpenConnect);
    this.element.addEventListener("turbo:submit-end", this.onSubmitEnd);
    this.openConnectFromQuery();
  }

  disconnect() {
    document.removeEventListener("alerts:channels-changed", this.onChannelsChanged);
    document.removeEventListener("alerts:close-sheets", this.onCloseSheets);
    document.removeEventListener("alerts:open-connect", this.onOpenConnect);
    this.element.removeEventListener("turbo:submit-end", this.onSubmitEnd);
    document.removeEventListener("keydown", this.onKeydown);
    unlockScroll(this);
  }

  openPause() {
    this.showPauseSheet();
  }

  openConnect(event) {
    const channel = event.currentTarget.dataset.channel;
    if (!channel) return;

    this.showConnectSheet(channel);
  }

  openOverride(event) {
    const channel = event.currentTarget.dataset.channel;
    if (!channel) return;

    this.showConnectSheet(`${channel}-override`);
  }

  closeSheets() {
    this.dismissSheetOverlays({ unlock: true });
  }

  openConnectFromQuery() {
    const channel = this.openConnectValue;
    if (!channel) return;

    this.showConnectSheet(channel);
    this.stripConnectQuery();
  }

  stripConnectQuery() {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("connect")) return;

    url.searchParams.delete("connect");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  showPauseSheet() {
    if (!this.hasPauseSheetTarget) return;

    this.dismissSheetOverlays();
    this.openModal(this.pauseSheetTarget);
  }

  showConnectSheet(channel) {
    const sheet = this.connectSheetTargets.find((el) => el.dataset.connectChannel === channel);
    if (!sheet) return;

    this.dismissSheetOverlays();

    if (channel === "telegram") {
      const mintLink = sheet.querySelector("[data-telegram-mint-link]");
      if (mintLink) {
        mintLink.click();
        this.dismissSheetOverlays({ unlock: true });
        return;
      }
    }

    this.openModal(sheet);
  }

  openModal(sheet) {
    lockScroll(this);
    sheet.hidden = false;
    sheet.classList.remove("hidden");
    sheet.classList.add("is-open");
    sheet.setAttribute("aria-hidden", "false");
    document.removeEventListener("keydown", this.onKeydown);
    document.addEventListener("keydown", this.onKeydown);

    const panel = sheet.querySelector(".alerts-modal__panel");
    const focusable = panel?.querySelector("button, input, [href], textarea, select");
    focusable?.focus();
  }

  dismissSheetOverlays({ unlock = false } = {}) {
    this.closeAllSheetUIs();
    document.removeEventListener("keydown", this.onKeydown);
    if (unlock) unlockScroll(this);
  }

  closeAllSheetUIs() {
    if (this.hasPauseSheetTarget) {
      this.closeModal(this.pauseSheetTarget);
    }

    this.connectSheetTargets.forEach((sheet) => this.closeModal(sheet));
  }

  closeModal(sheet) {
    sheet.hidden = true;
    sheet.classList.add("hidden");
    sheet.classList.remove("is-open");
    sheet.setAttribute("aria-hidden", "true");
  }

  handleKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      this.closeSheets();
    }
  }

  handleSubmitEnd(event) {
    if (!event.detail.success) return;

    const form = event.target;
    const action = form.getAttribute("action") || "";
    if (!action.includes("alerts_snooze")) return;

    const syncAfterSnoozeStreams = () => {
      this.syncUi(this.channelStateFromPanel());
    };

    document.addEventListener("turbo:after-stream-render", syncAfterSnoozeStreams, { once: true });
    this.closeSheets();
  }

  syncFromChannels(event) {
    const state = event?.detail || this.channelStateFromPanel();
    if (!state) return;

    this.syncUi(state);
  }

  syncUi(state) {
    if (!state) return;

    const snooze = this.deskSnoozeFromHero();
    this.snoozedValue = snooze.snoozed;
    this.snoozeLabelValue = snooze.label;

    this.updateHero(state, snooze);
    this.updateRail(state, snooze);
    this.updateActions(state, snooze);
    this.updateSidebarBadge(state, snooze);
  }

  updateSidebarBadge(state, snooze) {
    const panel = document.getElementById("alerts_notifications_panel");
    const rows = panel
      ? Array.from(panel.querySelectorAll('[data-notification-settings-target="row"]'))
      : [];

    syncSidebarAlertsBadge({ rows, snoozed: snooze.snoozed });
  }

  deskSnoozeFromHero() {
    const hero = document.getElementById("alerts_status_hero");
    if (!hero) {
      return { snoozed: this.snoozedValue, label: this.snoozeLabelValue || "" };
    }

    return {
      snoozed: hero.dataset.snoozed === "true",
      label: hero.dataset.snoozeLabel || "",
    };
  }

  channelStateFromPanel() {
    const panel = document.getElementById("alerts_notifications_panel");
    if (!panel) return null;

    const rows = panel.querySelectorAll('[data-notification-settings-target="row"]');
    const channels = Array.from(rows).map((row) => ({
      key: row.dataset.channel,
      label: row.dataset.channelLabel || row.dataset.channel,
      connected: row.dataset.connected === "true",
      preference: row.dataset.preference || "inherit",
      resolvedEnabled: rowResolvedEnabled(row),
      enabledSubtitle: row.dataset.enabledSubtitle || "",
    }));

    return {
      enabledCount: channels.filter((row) => row.resolvedEnabled).length,
      channelTotal: channels.length,
      channels,
    };
  }

  updateHero(state, snooze) {
    const hero = document.getElementById("alerts_status_hero");
    if (!hero) return;

    const { enabledCount, channels } = state;
    const onChannels = channels.filter((row) => row.resolvedEnabled);
    const { snoozed, label: snoozeLabel } = snooze;

    hero.classList.remove("is-quiet", "is-off");
    if (snoozed) {
      hero.classList.add("is-quiet");
    } else if (enabledCount === 0) {
      hero.classList.add("is-off");
    }

    const heroKeyword = hero.querySelector('[data-alerts-page-target="heroKeyword"]');
    if (heroKeyword) {
      heroKeyword.textContent = this.heroKeywordFor(snoozed, enabledCount);
    }

    const heroTitle = hero.querySelector('[data-alerts-page-target="heroTitle"]');
    if (heroTitle) {
      heroTitle.innerHTML = this.heroTitleHtml(onChannels, snoozed, snoozeLabel);
    }

    const heroSubtitle = hero.querySelector('[data-alerts-page-target="heroSubtitle"]');
    if (heroSubtitle) {
      heroSubtitle.textContent = this.heroSubtitleFor(snoozed, enabledCount);
    }
  }

  updateActions(state, snooze) {
    const { enabledCount } = state;

    this.actionContainers().forEach((container) => {
      if (snooze.snoozed) {
        container.hidden = false;
        if (!this.containerHasSnoozeActions(container)) {
          container.replaceChildren(this.buildSnoozeActions());
        }
        return;
      }

      if (enabledCount === 0) {
        container.replaceChildren();
        container.hidden = true;
        return;
      }

      container.hidden = false;
      if (this.containerHasPauseAction(container)) return;

      container.replaceChildren(this.buildPauseAction());
    });
  }

  actionContainers() {
    const hero = document.getElementById("alerts_status_hero");
    const heroActions = hero?.querySelector('[data-alerts-page-target="heroActions"]');
    return heroActions ? [heroActions] : [];
  }

  containerHasSnoozeActions(container) {
    return container.querySelector('form[action*="alerts_snooze"] input[name="clear"]') !== null;
  }

  containerHasPauseAction(container) {
    return (
      container.querySelector('[data-action*="openPause"]') !== null &&
      !this.containerHasSnoozeActions(container)
    );
  }

  buildPauseAction() {
    if (this.hasPauseActionTemplateTarget) {
      return this.pauseActionTemplateTarget.content.cloneNode(true);
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn";
    button.dataset.action = "alerts-page#openPause";
    button.textContent = "Pause alerts";
    return button;
  }

  buildSnoozeActions() {
    if (this.hasSnoozeActionTemplateTarget) {
      return this.snoozeActionTemplateTarget.content.cloneNode(true);
    }

    const fragment = document.createDocumentFragment();
    const resume = document.createElement("button");
    resume.type = "button";
    resume.className = "btn btn-primary";
    resume.textContent = "Resume now";
    fragment.append(resume);
    return fragment;
  }

  updateRail(state, snooze) {
    const rail =
      document.getElementById("alerts_rail_state") ||
      (this.hasRailStateTarget ? this.railStateTarget : null);
    if (!rail) return;

    rail.textContent = this.railStateFor(snooze.snoozed, snooze.label, state.enabledCount);
  }

  heroKeywordFor(snoozed, enabledCount) {
    if (snoozed) return "paused";
    if (enabledCount === 0) return "nothing on";
    return "delivering";
  }

  heroTitleHtml(onChannels, snoozed, snoozeLabel) {
    if (onChannels.length === 0) {
      return "No channel is on. Matches only pile up in the queue.";
    }

    if (snoozed) {
      return `Paused until <em>${this.escapeHtml(snoozeLabel)}</em>.`;
    }

    return this.heroTitleFor(onChannels);
  }

  heroSubtitleFor(snoozed, enabledCount) {
    if (snoozed) {
      return "Scanning continues. Matches wait in the queue until you resume.";
    }

    if (enabledCount === 0) {
      return "Turn on a channel below and new matches will find you.";
    }

    return "Batched every couple of minutes · only listings posted in the last 3 hours.";
  }

  railStateFor(snoozed, snoozeLabel, enabledCount) {
    if (snoozed) return `Paused until ${snoozeLabel}. Scans keep running.`;
    if (enabledCount > 0) return "Delivering now.";
    return "Nothing is being sent.";
  }

  heroTitleFor(onChannels) {
    if (onChannels.length === 0) {
      return "No channel is on. Matches only pile up in the queue.";
    }

    const labels = onChannels.map((row) => `<em>${this.escapeHtml(row.label)}</em>`);
    if (labels.length === 1) {
      return `Matches reach you on ${labels[0]}.`;
    }

    return `Matches reach you on ${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}.`;
  }

  escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}
