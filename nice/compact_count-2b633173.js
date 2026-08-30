export function compactCount(value) {
  const n = Math.trunc(Number(value) || 0);
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";

  if (abs < 1000) return `${sign}${abs}`;

  if (abs < 1_000_000) {
    const k = Math.round((abs / 1000) * 10) / 10;
    if (k >= 1000) return `${sign}${unit(abs / 1_000_000)}M`;
    return `${sign}${unit(k)}k`;
  }

  return `${sign}${unit(abs / 1_000_000)}M`;
}

function unit(scaled) {
  const rounded = Math.round(scaled * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function countFromElement(el) {
  if (!el) return NaN;
  if (el.dataset.count != null && el.dataset.count !== "") {
    return Number.parseInt(el.dataset.count, 10);
  }
  return Number.parseInt(String(el.textContent || "").replace(/,/g, ""), 10);
}

export function fullCountLabel(value) {
  return new Intl.NumberFormat().format(Math.trunc(Number(value) || 0));
}

const BULK_SCOPE_COUNT_ID = "matches_feed_bulk_count";

/** Badge for filtered bulk-triage scope. */
export function bulkScopeCountEl() {
  return document.getElementById(BULK_SCOPE_COUNT_ID);
}
