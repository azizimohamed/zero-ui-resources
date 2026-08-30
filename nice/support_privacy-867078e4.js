// Visitor widget privacy notice. Inline script in _privacy_notice.html.erb must
// keep PRIVACY_DISMISSED_KEY in sync for first-paint bootstrap.
export const PRIVACY_DISMISSED_KEY = "support_chat_privacy_dismissed";

export function privacyDismissed() {
  try {
    return localStorage.getItem(PRIVACY_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function markPrivacyDismissed() {
  try {
    localStorage.setItem(PRIVACY_DISMISSED_KEY, "1");
  } catch {
    /* private mode */
  }
  document.documentElement.dataset.supportChatPrivacyDismissed = "1";
}

export function syncPrivacyNotice(el, { home }) {
  if (!el) return;
  if (!home) {
    el.hidden = true;
    return;
  }
  const dismissed = privacyDismissed();
  if (dismissed) {
    document.documentElement.dataset.supportChatPrivacyDismissed = "1";
  } else {
    delete document.documentElement.dataset.supportChatPrivacyDismissed;
  }
  el.hidden = dismissed;
}
