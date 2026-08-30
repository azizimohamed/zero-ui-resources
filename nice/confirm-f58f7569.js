// Framework-free confirm dialog API. Impl is provided by confirm-modal controller.

let impl = null;
const pending = [];

/** @param {(opts: object) => Promise<boolean|string>} next */
export function setConfirmActionImpl(next) {
  impl = typeof next === "function" ? next : null;
  if (!impl) return;
  while (pending.length) {
    const { opts, resolve } = pending.shift();
    resolve(impl(opts));
  }
}

export function resetConfirmActionImpl() {
  impl = null;
}

/**
 * @param {object} options
 * @returns {Promise<boolean|string>} false on cancel; true (or prompt string) on confirm
 */
export function confirmAction(options = {}) {
  const opts = normalizeOptions(options);
  if (impl) return Promise.resolve(impl(opts));
  return new Promise((resolve) => {
    pending.push({ opts, resolve });
    // Fallback if controller never connects (e.g. missing layout shell).
    queueMicrotask(() => {
      if (impl || !pending.length) return;
      const native = window.confirm([opts.title, opts.message].filter(Boolean).join("\n\n"));
      while (pending.length) pending.shift().resolve(native);
    });
  });
}

/** Map legacy theme / variant strings to dialog variants. */
export function themeToVariant(raw) {
  if (raw === "danger" || raw === "warning") return raw;
  if (raw === "primary") return "default";
  return "default";
}

/** Verb-first label for string-only turbo confirms. */
export function inferConfirmLabel(message) {
  const m = String(message || "");
  if (/^delete\b/i.test(m)) return "Delete";
  if (/^remove\b/i.test(m)) return "Remove";
  if (/^pause\b/i.test(m)) return "Pause";
  if (/^disconnect\b/i.test(m)) return "Disconnect";
  if (/^leave\b/i.test(m)) return "Leave";
  if (/^block\b/i.test(m)) return "Block";
  if (/^rotate\b/i.test(m)) return "Rotate";
  return "Continue";
}

function normalizeOptions(options) {
  const variant = themeToVariant(options.variant || options.theme);
  const title = options.title || options.message || "Continue?";
  return {
    variant,
    title,
    message: options.title ? options.message || null : null,
    confirmLabel: options.confirmLabel || options.confirm_label || inferConfirmLabel(title),
    cancelLabel: options.cancelLabel || options.cancel_label || "Cancel",
    subject: options.subject || null,
    consequences: options.consequences || null,
    requireTyped: options.requireTyped || options.require_typed || null,
    prompt: options.prompt || null,
  };
}

/**
 * Parse data-confirm-payload JSON from an element (or its form).
 * @param {Element|null} el
 */
export function payloadFromElement(el) {
  if (!el) return null;
  const raw =
    el.getAttribute?.("data-confirm-payload") ||
    el.closest?.("[data-confirm-payload]")?.getAttribute("data-confirm-payload") ||
    el.form?.getAttribute?.("data-confirm-payload");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_err) {
    return null;
  }
}
