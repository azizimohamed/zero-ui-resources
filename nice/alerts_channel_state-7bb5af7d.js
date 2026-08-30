export function rowResolvedEnabled(row) {
  if (!row || row.dataset.connected !== "true") return false;

  const preference = row.dataset.preference || "inherit";
  const defaultEnabled = row.dataset.defaultEnabled === "true";
  return preference === "on" || (preference === "inherit" && defaultEnabled);
}

export function rowWantsConnect(row) {
  if (!row || row.dataset.connected !== "false") return false;

  const preference = row.dataset.preference || "inherit";
  if (preference === "off") return false;

  const defaultEnabled = row.dataset.defaultEnabled === "true";
  return preference === "on" || (preference === "inherit" && defaultEnabled);
}
