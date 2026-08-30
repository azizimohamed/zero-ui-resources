// Shared Promise-based confirm for Turbo Drive and legacy call sites.
// Prefer `confirmAction` from lib/confirm for new code.

import { confirmAction, payloadFromElement, themeToVariant, inferConfirmLabel } from "lib/confirm";

const allowedSubmitters = new WeakSet();
const APPROVED_ATTR = "data-confirm-approved";

/** @param {string} message @param {{ theme?: string, variant?: string } | undefined} [options] */
export function confirmDialog(message, options = {}) {
  return confirmAction({
    title: message,
    variant: themeToVariant(options.variant || options.theme),
    confirmLabel: inferConfirmLabel(message),
  });
}

export function setConfirmDialogImpl(_nextImpl) {
  // no-op: confirm-modal controller registers via lib/confirm
}

export function resetConfirmDialog() {
  // no-op
}

function installMethodLinkBridge() {
  document.addEventListener(
    "click",
    async (event) => {
      const link = event.target.closest?.(
        `a[data-turbo-method][data-confirm-payload]:not([${APPROVED_ATTR}])`,
      );
      if (!link) return;
      if (link.hasAttribute("data-turbo-confirm")) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      const payload = payloadFromElement(link);
      if (!payload) return;

      const ok = await confirmAction(payload);
      if (!ok) return;

      link.setAttribute(APPROVED_ATTR, "1");
      try {
        link.click();
      } finally {
        link.removeAttribute(APPROVED_ATTR);
      }
    },
    true,
  );
}

function installPayloadBridge() {
  document.addEventListener(
    "click",
    async (event) => {
      const el = event.target.closest?.(
        "button[type='submit'], button:not([type]), input[type='submit'], input[type='image']",
      );
      if (!el || !el.form) return;
      if (allowedSubmitters.has(el)) return;

      const payload = payloadFromElement(el);
      if (!payload) return;

      // Turbo Drive will invoke Turbo.config.forms.confirm when turbo_confirm is present.
      const hasTurboConfirm =
        el.hasAttribute("data-turbo-confirm") || el.form.hasAttribute("data-turbo-confirm");
      if (hasTurboConfirm) return;

      // Capture-phase bridge owns confirm_payload submits (Stimulus confirm-then-submit
      // never runs). Gate HTML5 required fields before opening the modal.
      if (!el.form.reportValidity()) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      const ok = await confirmAction(payload);
      if (!ok) return;

      allowedSubmitters.add(el);
      try {
        if (typeof el.form.requestSubmit === "function") {
          el.form.requestSubmit(el);
        } else {
          el.form.submit();
        }
      } finally {
        queueMicrotask(() => allowedSubmitters.delete(el));
      }
    },
    true,
  );
}

installPayloadBridge();
installMethodLinkBridge();
