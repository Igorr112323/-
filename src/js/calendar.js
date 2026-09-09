import { el, svgIcon, sameDay, WEEKDAYS_SHORT, MONTHS_NOM, formatFullDate } from "./util.js";

export function computeForecastRange(today, rangeMonths) {
  const min = new Date(today);
  min.setHours(0, 0, 0, 0);
  const max = addMonths(min, rangeMonths);
  max.setHours(23, 59, 59, 999);
  return { min, max };
}

export function createCalendar({ min, max, selected, onSelect }) {
  let viewDate = new Date(selected.getFullYear(), selected.getMonth(), 1);
  let currentSelected = new Date(selected);

  const title = el("span", { class: "calendar-title", text: "" });
  const grid = el("div", { class: "calendar-grid" });

  const head = el("div", { class: "calendar-head" }, [
    el(
      "button",
      {
        class: "calendar-nav",
        type: "button",
        title: "Предыдущий месяц",
        onclick: () => {
          viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
          render();
        }
      },
      [svgIcon("M15 18l-6-6 6-6")]
    ),
    title,
    el(
      "button",
      {
        class: "calendar-nav",
        type: "button",
        title: "Следующий месяц",
        onclick: () => {
          viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1);
          render();
        }
      },
      [svgIcon("M9 6l6 6-6 6")]
    )
  ]);

  const root = el("div", { class: "calendar" }, [head]);

  for (const dow of WEEKDAYS_SHORT) {
    root.append(el("div", { class: "calendar-dow", text: dow }));
  }
  root.append(grid);

  function render() {
    title.textContent = `${MONTHS_NOM[viewDate.getMonth()]} ${viewDate.getFullYear()}`;
    grid.replaceChildren();

    const firstDay = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
    const startOffset = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();

    for (let slot = 0; slot < startOffset; slot += 1) {
      grid.append(el("span", { class: "calendar-day", "aria-hidden": "true" }));
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
      const disabled = date < min || date > max;
      const isToday = sameDay(date, new Date());
      const isSelected = sameDay(date, currentSelected);
      const cell = el(
        "button",
        {
          class: ["calendar-day", disabled ? "is-disabled" : "", isToday ? "is-today" : "", isSelected ? "is-selected" : ""].filter(Boolean).join(" "),
          type: "button",
          text: String(day),
          disabled: disabled ? "true" : null,
          title: disabled ? "" : formatFullDate(date)
        }
      );
      if (!disabled) {
        cell.addEventListener("click", () => {
          currentSelected = date;
          onSelect(new Date(date));
          render();
        });
      }
      grid.append(cell);
    }
  }

  render();
  return root;
}
