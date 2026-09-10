import { el } from "./util.js";

const STEPS = [
  "Загрузка исторических данных",
  "Расчёт суммы активных температур",
  "Оценка гидротермического коэффициента",
  "Моделирование потенциала урожайности"
];

const DURATION = 1500;

function easeInOutCubic(value) {
  return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

export function runLoading({ title = "Формируем прогноз" } = {}) {
  const overlay = document.getElementById("loading-overlay");
  const fill = document.getElementById("load-fill");
  const stepsBox = document.getElementById("load-steps");
  const titleNode = document.getElementById("load-title");

  const stepItems = STEPS.map((label) => el("li", { text: label }));
  stepsBox.replaceChildren(...stepItems);
  titleNode.textContent = title;
  fill.style.width = "0%";
  overlay.classList.remove("hidden");

  const startedAt = Date.now();

  function update(progress) {
    const clamped = Math.min(1, Math.max(0, progress));
    fill.style.width = `${Math.round(clamped * 100)}%`;

    const stepsDone = clamped >= 1 ? STEPS.length : Math.floor(clamped * STEPS.length);
    stepItems.forEach((item, index) => {
      if (index < stepsDone) {
        item.classList.add("is-done");
      } else {
        item.classList.remove("is-done");
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
        titleNode.textContent = "Готово";
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