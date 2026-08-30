// Shared read/write for monitor wizard fields (inputs + search_profile radio groups).

export function searchProfileFieldName(id) {
  const match = id.match(/^search_profile_(.+)$/);
  return match ? `search_profile[${match[1]}]` : null;
}

export function findField(root, id, scope = null) {
  const scoped = scope?.querySelector(`#${CSS.escape(id)}`);
  if (scoped) return scoped;
  return root.querySelector(`#${CSS.escape(id)}`);
}

export function findRadioField(root, id, value, scope = null) {
  const name = searchProfileFieldName(id);
  if (!name) return null;

  const next = String(value);
  const searchRoot = scope || root;
  return (
    searchRoot.querySelector(
      `input[type="radio"][name="${CSS.escape(name)}"][value="${CSS.escape(next)}"]`,
    ) ||
    root.querySelector(
      `input[type="radio"][name="${CSS.escape(name)}"][value="${CSS.escape(next)}"]`,
    )
  );
}

export function readField(root, id, scope = null) {
  const el = findField(root, id, scope);
  if (el) return el.value?.trim();

  const name = searchProfileFieldName(id);
  if (!name) return undefined;

  const searchRoot = scope || root;
  const checked =
    searchRoot.querySelector(`input[type="radio"][name="${CSS.escape(name)}"]:checked`) ||
    root.querySelector(`input[type="radio"][name="${CSS.escape(name)}"]:checked`);
  return checked?.value?.trim();
}

export function writeField(root, id, value, scope = null) {
  const next = value == null ? "" : String(value);
  const radio = findRadioField(root, id, next, scope);
  if (radio) {
    if (!radio.checked) {
      radio.checked = true;
      radio.dispatchEvent(new Event("input", { bubbles: true }));
      radio.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return true;
  }

  const el = findField(root, id, scope);
  if (!el || el.value === next) return false;
  el.value = next;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}
