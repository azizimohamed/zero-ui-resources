// Pure criteria/review helpers for the create/edit monitor wizard.

export const SEARCH_KEYWORD_MAX = 10;
export const SEARCH_KEYWORD_MAX_WORDS = 4;

export function searchKeywordTokens(csv) {
  return (csv || "")
    .split(/[,\n\t;]+/)
    .map((piece) => piece.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function normalizedChipCsv(csv) {
  if (!csv) return "none";
  const joined = searchKeywordTokens(csv).join(", ");
  return joined || "none";
}

// Criteria fieldset / review panel key (cameras shares the keyword fallback panel).
export function criteriaPanelTypeFor(slug) {
  if (slug === "vehicles") return "vehicles";
  if (slug === "real_estate") return "real_estate";
  if (slug === "electronics") return "electronics";
  return "fallback";
}

// Tip + alert-preview keys that have category-specific copy/samples.
export function criteriaChromeTypeFor(slug) {
  const known = ["vehicles", "real_estate", "electronics", "cameras"];
  return known.includes(slug) ? slug : "fallback";
}

export function realEstateLabelMapsFromSection(section) {
  const raw = section?.dataset?.realEstateLabels;
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function criteriaSummaryForReviewType(reviewType, readValue, labelMaps = {}) {
  if (reviewType === "vehicles") return vehicleCriteriaSummary(readValue);
  if (reviewType === "real_estate") return realEstateCriteriaSummary(readValue, labelMaps);
  if (reviewType === "electronics") return electronicsCriteriaSummary(readValue);
  // Keywords live on the dedicated Search keywords row; fallback has no other criteria.
  return "—";
}

function vehicleCriteriaSummary(readValue) {
  const make = readValue("search_profile_vehicle_make");
  const model = readValue("search_profile_vehicle_model");
  const yMin = readValue("search_profile_vehicle_year_min");
  const yMax = readValue("search_profile_vehicle_year_max");
  const maxMi = readValue("search_profile_vehicle_max_mileage");
  const tx = readValue("search_profile_vehicle_transmission") || "any";
  const days = readValue("search_profile_days_since_listed");

  const parts = [];
  if (make || model) parts.push([make, model].filter(Boolean).join(" "));
  if (yMin && yMax) parts.push(`${yMin}–${yMax}`);
  if (maxMi) parts.push(`≤${maxMi} mi`);
  if (tx && tx !== "any") parts.push(tx);
  if (days) parts.push(days === "1" ? "24h" : `${days}d`);

  return parts.length ? parts.join(" · ") : "—";
}

function electronicsCriteriaSummary(readValue) {
  const parts = [];
  const dt = readValue("search_profile_el_device_type");
  if (dt && dt !== "any") parts.push(dt.replace(/_/g, " "));
  const days = readValue("search_profile_days_since_listed");
  if (days) parts.push(days === "1" ? "24h" : `${days}d`);

  return parts.length ? parts.join(" · ") : "—";
}

function realEstateCriteriaSummary(readValue, labelMaps = {}) {
  const listingLabels = labelMaps.listing || {};
  const propertyLabels = labelMaps.property || {};
  const parts = [];
  const pt = readValue("search_profile_re_property_type");
  const lt = readValue("search_profile_re_listing_type");
  if (lt && lt !== "any") parts.push(listingLabels[lt] || lt.replace(/_/g, " "));
  if (pt && pt !== "any") parts.push(propertyLabels[pt] || pt.replace(/_/g, " "));
  const bMin = readValue("search_profile_re_beds_min");
  const bMax = readValue("search_profile_re_beds_max");
  if (bMin || bMax) parts.push(`${bMin || "—"}–${bMax || "—"} bd`);
  const tMin = readValue("search_profile_re_baths_min");
  const tMax = readValue("search_profile_re_baths_max");
  if (tMin || tMax) parts.push(`${tMin || "—"}–${tMax || "—"} ba`);
  const days = readValue("search_profile_days_since_listed");
  if (days) parts.push(days === "1" ? "24h" : `${days}d`);

  return parts.length ? parts.join(" · ") : "—";
}
