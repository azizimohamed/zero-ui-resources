import { rowResolvedEnabled, rowWantsConnect } from "lib/alerts_channel_state";

const CONNECT_NUDGES = {
  telegram: { label: "Link TG", title: "Connect Telegram on Alerts" },
};

const CONNECT_ORDER = ["telegram"];

function connectNudgeFromRows(rows) {
  for (const key of CONNECT_ORDER) {
    const row = rows.find((el) => el.dataset.channel === key);
    if (!rowWantsConnect(row)) continue;

    return CONNECT_NUDGES[key];
  }

  return null;
}

function applyBadge(sidebar, label, title, variant) {
  sidebar.textContent = label;
  sidebar.title = title;
  sidebar.classList.remove(
    "sidebar-nav-alerts-badge--default",
    "sidebar-nav-alerts-badge--muted",
    "sidebar-nav-alerts-badge--warn",
    "sidebar-nav-alerts-badge--accent",
  );
  sidebar.classList.add(`sidebar-nav-alerts-badge--${variant}`);
}

export function syncSidebarAlertsBadge({ rows = [], snoozed = false } = {}) {
  const sidebar = document.getElementById("sidebar_nav_alerts_count");
  if (!sidebar) return;

  if (snoozed) {
    applyBadge(sidebar, "Paused", "Desk alerts paused", "warn");
    return;
  }

  const connect = connectNudgeFromRows(rows);
  if (connect) {
    applyBadge(sidebar, connect.label, connect.title, "accent");
    return;
  }

  const enabled = rows.filter((row) => rowResolvedEnabled(row)).length;
  if (enabled === 0) {
    applyBadge(sidebar, "All off", "No alert channels on for this desk", "muted");
    return;
  }

  const noun = enabled === 1 ? "channel" : "channels";
  applyBadge(sidebar, `${enabled} on`, `${enabled} ${noun} on for this desk`, "default");
}
