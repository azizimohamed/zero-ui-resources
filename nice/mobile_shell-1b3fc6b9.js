/**
 * Mobile shell signals for dashboard Turbo UX and drawer behavior.
 * Pixel breakpoint matches design tokens: `--bp-sm` in `app/assets/stylesheets/tokens.css`.
 */
export const MOBILE_BP_SM_PX = 640;

const mqMaxWidthSm = () => window.matchMedia(`(max-width: ${MOBILE_BP_SM_PX - 1}px)`);
const mqCoarsePointer = () => window.matchMedia("(hover: none)");

/** True when viewport is below `--bp-sm` and primary input is touch-like (coarse / no hover). */
export function mobileDriveSurface() {
  return mqMaxWidthSm().matches && mqCoarsePointer().matches;
}

export function onMobileShellSignalsChange(handler) {
  mqMaxWidthSm().addEventListener("change", handler);
  mqCoarsePointer().addEventListener("change", handler);
}
