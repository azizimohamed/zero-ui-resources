/**
 * Maps visually hidden form controls (sr-only selects, chip hidden inputs) to the
 * visible control users interact with so native `reportValidity()` bubbles align.
 */

const PROXY_CLEAR_HANDLERS = new WeakMap();

/** @param {HTMLElement} field */
export function validationAnchorFor(field) {
  if (!field) return field;

  const comboboxRoot = field.closest("[data-controller~='combobox']");
  if (comboboxRoot && field.matches("select")) {
    const input = comboboxRoot.querySelector(".combobox-input");
    if (input) return input;
  }

  const locationRoot = field.closest("[data-controller~='location-catalog']");
  if (locationRoot && field.matches("select[multiple][data-location-catalog-target='cities']")) {
    const search = locationRoot.querySelector("[data-location-catalog-target='search']");
    if (search) return search;
  }

  const chipRoot = field.closest("[data-controller~='chip-input']");
  if (chipRoot && field.matches("[data-chip-input-target='hidden']")) {
    const entry = chipRoot.querySelector("[data-chip-input-target='input']");
    if (entry) return entry;
  }

  if (field.classList.contains("sr-only") || field.matches("[type='hidden'][required]")) {
    const wizField = field.closest(".wiz-field");
    if (wizField) {
      const visible = wizField.querySelector(
        "input:not(.sr-only):not([type='hidden']), select:not(.sr-only), textarea:not(.sr-only), .combobox-input",
      );
      if (visible && visible !== field) return visible;
    }
  }

  return field;
}

function bindValidationProxyClear(field, anchor) {
  const existing = PROXY_CLEAR_HANDLERS.get(field);
  if (existing) {
    field.removeEventListener("input", existing);
    field.removeEventListener("change", existing);
  }

  const clear = () => {
    if (!field.checkValidity()) return;

    anchor.setCustomValidity("");
    field.removeEventListener("input", clear);
    field.removeEventListener("change", clear);
    PROXY_CLEAR_HANDLERS.delete(field);
  };

  PROXY_CLEAR_HANDLERS.set(field, clear);
  field.addEventListener("input", clear);
  field.addEventListener("change", clear);
}

/**
 * Show the browser validation bubble on the visible anchor for `field`.
 *
 * @param {HTMLElement} field
 * @param {{ focus?: boolean }} [options]
 * @returns {boolean} true when a bubble was shown
 */
export function reportFieldValidity(field, { focus = true } = {}) {
  if (!field) return false;

  const anchor = validationAnchorFor(field);

  if (anchor === field) {
    field.reportValidity();
    if (focus) field.focus({ preventScroll: false });
    return true;
  }

  anchor.setCustomValidity(field.validationMessage);
  anchor.reportValidity();
  bindValidationProxyClear(field, anchor);

  if (focus) anchor.focus({ preventScroll: false });
  return true;
}
