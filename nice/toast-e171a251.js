// Framework-free toast stack API. Renders markup matching Ui::ToastComponent.

const MAX_VISIBLE = 3;
const DEDUPE_MS = 4000;
const EXIT_MS = 120;

const ICONS = {
  ok: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  err: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
  info: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,
  loading: `<span class="tst__spin"></span>`,
};

let seq = 0;
const entries = new Map(); // id -> entry
let root = null;
let collapseEl = null;

function ensureRoot() {
  if (root && document.contains(root)) return root;
  root = document.getElementById("toast_stack");
  if (!root) {
    root = document.createElement("div");
    root.id = "toast_stack";
    root.className = "tstack";
    root.setAttribute("role", "region");
    root.setAttribute("aria-label", "Notifications");
    root.setAttribute("aria-live", "polite");
    root.setAttribute("aria-atomic", "false");
    document.body.appendChild(root);
  }
  return root;
}

function typeClass(type) {
  if (type === "success" || type === "ok" || type === "notice") return "ok";
  if (type === "error" || type === "err" || type === "alert" || type === "danger") return "err";
  if (type === "loading") return "loading";
  return "info";
}

function defaultDuration(type, hasActions) {
  const t = typeClass(type);
  if (t === "loading" || t === "err") return 0;
  if (hasActions) return 8000;
  return 5000;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeHref(href) {
  if (href == null || href === "") return null;
  const s = String(href).trim();
  if (/^javascript:/i.test(s) || /^data:/i.test(s) || /^vbscript:/i.test(s)) return null;
  if (/^(https?:\/\/|\/|\.\/|\?|#)/i.test(s)) return s;
  // Relative app paths without a scheme
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) return s;
  return null;
}

function buildActionsHtml(actions) {
  if (!actions?.length) return "";
  const links = actions
    .map((a, i) => {
      const quiet = a.quiet ? " tst__link--quiet" : "";
      const href = safeHref(a.href);
      if (href) {
        return `<a href="${escapeHtml(href)}" class="tst__link${quiet}" data-turbo-frame="_top">${escapeHtml(a.label)}</a>`;
      }
      return `<button type="button" class="tst__link${quiet}" data-toast-action="${i}">${escapeHtml(a.label)}</button>`;
    })
    .join("");
  return `<div class="tst__acts">${links}</div>`;
}

function buildToastEl({ id, type, title, detail, detailMono, actions, duration }) {
  const t = typeClass(type);
  const role = t === "err" ? "alert" : "status";
  const icon = ICONS[t] || ICONS.info;
  const showProg = duration > 0;
  const el = document.createElement("div");
  el.className = `tst tst--${t}`;
  el.setAttribute("role", role);
  el.dataset.toastId = id;
  el.innerHTML = `
    <div class="tst__ico" aria-hidden="true">${icon}</div>
    <div class="tst__main">
      <div class="tst__title">${escapeHtml(title)}<span class="tst__count" hidden></span></div>
      ${
        detail
          ? `<div class="tst__sub${detailMono ? " tst__sub--mono" : ""}">${escapeHtml(detail)}</div>`
          : ""
      }
      ${buildActionsHtml(actions)}
    </div>
    <button type="button" class="tst__x" aria-label="Dismiss notification">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
    </button>
    ${showProg ? `<div class="tst__prog" aria-hidden="true"><i style="--tst-progress:1"></i></div>` : ""}
  `;
  return el;
}

function findDedupe(title, detail) {
  const key = `${title}\0${detail || ""}`;
  const now = Date.now();
  for (const entry of entries.values()) {
    if (entry.dedupeKey === key && now - entry.createdAt < DEDUPE_MS && !entry.leaving) {
      return entry;
    }
  }
  return null;
}

function bumpCount(entry) {
  entry.count = (entry.count || 1) + 1;
  const countEl = entry.el.querySelector(".tst__count");
  if (countEl) {
    countEl.hidden = false;
    countEl.textContent = `×${entry.count}`;
  }
  restartTimer(entry);
}

function interactionPaused(entry) {
  return (
    entry.el.matches(":hover") ||
    (document.activeElement && entry.el.contains(document.activeElement))
  );
}

function startTimer(entry) {
  if (!entry.duration || entry.duration <= 0) return;
  entry.remaining = entry.duration;
  entry.startedAt = Date.now();
  if (interactionPaused(entry)) {
    entry.paused = true;
    tickProgress(entry);
    return;
  }
  entry.paused = false;
  tickProgress(entry);
  entry.timerId = window.setTimeout(() => dismiss(entry.id), entry.remaining);
}

function pauseTimer(entry) {
  if (!entry.duration || entry.paused || entry.leaving) return;
  entry.paused = true;
  if (entry.timerId) {
    window.clearTimeout(entry.timerId);
    entry.timerId = null;
  }
  const elapsed = Date.now() - entry.startedAt;
  entry.remaining = Math.max(0, entry.remaining - elapsed);
  tickProgress(entry);
}

function resumeTimer(entry) {
  if (!entry.duration || !entry.paused || entry.leaving) return;
  entry.paused = false;
  entry.startedAt = Date.now();
  tickProgress(entry);
  entry.timerId = window.setTimeout(() => dismiss(entry.id), entry.remaining);
}

function tickProgress(entry) {
  const bar = entry.el.querySelector(".tst__prog > i");
  if (!bar || !entry.duration) return;
  const ratio = entry.remaining / entry.duration;
  bar.style.setProperty("--tst-progress", String(Math.max(0, Math.min(1, ratio))));
  if (!entry.paused && entry.remaining > 0) {
    bar.style.transition = `transform ${entry.remaining}ms linear`;
    requestAnimationFrame(() => {
      bar.style.setProperty("--tst-progress", "0");
    });
  } else {
    bar.style.transition = "none";
  }
}

function restartTimer(entry) {
  if (entry.timerId) {
    window.clearTimeout(entry.timerId);
    entry.timerId = null;
  }
  startTimer(entry);
}

function bindEntry(entry) {
  const { el, actions } = entry;
  el.querySelector(".tst__x")?.addEventListener("click", () => dismiss(entry.id));
  el.addEventListener("mouseenter", () => pauseTimer(entry));
  el.addEventListener("mouseleave", () => resumeTimer(entry));
  el.addEventListener("focusin", () => pauseTimer(entry));
  el.addEventListener("focusout", (e) => {
    if (!el.contains(e.relatedTarget)) resumeTimer(entry);
  });
  el.querySelectorAll("[data-toast-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.getAttribute("data-toast-action"));
      const action = actions?.[idx];
      if (action?.onClick) action.onClick();
    });
  });
}

