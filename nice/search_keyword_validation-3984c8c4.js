import { SEARCH_KEYWORD_MAX, SEARCH_KEYWORD_MAX_WORDS, searchKeywordTokens } from "wizard/criteria";

const PHRASE_TOO_LONG_PLACEHOLDER = "%{keyword}";

export function searchKeywordValidationMessage(csv, messages = {}) {
  const tokens = searchKeywordTokens(csv);
  if (tokens.length > SEARCH_KEYWORD_MAX) {
    return messages.tooMany || `Use at most ${SEARCH_KEYWORD_MAX} search keywords.`;
  }

  const long = tokens.find((token) => token.split(/\s+/).length > SEARCH_KEYWORD_MAX_WORDS);
  if (!long) return "";

  const template =
    messages.phraseTooLong ||
    `"${PHRASE_TOO_LONG_PLACEHOLDER}" is too long for one keyword. A keyword only matches when every word appears in the listing title. Split it into separate keywords.`;
  return template.replace(PHRASE_TOO_LONG_PLACEHOLDER, long);
}

export function applyChipInputValidity(hidden, message) {
  if (!hidden) return null;

  const validity = message || "";
  hidden.setCustomValidity(validity);
  const entry = hidden
    .closest('[data-controller~="chip-input"]')
    ?.querySelector("[data-chip-input-target='input']");
  if (entry) entry.setCustomValidity(validity);
  return entry || hidden;
}
