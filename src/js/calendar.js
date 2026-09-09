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

  let viewYear = selYear;

  const titleNode = el("span", { class: "cal-title" });
  const monthGrid = el("div", { class: "cal-grid" });
  const root = el("div", { class: "calendar" });

  const btnPrev = el("button", { class: "cal-btn", type: "button", onclick: () => shiftYear(-1) }, [svgIcon("M15 18l-6-6 6-6")]);
  const btnNext = el("button", { class: "cal-btn", type: "button", onclick: () => shiftYear(1) }, [svgIcon("M9 6l6 6-6 6")]);

  const head = el("div", { class: "cal-head" }, [btnPrev, titleNode, btnNext]);
  root.append(head, monthGrid);

  const endOfMonth = (year, month) => new Date(year, month + 1, 0);

  function shiftYear(step) {
    viewYear = Math.min(maxYear, Math.max(minYear, viewYear + step));
    render();
  }

  function render() {
    titleNode.textContent = viewYear;
    btnPrev.disabled = viewYear <= minYear;
    btnNext.disabled = viewYear >= maxYear;
    
    monthGrid.replaceChildren();

    for (let month = 0; month < 12; month += 1) {
      const eom = endOfMonth(viewYear, month);
      const disabled = eom < min || eom > max;
      const isSelected = viewYear === selYear && month === selMonth;
      
      const cell = el("button", {
        class: `cal-cell ${isSelected ? 'is-active' : ''}`,
        type: "button",
        text: MONTHS_SHORT[month]
      });
      
      if (disabled) {
        cell.disabled = true;
      } else {
        cell.addEventListener("click", () => onSelect(eom));
      }
      monthGrid.append(cell);
    }
  }

  render();
  return root;
}