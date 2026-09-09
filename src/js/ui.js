import { el, svgIcon } from "./util.js";

export function showToast(message, type = "info") {
  const root = document.getElementById("toast-root");
  const iconPath = type === "success" ? "M5 12l4 4 10-10" : type === "error" ? "M6 6l12 12M18 6L6 18" : "M12 6v6m0 4h.01";
  const toast = el("div", { class: `toast ${type}` }, [el("span", { class: "toast-ico" }, [svgIcon(iconPath)]), el("span", { text: message })]);
  root.append(toast);
  const remove = () => {
    toast.classList.add("is-leaving");
    setTimeout(() => toast.remove(), 320);
  };
  const timer = setTimeout(remove, 3400);
  toast.addEventListener("click", () => {
    clearTimeout(timer);
    remove();
  });
}

export function openModal({ title, body, footer, small = false }) {
  const root = document.getElementById("modal-root");
  const backdrop = el("div", { class: "modal-backdrop" });
  const closeButton = el(
    "button",
    { class: "modal-close", type: "button", title: "Закрыть" },
    [svgIcon("M6 6l12 12M18 6L6 18")]
  );

  const modal = el("div", { class: `modal${small ? " small" : ""}` }, [
    el("div", { class: "modal-head" }, [el("h3", { class: "modal-title", text: title }), closeButton])
  ]);
  if (body) {
    modal.append(body);
  }
  if (footer) {
    modal.append(footer);
  }

  const container = el("div", { class: "modal-root" }, [backdrop, modal]);
  root.append(container);

  let closed = false;
  const close = () => {
    if (closed) {
      return;
    }
    closed = true;
    container.remove();
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (event) => {
    if (event.key === "Escape") {
      close();
    }
  };
  closeButton.addEventListener("click", close);
  backdrop.addEventListener("click", close);
  document.addEventListener("keydown", onKey);

  return { close, modal };
}

export function confirmDialog({ title, message, confirmLabel = "Удалить", cancelLabel = "Отмена" }) {
  return new Promise((resolve) => {
    const body = el("p", { class: "confirm-text", text: message });
    const cancelButton = el("button", { class: "btn-ghost", type: "button", text: cancelLabel });
    const okButton = el(
      "button",
      {
        class: "btn-primary",
        type: "button",
        style: "width:auto; background:linear-gradient(180deg,#ff7b7b,#e04444); box-shadow:0 10px 26px rgba(224,68,68,0.34), inset 0 1px 0 rgba(255,255,255,0.4); color:#fff"
      },
      [el("span", { text: confirmLabel })]
    );
    const footer = el("div", { class: "form-actions" }, [cancelButton, okButton]);
    const modal = openModal({ title, body, footer, small: true });
    cancelButton.addEventListener("click", () => {
      modal.close();
      resolve(false);
    });
    okButton.addEventListener("click", () => {
      modal.close();
      resolve(true);
    });
  });
}
