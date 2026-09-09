import { el, svgIcon, addMonths, sameDay, WEEKDAYS_SHORT, MONTHS_NOM, formatFullDate } from "./util.js";

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

  const minYear = min.getFullYear();
  const maxYear = max.getFullYear();

  const monthSelect = el("select", { class: "cal-select", "aria-label": "Месяц" });
  for (let month = 0; month < 12; month += 1) {
    monthSelect.append(el("option", { value: String(month), text: MONTHS_NOM[month] }));
  }

  const yearSelect = el("select", { class: "cal-select", "aria-label": "Год" });
  for (let year = minYear; year <= maxYear + 1; year += 1) {
    yearSelect.append(el("option", { value: String(year), text: String(year) }));
  }

  const shift = (step) => {
    const target = new Date(viewDate.getFullYear(), viewDate.getMonth() + step, 1);
    const lower = new Date(minYear, 0, 1);
    const upper = new Date(maxYear + 1, 11, 1);
    if (target < lower) {
      target.setTime(lower.getTime());
    }
    if (target > upper) {
      target.setTime(upper.getTime());
    }
    viewDate = target;
    render();
  };

  const navButton = (step, path, title) =>
    el(
      "button",
      { class: "calendar-nav", type: "button", title, onclick: () => shift(step) },
      [svgIcon(path)]
    );

  const head = el("div", { class: "calendar-head" }, [
    navButton(-12, "M11 19l-6-7 6-7M19 19l-6-7 6-7", "Предыдущий год"),
    navButton(-1, "M15 18l-6-6 6-6", "Предыдущий месяц"),
    el("div", { class: "calendar-selects" }, [monthSelect, yearSelect]),
    navButton(1, "M9 6l6 6-6 6", "Следующий месяц"),
    navButton(12, "M5 5l6 7-6 7M13 5l6 7-6 7", "Следующий год")
  ]);

  const grid = el("div", { class: "calendar-grid" });

  const root = el("div", { class: "calendar" }, [head]);
  for (const dow of WEEKDAYS_SHORT) {
    root.append(el("div", { class: "calendar-dow", text: dow }));
  }
  root.append(grid);

  monthSelect.addEventListener("change", () => {
    viewDate = new Date(viewDate.getFullYear(), Number(monthSelect.value), 1);
    render();
  });

  yearSelect.addEventListener("change", () => {
    viewDate = new Date(Number(yearSelect.value), viewDate.getMonth(), 1);
    render();
  });

  function render() {
    monthSelect.value = String(viewDate.getMonth());
    yearSelect.value = String(viewDate.getFullYear());
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
