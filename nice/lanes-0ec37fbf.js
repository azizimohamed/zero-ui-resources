// Template-lane overlays for the create-monitor wizard.
// Price and model follow Coverage country even when the operator already renamed.

import { writeField, findField } from "wizard/field_access";

const MARKET_FIELD_KEYS = ["price_min_dollars", "price_max_dollars", "name", "vehicle_model"];

const DEFAULT_SYNC_KEYS = ["price_min_dollars", "price_max_dollars", "name"];

const CRITERIA_FIELD_KEYS = [
  "vehicle_kind",
  "vehicle_make",
  "vehicle_model",
  "vehicle_year_min",
  "vehicle_year_max",
  "vehicle_max_mileage",
  "vehicle_transmission",
  "vehicle_body_style",
  "re_property_type",
  "re_listing_type",
  "re_beds_min",
  "re_beds_max",
  "re_baths_min",
  "re_baths_max",
  "re_sqft_min",
  "re_sqft_max",
  "el_device_type",
  "days_since_listed",
];

export function laneMarketFor(markets, laneKey, country) {
  if (!laneKey || laneKey === "custom") return null;
  const code = (country || "US").toString().toUpperCase();
  return markets?.[laneKey]?.[code] || null;
}

export function laneMarketFields(market) {
  if (!market) return {};

  const fields = {};
  MARKET_FIELD_KEYS.forEach((key) => {
    if (market[key] == null || market[key] === "") return;
    fields[key] = market[key];
  });
  return fields;
}

export function marketKeysMatch(readValue, market, keys) {
  if (!market) return false;

  return keys.every((key) => {
    if (market[key] == null || market[key] === "") return true;
    return String(readValue(`search_profile_${key}`) || "") === String(market[key] ?? "");
  });
}

// Band (price + model) and name dirty-check separately so a Basics rename
// does not freeze US 4Runner dollars after Coverage changes country.
export function relocalizeMarketFields(markets, laneKey, prevCountry, nextCountry, readValue) {
  const prev = laneMarketFor(markets, laneKey, prevCountry);
  if (!prev) return null;

  const syncKeys = prev.sync_keys || DEFAULT_SYNC_KEYS;
  const bandKeys = syncKeys.filter((key) => key !== "name");
  if (!marketKeysMatch(readValue, prev, bandKeys)) return null;

  const nextMarket = laneMarketFor(markets, laneKey, nextCountry);
  if (!nextMarket) return null;

  const fields = laneMarketFields(nextMarket);
  if (!marketKeysMatch(readValue, prev, ["name"])) delete fields.name;
  return Object.keys(fields).length ? fields : null;
}

export function showLaneGroups(groups, category) {
  groups.forEach((group) => {
    const active = group.dataset.laneCategory === category;
    group.classList.toggle("hidden", !active);
    group.toggleAttribute("hidden", !active);
  });
}

export function markLaneButtons(buttons, key, category) {
  buttons.forEach((button) => {
    const on =
      button.dataset.laneKey === key &&
      button.closest("[data-lane-category]")?.dataset.laneCategory === category;
    button.classList.toggle("is-on", on);
  });
}

export function paintLaneCardTags(buttons, category, markets, country) {
  buttons.forEach((button) => {
    const group = button.closest("[data-lane-category]");
    if (group?.dataset.laneCategory !== category) return;

    const tags = laneMarketFor(markets, button.dataset.laneKey, country)?.tags;
    if (!Array.isArray(tags) || tags.length === 0) return;

    const wrap = button.querySelector(".lane__f");
    if (!wrap) return;

    wrap.replaceChildren(
      ...tags.map((tag) => {
        const span = document.createElement("span");
        span.className = "tag";
        span.textContent = tag;
        return span;
      }),
    );
  });
}

export function fillLaneFields(
  root,
  fields,
  { criteriaScope, nameInput, preserveName = false, onLocationMode, replaceChipTokens } = {},
) {
  const setField = (id, value) => {
    writeField(root, id, value, criteriaScope);
  };

  if (Object.prototype.hasOwnProperty.call(fields, "name")) {
    const keepName = preserveName && (nameInput?.value || "").trim();
    if (!keepName) setField("search_profile_name", fields.name);
  }
  if (Object.prototype.hasOwnProperty.call(fields, "location_mode")) {
    setField("search_profile_location_mode", fields.location_mode);
    onLocationMode?.();
  }
  if (Object.prototype.hasOwnProperty.call(fields, "radius_miles")) {
    setField("search_profile_radius_miles", fields.radius_miles);
  }
  if (Object.prototype.hasOwnProperty.call(fields, "price_min_dollars")) {
    setField("search_profile_price_min_dollars", fields.price_min_dollars);
  }
  if (Object.prototype.hasOwnProperty.call(fields, "price_max_dollars")) {
    setField("search_profile_price_max_dollars", fields.price_max_dollars);
  }

  CRITERIA_FIELD_KEYS.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(fields, key)) return;
    setField(`search_profile_${key}`, fields[key]);
  });

  // Make change must refresh model options before setting model.
  if (Object.prototype.hasOwnProperty.call(fields, "vehicle_make")) {
    findField(root, "search_profile_vehicle_make", criteriaScope)?.dispatchEvent(
      new Event("change", { bubbles: true }),
    );
    if (Object.prototype.hasOwnProperty.call(fields, "vehicle_model")) {
      setField("search_profile_vehicle_model", fields.vehicle_model);
    }
  }

  if (Object.prototype.hasOwnProperty.call(fields, "search_keywords")) {
    replaceChipTokens?.("search_profile_search_keywords", fields.search_keywords);
  }
  if (Object.prototype.hasOwnProperty.call(fields, "excludes_csv")) {
    replaceChipTokens?.("search_profile_excludes_csv", fields.excludes_csv);
  }
}