function flip(before) {
  const stack = ensureRoot();
  const after = new Map();
  Array.from(stack.querySelectorAll(".tst")).forEach((el) => {
    after.set(el, el.getBoundingClientRect());
  });
  before.forEach((rect, el) => {
    const next = after.get(el);
    if (!next) return;
    const dx = rect.left - next.left;
    const dy = rect.top - next.top;
    if (!dx && !dy) return;
    el.style.transform = `translate(${dx}px, ${dy}px)`;
    el.style.transition = "none";
    requestAnimationFrame(() => {
      el.style.transition = "";
      el.style.transform = "";
    });
  });
}

function snapshotPositions() {
  const stack = ensureRoot();
  const map = new Map();
  Array.from(stack.querySelectorAll(".tst")).forEach((el) => {
    map.set(el, el.getBoundingClientRect());
  });
  return map;
}

function updateCollapse() {
  const stack = ensureRoot();
  const visible = Array.from(stack.querySelectorAll(".tst:not(.tst--leaving)"));
  const overflow = Math.max(0, visible.length - MAX_VISIBLE);
  visible.forEach((el, i) => {
    // column-reverse: last in DOM is visually top; hide oldest beyond max
    const ageIndex = visible.length - 1 - i;
    el.hidden = ageIndex >= MAX_VISIBLE;
  });

  if (!collapseEl) {
    collapseEl = document.createElement("div");
    collapseEl.className = "tstack__collapse";
    collapseEl.innerHTML = `
      <div class="tstack__stacked" aria-hidden="true"><i></i><i></i></div>
      <button type="button" class="tstack__clear"></button>
    `;
    collapseEl.querySelector(".tstack__clear").addEventListener("click", () => clearAll());
  }

  if (overflow > 0) {
    if (!collapseEl.isConnected) stack.insertBefore(collapseEl, stack.firstChild);
    collapseEl.querySelector(".tstack__clear").textContent = `+${overflow} earlier · Clear all`;
    collapseEl.hidden = false;
  } else if (collapseEl.isConnected) {
    collapseEl.hidden = true;
  }
}

function push(type, title, options = {}) {
  ensureRoot();
  const detail = options.detail || null;
  const actions = options.actions || [];
  const duration =
    options.duration != null ? options.duration : defaultDuration(type, actions.length > 0);

  const existing = findDedupe(title, detail);
  if (existing) {
    bumpCount(existing);
    return existing.handle;
  }

  const id = `tst-${++seq}`;
  const el = buildToastEl({
    id,
    type,
    title,
    detail,
    detailMono: !!options.detailMono,
    actions,
    duration,
  });

  const before = snapshotPositions();
  ensureRoot().appendChild(el);

  const entry = {
    id,
    el,
    type,
    title,
    detail,
    actions,
    duration,
    dedupeKey: `${title}\0${detail || ""}`,
    createdAt: Date.now(),
    count: 1,
    leaving: false,
    handle: null,
  };
  entry.handle = makeHandle(entry);
  entries.set(id, entry);
  bindEntry(entry);
  startTimer(entry);
  flip(before);
  updateCollapse();
  return entry.handle;
}

