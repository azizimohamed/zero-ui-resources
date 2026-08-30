// Pure radius / price / coverage label helpers for the monitor wizard.

export function usesMetricDistance(country, metricCountryCodes = []) {
  const code = country.toString().toUpperCase();
  return metricCountryCodes.map((entry) => entry.toString().toUpperCase()).includes(code);
}

export function radiusScaleNumber(
  miles,
  country,
  { metricCountryCodes = [], kmPerMile = 1.60934 } = {},
) {
  const mi = Math.round(Number(miles));
  if (!mi) return 0;

  return usesMetricDistance(country, metricCountryCodes) ? Math.round(mi * kmPerMile) : mi;
}

export function radiusSummaryLabel(
  miles,
  country,
  withRadiusSuffix = false,
  { metricCountryCodes = [], kmPerMile = 1.60934 } = {},
) {
  const n = radiusScaleNumber(miles, country, { metricCountryCodes, kmPerMile });
  if (!n) return "—";

  const unit = usesMetricDistance(country, metricCountryCodes) ? "km" : "mi";
  const label = `${n} ${unit}`;
  return withRadiusSuffix ? `${label} radius` : label;
}

export function priceCurrencySymbol(country, countryCurrencies = {}) {
  const code = country.toString().toUpperCase();
  const entry = countryCurrencies[code] || countryCurrencies.US;
  return entry?.symbol || "$";
}

export function priceRangeLabel(min, max, symbol) {
  return min && max ? `${symbol}${min} – ${symbol}${max}` : "—";
}

export function modeLabel(mode) {
  if (mode === "all_cities") return "all anchor cities";
  if (mode === "multi_city") return "custom city list";
  return "single city";
}

export function coverageEstimateLabel({
  scanIntervalMinutes = 0,
  mode,
  country,
  anchors = 0,
  cityCount = 0,
  radiusLabel = null,
} = {}) {
  const parts = [];
  if (scanIntervalMinutes > 0) parts.push(`Scans every ${scanIntervalMinutes} min`);
  if (mode === "all_cities" && anchors > 0) parts.push(`${anchors} anchors in ${country}`);
  else if (mode === "multi_city") parts.push(`${cityCount} cities selected`);
  else parts.push("single-city coverage");
  if (radiusLabel) parts.push(radiusLabel);
  return parts.join(" · ");
}
