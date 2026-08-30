import { Turbo } from "@hotwired/turbo-rails";

export const MATCH_DRAWER_FRAME = "match_drawer";
export const MATCH_SHEET_FRAME = "match_sheet";

/** Turbo Frame visit; avoids programmatic .click() missing data-turbo-frame. */
export function visitTurboFrame(link, frame) {
  if (!link?.href) return;
  Turbo.visit(link.href, { frame });
}

export function visitMatchDrawer(link) {
  visitTurboFrame(link, MATCH_DRAWER_FRAME);
}
