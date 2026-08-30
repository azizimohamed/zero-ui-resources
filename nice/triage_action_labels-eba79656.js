// Bar labels are the trio the cards and drawer use (Watch / Watching, Skip / Skipped,
// Mark contacted / Marked contacted). The sheet spells the verb out because it acts on a whole view.
export function triageDefaults(triage) {
  switch ((triage || "all").toString()) {
    case "skipped":
      return {
        watchlist: { action: "watchlist", sheetLabel: "Watch all", barLabel: "Watch" },
        skip: { action: "neutral", sheetLabel: "Restore all", barLabel: "Skipped" },
        contacted: {
          action: "contacted",
          sheetLabel: "Mark contacted",
          barLabel: "Mark contacted",
        },
      };
    case "watchlist":
      return {
        watchlist: { action: "neutral", sheetLabel: "Unwatch all", barLabel: "Watching" },
        skip: { action: "skipped", sheetLabel: "Skip all", barLabel: "Skip" },
        contacted: {
          action: "contacted",
          sheetLabel: "Mark contacted",
          barLabel: "Mark contacted",
        },
      };
    case "contacted":
      return {
        watchlist: { action: "watchlist", sheetLabel: "Watch all", barLabel: "Watch" },
        skip: { action: "skipped", sheetLabel: "Skip all", barLabel: "Skip" },
        contacted: {
          action: "neutral",
          sheetLabel: "Clear contacted",
          barLabel: "Marked contacted",
        },
      };
    default:
      return {
        watchlist: { action: "watchlist", sheetLabel: "Watch all", barLabel: "Watch" },
        skip: { action: "skipped", sheetLabel: "Skip all", barLabel: "Skip" },
        contacted: {
          action: "contacted",
          sheetLabel: "Mark contacted",
          barLabel: "Mark contacted",
        },
      };
  }
}

export function applyActionButton(button, labelEl, action, label) {
  if (!button || !labelEl) return;
  button.dataset.bulkAction = action;
  labelEl.textContent = label;
}