function makeHandle(entry) {
  return {
    id: entry.id,
    update(patch = {}) {
      if (patch.detail != null) {
        entry.detail = patch.detail;
        let sub = entry.el.querySelector(".tst__sub");
        if (!sub) {
          sub = document.createElement("div");
          sub.className = "tst__sub";
          entry.el.querySelector(".tst__main .tst__title")?.after(sub);
        }
        sub.textContent = patch.detail;
      }
      if (patch.title != null) {
        entry.title = patch.title;
        const titleEl = entry.el.querySelector(".tst__title");
        if (titleEl) {
          const count = titleEl.querySelector(".tst__count");
          titleEl.textContent = patch.title;
          if (count) titleEl.appendChild(count);
        }
      }
    },
    resolve({ type = "success", title, detail } = {}) {
      const t = typeClass(type);
      entry.el.className = `tst tst--${t}`;
      entry.el.setAttribute("role", t === "err" ? "alert" : "status");
      const ico = entry.el.querySelector(".tst__ico");
      if (ico) ico.innerHTML = ICONS[t] || ICONS.info;
      if (title) entry.handle.update({ title });
      if (detail != null) entry.handle.update({ detail });
      entry.duration = defaultDuration(type, false);
      if (entry.timerId) window.clearTimeout(entry.timerId);
      // re-add progress if needed
      if (entry.duration > 0 && !entry.el.querySelector(".tst__prog")) {
        const prog = document.createElement("div");
        prog.className = "tst__prog";
        prog.innerHTML = "<i></i>";
        entry.el.appendChild(prog);
      }
      startTimer(entry);
    },
    dismiss() {
      dismiss(entry.id);
    },
  };
}

function dismiss(id) {
  const entry = entries.get(id);
  if (!entry || entry.leaving) return;
  entry.leaving = true;
  if (entry.timerId) window.clearTimeout(entry.timerId);
  const before = snapshotPositions();
  entry.el.classList.add("tst--leaving");
  window.setTimeout(() => {
    entry.el.remove();
    entries.delete(id);
    flip(before);
    updateCollapse();
  }, EXIT_MS);
}

function clearAll() {
  Array.from(entries.keys()).forEach((id) => dismiss(id));
}

function adoptServerToast(el) {
  if (!el || el.dataset.toastManaged === "1") return;
  el.dataset.toastManaged = "1";
  const id = el.dataset.toastId || `tst-${++seq}`;
  el.dataset.toastId = id;
  const title =
    el.dataset.toastTitleValue ||
    el.querySelector(".tst__title")?.childNodes[0]?.textContent?.trim() ||
    "";
  const detail = el.dataset.toastDetailValue || el.querySelector(".tst__sub")?.textContent || "";
  const duration = Number(el.dataset.toastDismissAfterValue || 0);
  const type = el.classList.contains("tst--err")
    ? "error"
    : el.classList.contains("tst--loading")
      ? "loading"
      : el.classList.contains("tst--info")
        ? "info"
        : "success";

  const existing = findDedupe(title, detail);
  if (existing && existing.el !== el) {
    bumpCount(existing);
    el.remove();
    return;
  }

  const entry = {
    id,
    el,
    type,
    title,
    detail,
    actions: [],
    duration,
    dedupeKey: `${title}\0${detail || ""}`,
    createdAt: Date.now(),
    count: 1,
    leaving: false,
    handle: null,
  };
  entry.handle = makeHandle(entry);
  entries.set(id, entry);
  bindEntry(entry);
  startTimer(entry);
  updateCollapse();
}

function dismissRef(idOrHandle) {
  const id = typeof idOrHandle === "string" ? idOrHandle : idOrHandle?.id;
  if (id) dismiss(id);
}

export const toast = {
  // All variants return a handle ({ id, update, resolve, dismiss }).
  success(title, options) {
    return push("success", title, options);
  },
  error(title, options) {
    return push("error", title, options);
  },
  info(title, options) {
    return push("info", title, options);
  },
  loading(title, options) {
    return push("loading", title, options);
  },
  dismiss: dismissRef,
  clearAll,
  adoptServerToast,
  mount(el) {
    root = el;
    el.querySelectorAll(".tst").forEach((node) => adoptServerToast(node));
  },
};
