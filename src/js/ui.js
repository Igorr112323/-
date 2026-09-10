import { el } from "./util.js";
import { icon } from "./icons.js";

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
const dialogs = [];
let toastRootConfigured = false;

function ensureToastRoot() {
  const root = document.getElementById("toast-root");
  if (root && !toastRootConfigured) {
    toastRootConfigured = true;
    root.setAttribute("role", "status");
    root.setAttribute("aria-live", "polite");
  }
  return root;
}

export function showToast(message, type = "info") {
  const root = ensureToastRoot();
  if (!root) {
    return;
  }
  const iconName = type === "success" ? "checkCircle" : type === "error" ? "alert" : "info";
  const toast = el("div", { class: `toast toast-${type}` }, [
    icon(iconName, "nav-ico"),
    el("span", { class: "toast-text", text: message }),
    el("button", { class: "toast-close", type: "button", "aria-label": "Закрыть уведомление", onclick: () => remove() }, [icon("close", "nav-ico")])
  ]);
  let timer = null;
  const remove = () => {
    clearTimeout(timer);
    toast.classList.add("is-leaving");
    setTimeout(() => toast.remove(), 200);
  };
  timer = setTimeout(remove, 3200);
  root.appendChild(toast);
}

// Opens a modal dialog. Returns { close(result), onRequestClose }.
// If onRequestClose(handler) is set, overlay/Esc/X route through the handler first.
export function openDialog({ title, body, footer, size = "", dismissible = true, initialFocus = null }) {
  const root = document.getElementById("modal-root");
  const titleId = `dialog-title-${dialogs.length + 1}-${Date.now()}`;
  const overlay = el("div", { class: "w-dialog-overlay" });
  const card = el("div", {
    class: `w-dialog ${size ? `w-dialog--${size}` : "w-dialog--wide"}`,
    role: "dialog",
    "aria-modal": "true",
    "aria-labelledby": titleId
  });

  const head = el("div", { class: "w-dialog-head" }, [
    el("h2", { class: "w-dialog-title", id: titleId, text: title || "" }),
    dismissible
      ? el("button", { class: "w-btn w-btn--icon w-dialog-x", type: "button", "aria-label": "Закрыть", onclick: () => requestClose(null) }, [icon("close", "w-ico")])
      : null
  ]);
  if (title) {
    card.append(head);
  }

  const bodyNode = el("div", { class: "w-dialog-body" });
  if (typeof body === "string") {
    bodyNode.append(el("p", { class: "w-dialog-desc", text: body }));
  } else if (body) {
    bodyNode.append(body);
  }
  card.append(bodyNode);

  let actionsNode = null;
  if (Array.isArray(footer) && footer.length) {
    actionsNode = el("div", { class: "w-dialog-actions" });
    for (const button of footer) {
      actionsNode.append(button);
    }
    card.append(actionsNode);
  }
  overlay.append(card);

  let settle = null;
  let closed = false;
  let guard = null;
  const previousFocus = document.activeElement;

  function requestClose(result) {
    if (guard) {
      guard(result);
      return;
    }
    finish(result);
  }

  function getFocusable() {
    return Array.from(card.querySelectorAll(FOCUSABLE)).filter((node) => !node.disabled && node.offsetParent !== null);
  }

  function onKeyDown(event) {
    if (dialogs[dialogs.length - 1] !== record) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (dismissible) {
        requestClose(null);
      }
      return;
    }
    if (event.key === "Tab") {
      const items = getFocusable();
      if (items.length === 0) {
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  function finish(result) {
    if (closed) {
      return;
    }
    closed = true;
    const index = dialogs.indexOf(record);
    if (index >= 0) {
      dialogs.splice(index, 1);
    }
    document.removeEventListener("keydown", onKeyDown, true);
    overlay.classList.add("is-leaving");
    setTimeout(() => overlay.remove(), 160);
    if (previousFocus && previousFocus.focus) {
      previousFocus.focus();
    }
    if (settle) {
      settle(result);
    }
  }

  if (dismissible) {
    overlay.addEventListener("mousedown", (event) => {
      if (event.target === overlay && dialogs[dialogs.length - 1] === record) {
        requestClose(null);
      }
    });
  }

  const promise = new Promise((resolve) => {
    settle = resolve;
  });
  const record = { overlay, card, finish: () => finish(null) };
  dialogs.push(record);

  document.addEventListener("keydown", onKeyDown, true);
  root.append(overlay);

  const target = typeof initialFocus === "function" ? initialFocus() : initialFocus;
  const items = getFocusable();
  const focusTarget = target && items.includes(target) ? target : items[0];
  requestAnimationFrame(() => {
    if (focusTarget) {
      focusTarget.focus();
    }
  });

  return {
    close: finish,
    card,
    result: promise,
    // handler(result) decides whether the dialog may close (dirty-form guards).
    onRequestClose(handler) {
      guard = handler;
    }
  };
}

export function closeAllDialogs() {
  for (let index = dialogs.length - 1; index >= 0; index -= 1) {
    dialogs[index].finish();
  }
}

// Replaces the old callback API. Resolves true when the action was confirmed.
export function confirmDialog({ title, message, confirmLabel = "ОК", cancelLabel = "Отмена", danger = false }) {
  const cancelButton = el("button", { class: "w-btn w-btn--secondary", type: "button", text: cancelLabel });
  const confirmButton = el("button", { class: `w-btn ${danger ? "w-btn--danger" : "w-btn--primary"}`, type: "button", text: confirmLabel });
  const dialog = openDialog({
    title,
    body: message,
    footer: [cancelButton, confirmButton],
    size: "sm"
  });
  cancelButton.addEventListener("click", () => dialog.close(false));
  confirmButton.addEventListener("click", () => dialog.close(true));
  return dialog.result;
}
