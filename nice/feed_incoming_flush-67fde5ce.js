/** Move deferred realtime inserts from the buffer into #matches_grid. */

/** Cards flushed per animation frame during live streaming (keeps the tab interactive). */
export const LIVE_FLUSH_CHUNK_SIZE = 3;

/** Flush up to `limit` buffered wrappers; returns how many remain. */
export function flushIncomingBufferChunk(buffer, grid, limit = LIVE_FLUSH_CHUNK_SIZE) {
  if (!buffer || !grid) return 0;

  let remaining = Math.max(0, limit);
  while (remaining > 0 && buffer.firstElementChild) {
    insertRealtimeWrapper(buffer.firstElementChild, grid);
    remaining -= 1;
  }
  return buffer.children.length;
}

export function insertRealtimeWrapper(wrapper, grid) {
  const bucket = wrapper.dataset.feedBucketInsertBucketValue;
  if (!bucket) {
    wrapper.remove();
    return;
  }

  const matchRef = wrapper.querySelector("[data-match-ref]")?.dataset?.matchRef;
  if (matchRef && grid.querySelector(`[data-match-ref="${CSS.escape(matchRef)}"]`)) {
    wrapper.remove();
    return;
  }

  const headerId = `matches_feed_bucket_${bucket}`;
  const innerHeader = wrapper.querySelector(`#${CSS.escape(headerId)}`);
  const gridHeader = grid.querySelector(`#${CSS.escape(headerId)}`);

  if (gridHeader) {
    innerHeader?.remove();
    const anchor = firstCardInBucket(grid, bucket) || gridHeader.nextElementSibling;
    while (wrapper.firstElementChild) {
      const node = wrapper.firstElementChild;
      if (anchor && anchor.parentElement === grid) {
        grid.insertBefore(node, anchor);
      } else {
        gridHeader.insertAdjacentElement("afterend", node);
      }
    }
    wrapper.remove();
    return;
  }

  grid.insertBefore(wrapper, grid.firstChild);
}

export function firstCardInBucket(grid, bucket) {
  const header = grid.querySelector(`#${CSS.escape(`matches_feed_bucket_${bucket}`)}`);
  if (!header) return null;

  let node = header.nextElementSibling;
  while (node) {
    if (node.dataset?.feedBucketHeader) break;
    if (node.querySelector?.("[data-swipe-actions-target='card']")) return node;
    if (node.matches?.("[data-controller*='swipe-actions']")) return node;
    node = node.nextElementSibling;
  }
  return null;
}

export function previewTextFromWrapper(wrapper, totalCount) {
  const card = wrapper?.querySelector("[data-swipe-actions-target='card']");
  const title = card?.querySelector(".m-card__title")?.textContent?.trim();
  const price = card?.querySelector(".num")?.textContent?.trim();

  if (!title) return totalCount > 1 ? `${totalCount - 1} more` : "";

  const lead = [title, price].filter(Boolean).join(" · ");
  return totalCount > 1 ? `${lead} and ${totalCount - 1} more` : lead;
}
