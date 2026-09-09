import { el, svgIcon } from "./util.js";

const STEPS = [
  "Подключение к метеосерверу",
  "Скачивание температуры воздуха",
  "Скачивание данных об осадках",
  "Скачивание влажности почвы",
  "Скачивание данных о ветре",
  "Построение модели прогноза"
];

const DURATION = 1500;

function easeInOutCubic(value) {
  return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function buildStepElement(label, index) {
  const icon = el("span", { class: "step-ico" });
  const text = el("span", { class: "step-text", text: label });
  const item = el("li", { class: "load-step", dataset: { index: String(index) } }, [icon, text]);
  return item;
}

export function runLoading({ title = "Загрузка погодных данных" } = {}) {
  const overlay = document.getElementById("loading-overlay");
  const fill = document.getElementById("load-fill");
  const percent = document.getElementById("load-percent");
  const stepsBox = document.getElementById("load-steps");
  const titleNode = document.getElementById("load-title");

  const stepItems = STEPS.map((label, index) => buildStepElement(label, index));
  stepsBox.replaceChildren(...stepItems);
  titleNode.textContent = title;
  fill.style.width = "0%";
  percent.textContent = "0%";
  overlay.classList.remove("hidden");

  const startedAt = Date.now();

  function update(progress) {
    const clamped = Math.min(1, Math.max(0, progress));
    fill.style.width = `${Math.round(clamped * 100)}%`;
    percent.textContent = `${Math.round(clamped * 100)}%`;

    const stepsDone = clamped >= 1 ? STEPS.length : Math.floor(clamped * STEPS.length);
    stepItems.forEach((item, index) => {
      const icon = item.querySelector(".step-ico");
      if (index < stepsDone) {
        item.classList.add("is-done");
        item.classList.remove("is-active");
        icon.replaceChildren(svgIcon("M5 12l4 4 10-10"));
      } else if (index === stepsDone) {
        item.classList.add("is-active");
        item.classList.remove("is-done");
        icon.replaceChildren(el("span", { class: "spinner-mini" }));
      } else {
        item.classList.remove("is-active", "is-done");
        icon.replaceChildren();
      }
    });
  }

  return new Promise((resolve) => {
    function frame() {
      const elapsed = Date.now() - startedAt;
      const progress = easeInOutCubic(elapsed / DURATION);
      update(progress);
      if (elapsed >= DURATION) {
        update(1);
        titleNode.textContent = "Прогноз сформирован";
        setTimeout(() => {
          overlay.classList.add("hidden");
          resolve();
        }, 240);
        return;
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
}
