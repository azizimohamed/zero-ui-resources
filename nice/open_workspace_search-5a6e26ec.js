// Open the authenticated workspace search dialog from topbar entry points.
export function openWorkspaceSearch() {
  document.querySelector("[data-global-search-trigger]")?.click();
}
