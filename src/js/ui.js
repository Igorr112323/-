import { el, svgIcon } from "./util.js";

export function showToast(message, type = "info") {
  const root = document.getElementById("toast-root");
  const iconPath = type === "success" ? "M5 12l4 4 10-10" : type === "error" ? "M6 6l12 12M18 6L6 18" : "M12 6v6m0 4h.01";
  const toast = el("div", { class: `toast ${type === 'error' ? 'toast-error' : ''}` }, [
    el("svg", { class: "nav-ico" }),
    el("span", { text: message })
  ]);
  toast.querySelector("svg").innerHTML = `<path d="${iconPath}" stroke="currentColor" stroke-width="2" fill="none" />`;
  root.appendChild(toast);
  const remove = () => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); };
  const timer = setTimeout(remove, 3000);
  toast.addEventListener("click", () => { clearTimeout(timer); remove(); });
}

export function openModal({ title, body, footer, small = false }) {
  const root = document.getElementById("modal-root");
  const overlay = el("div", { class: "modal-overlay" });
  const card = el("div", { class: "modal-card" });
  if (title) card.appendChild(el("h2", { class: "modal-title", text: title }));
  if (body) {
    if (typeof body === "string") card.appendChild(el("p", { class: "modal-desc", text: body }));
    else card.appendChild(body);
  }
  if (footer) {
    const actions = el("div", { class: "modal-actions" });
    footer.forEach(btn => actions.appendChild(btn));
    card.appendChild(actions);
  }
  overlay.appendChild(card);
  root.appendChild(overlay);
  return () => { overlay.style.opacity = '0'; setTimeout(() => overlay.remove(), 200); };
}

export function confirmDialog(title, desc, confirmText, onConfirm, isDanger = false) {
  let close = null;
  const btnCancel = el("button", { class: "btn-secondary", text: "Отмена", on: { click: () => close() } });
  const btnOk = el("button", { class: "btn-primary", style: isDanger ? "background: var(--color-risk-high)" : "", text: confirmText, on: { click: () => { close(); onConfirm(); } } });
  close = openModal({ title, body: desc, footer: [btnCancel, btnOk] });
}