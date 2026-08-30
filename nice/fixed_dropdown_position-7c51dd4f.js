/**
 * Places a dropdown `list` element with position:fixed below or above an anchor,
 * reusing the same flip + max-height logic as combobox / city catalog pickers.
 *
 * The list is moved under `document.body` while positioned so it is not clipped by
 * `overflow: auto|hidden` ancestors (e.g. #turbo-main-pane) and paints in viewport space.
 * Call `restoreDropdownListPortal(list)` when closing the dropdown.
 *
 * Anchor rects from `getBoundingClientRect()` are visual-viewport relative. On mobile
 * (especially iOS with the soft keyboard) `position: fixed` is laid out in the layout
 * viewport, so we add `visualViewport.offsetTop/Left` and size against `visualViewport`
 * height/width. Without that, open lists jump to the top of the screen when the
 * keyboard opens.
 */

const DROPDOWN_PORTAL_SLOT = "__crawlbenchDropdownPortalSlot";

export function attachDropdownListToBody(list) {
  if (list.parentNode === document.body) return;
  list[DROPDOWN_PORTAL_SLOT] = {
    parent: list.parentNode,
    next: list.nextSibling,
  };
  document.body.appendChild(list);
}

export function restoreDropdownListPortal(list) {
  const slot = list[DROPDOWN_PORTAL_SLOT];
  if (!slot) return;
  const { parent, next } = slot;
  delete list[DROPDOWN_PORTAL_SLOT];
  if (next && next.parentNode === parent) parent.insertBefore(list, next);
  else parent.appendChild(list);
}

/** Layout-viewport metrics + visual-viewport offsets for fixed positioning. */
export function visualLayout() {
  const vv = window.visualViewport;
  if (!vv) {
    return {
      offsetTop: 0,
      offsetLeft: 0,
      height: window.innerHeight,
      width: window.innerWidth,
      layoutHeight: window.innerHeight,
    };
  }
  return {
    offsetTop: vv.offsetTop,
    offsetLeft: vv.offsetLeft,
    height: vv.height,
    width: vv.width,
    layoutHeight: window.innerHeight,
  };
}

function clampFixedLeft(anchorRect, width, margin, offsetLeft, vpWidth) {
  return Math.max(
    margin + offsetLeft,
    Math.min(anchorRect.right - width + offsetLeft, offsetLeft + vpWidth - width - margin),
  );
}

/**
 * @param {DOMRectReadOnly} anchorRect
 * @param {HTMLElement} list
 * @param {{
 *   preferredMaxHeight?: number,
 *   gap?: number,
 *   margin?: number,
 *   align?: "left" | "right",
 *   width?: number,
 *   zIndex?: string,
 * }} [opts]
 *   `align: "right"` pins the menu's right edge to the anchor's right edge.
 *   `width` defaults to the anchor width; pass an explicit px width for compact menus.
 */
export function positionFixedDropdown(anchorRect, list, opts = {}) {
  attachDropdownListToBody(list);

  const gap = opts.gap ?? 4;
  const margin = opts.margin ?? 8;
  const preferred = opts.preferredMaxHeight ?? 240;
  const align = opts.align === "right" ? "right" : "left";
  const width = typeof opts.width === "number" ? opts.width : anchorRect.width;
  const { offsetTop, offsetLeft, height: vpHeight, width: vpWidth, layoutHeight } = visualLayout();

  const spaceBelow = vpHeight - anchorRect.bottom - margin;
  const spaceAbove = anchorRect.top - margin;
  const openDown = spaceBelow >= Math.min(preferred, 100) || spaceBelow >= spaceAbove;

  list.style.position = "fixed";
  list.style.width = `${width}px`;
  list.style.right = "auto";
  list.style.margin = "0";

  if (align === "right") {
    list.style.left = `${clampFixedLeft(anchorRect, width, margin, offsetLeft, vpWidth)}px`;
  } else {
    list.style.left = `${anchorRect.left + offsetLeft}px`;
  }

  if (opts.zIndex != null) list.style.zIndex = opts.zIndex;

  if (openDown) {
    list.style.top = `${anchorRect.bottom + gap + offsetTop}px`;
    list.style.bottom = "auto";
    list.style.maxHeight = `${Math.min(preferred, Math.max(spaceBelow, 0))}px`;
  } else {
    // `bottom` is from the layout viewport's bottom edge.
    list.style.top = "auto";
    list.style.bottom = `${layoutHeight - offsetTop - anchorRect.top + gap}px`;
    list.style.maxHeight = `${Math.min(preferred, Math.max(spaceAbove, 0))}px`;
  }
}

/** Fixed dropdown aligned to the anchor's right edge (topbar menus, notification bell). */
export function positionFixedDropdownRightAligned(anchorRect, list, opts = {}) {
  attachDropdownListToBody(list);

  const gap = opts.gap ?? 8;
  const margin = opts.margin ?? 8;
  const width = opts.width ?? 320;
  const mobile = window.matchMedia("(max-width: 639px)").matches;
  const { offsetTop, offsetLeft, height: vpHeight, width: vpWidth } = visualLayout();

  list.style.position = "fixed";
  list.style.margin = "0";
  list.style.zIndex = opts.zIndex ?? "70";

  const top = offsetTop + Math.max(anchorRect.bottom + gap, margin);
  list.style.top = `${top}px`;
  list.style.bottom = "auto";
  const visibleBottom = offsetTop + vpHeight;
  list.style.maxHeight = opts.maxHeight ?? `${Math.max(visibleBottom - top - margin, 80)}px`;

  if (mobile) {
    list.style.left = `${margin + offsetLeft}px`;
    list.style.right = "auto";
    list.style.width = `${Math.max(vpWidth - 2 * margin, 0)}px`;
    return;
  }

  list.style.left = `${clampFixedLeft(anchorRect, width, margin, offsetLeft, vpWidth)}px`;
  list.style.right = "auto";
  list.style.width = `${width}px`;
}

export const FIXED_DROPDOWN_INLINE_PROPS = [
  "position",
  "top",
  "bottom",
  "left",
  "right",
  "width",
  "maxHeight",
  "margin",
  "zIndex",
];

export function clearFixedDropdownStyles(list) {
  FIXED_DROPDOWN_INLINE_PROPS.forEach((prop) => {
    list.style[prop] = "";
  });
}
