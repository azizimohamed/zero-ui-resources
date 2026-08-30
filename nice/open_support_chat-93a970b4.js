// Shared entry into the permanent support-chat Stimulus controller.
export function openSupportChat(application, { refresh = false } = {}) {
  if (document.body.classList.contains("drawer-open")) return false;

  const widget = document.querySelector('[data-controller~="support-chat"]');
  if (!widget) {
    window.location.hash = "support-chat";
    return false;
  }

  const ctrl = application?.getControllerForElementAndIdentifier(widget, "support-chat");
  if (!ctrl) {
    window.location.hash = "support-chat";
    return false;
  }

  ctrl.open({ refresh });
  return true;
}

export function closeSupportChat(application) {
  const widget = document.querySelector('[data-controller~="support-chat"]');
  if (!widget) return false;

  const ctrl = application?.getControllerForElementAndIdentifier(widget, "support-chat");
  if (!ctrl) return false;

  if (typeof ctrl.closeImmediate === "function") ctrl.closeImmediate();
  else ctrl.close();
  return true;
}
