import { el, svgIcon, addMonths } from "./util.js";

const MONTHS_SHORT = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];

export function computeForecastRange(today, rangeMonths) {
  const min = new Date(1990, 0, 1);
  const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const last = addMonths(currentMonthStart, rangeMonths);
  const max = new Date(last.getFullYear(), last.getMonth() + 1, 0);
  return { min, max };
}

export function createCalendar({ min, max, selected, onSelect }) {
  const minYear = min.getFullYear();
  const maxYear = max.getFullYear();
  const selYear = selected.getFullYear();
  const selMonth = selected.getMonth();
  const todayYear = new Date().getFullYear();
  const todayMonth = new Date().getMonth();

  let viewYear = selYear;

  const yearSelect = el("select", { class: "cal-select", "aria-label": "Год" });
  for (let year = minYear; year <= maxYear; year += 1) {
    yearSelect.append(el("option", { value: String(year), text: String(year) }));
  }

  const monthGrid = el("div", { class: "month-grid" });
  const root = el("div", { class: "calendar" });

  const navButton = (step, path, title) =>
    el(
      "button",
      { class: "calendar-nav", type: "button", title, onclick: () => shiftYear(step) },
      [svgIcon(path)]
    );

  const head = el("div", { class: "calendar-head" }, [
    navButton(-1, "M15 18l-6-6 6-6", "Предыдущий год"),
    el("div", { class: "calendar-selects" }, [yearSelect]),
    navButton(1, "M9 6l6 6-6 6", "Следующий год")
  ]);

  root.append(head, monthGrid);

  const endOfMonth = (year, month) => new Date(year, month + 1, 0);

  function shiftYear(step) {
    viewYear = Math.min(maxYear, Math.max(minYear, viewYear + step));
    render();
  }

  yearSelect.addEventListener("change", () => {
    viewYear = Number(yearSelect.value);
    render();
  });

  function render() {
    yearSelect.value = String(viewYear);
    monthGrid.replaceChildren();

    for (let month = 0; month < 12; month += 1) {
      const eom = endOfMonth(viewYear, month);
      const disabled = eom < min || eom > max;
      const isToday = viewYear === todayYear && month === todayMonth;
      const isSelected = viewYear === selYear && month === selMonth;
      const cell = el(
        "button",
        {
          class: ["month-cell", disabled ? "is-disabled" : "", isToday ? "is-today" : "", isSelected ? "is-selected" : ""].filter(Boolean).join(" "),
          type: "button",
          text: MONTHS_SHORT[month],
          disabled: disabled ? "true" : null
        }
      );
      if (!disabled) {
        cell.addEventListener("click", () => onSelect(eom));
      }
      monthGrid.append(cell);
    }
  }

  render();
  return root;
}
