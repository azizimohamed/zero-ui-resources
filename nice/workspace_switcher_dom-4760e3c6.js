/**
 * Workspace switcher markup contract (sidebar → Stimlus).
 * Keeps drawer/focus and switcher controllers aligned on the same selectors.
 */
export const workspaceSwitcherBackdropSelector = '[data-workspace-switcher-target="backdrop"]';
export const workspaceSwitcherFilterSelector = '[data-workspace-switcher-target="filter"]';
export const workspaceSwitcherItemSelector = '[data-workspace-switcher-target="item"]';
export const workspaceSwitcherListSelector = '[data-workspace-switcher-target="list"]';
export const workspaceSwitcherCurrentSelector = '[data-workspace-switcher-target="current"]';
export const workspaceSwitcherSwitchLabelSelector =
  '[data-workspace-switcher-target="switchLabel"]';
export const workspaceSwitcherEmptyStateSelector = '[data-workspace-switcher-target="emptyState"]';
export const workspaceSwitcherBackdropVisibleSelector = `${workspaceSwitcherBackdropSelector}:not(.hidden)`;
