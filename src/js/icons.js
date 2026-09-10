// Consistent stroke icons for the light workspace screens (24x24, feather-style).
import { svgIcon } from "./util.js";

const PATHS = {
  back: ["M19 12H5", "M12 19l-7-7 7-7"],
  chevronDown: ["M6 9l6 6 6-6"],
  chevronLeft: ["M15 18l-6-6 6-6"],
  chevronRight: ["M9 6l6 6-6 6"],
  search: ["M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z", "M16.2 16.2L21 21"],
  plus: ["M12 5v14", "M5 12h14"],
  trash: ["M3 6h18", "M8 6V4h8v2", "M6 6l1 14h10l1-14"],
  edit: ["M12 20h9", "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"],
  close: ["M6 6l12 12", "M18 6L6 18"],
  check: ["M5 12l4 4 10-10"],
  checkCircle: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M8 12l3 3 5-6"],
  info: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M12 11v5", "M12 7.5h.01"],
  alert: ["M12 3l9.2 16.5H2.8L12 3z", "M12 9.5v4", "M12 17h.01"],
  database: ["M12 8c4.97 0 9-1.12 9-2.5S16.97 3 12 3 3 4.12 3 5.5 7.03 8 12 8z", "M21 5.5V12c0 1.38-4.03 2.5-9 2.5S3 13.38 3 12V5.5", "M21 12v6.5c0 1.38-4.03 2.5-9 2.5s-9-1.12-9-2.5V12"],
  doc: ["M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z", "M14 2v5h5", "M9 13h6", "M9 17h4"],
  download: ["M12 3v12", "M8 11l4 4 4-4", "M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"],
  eye: ["M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"],
  pin: ["M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7z", "M12 11.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"],
  calendar: ["M7 2v3", "M17 2v3", "M3.5 8h17", "M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"],
  refresh: ["M21 12a9 9 0 1 1-2.64-6.36", "M21 3v6h-6"],
  save: ["M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z", "M17 21v-8H7v8", "M7 3v5h8"],
  sortUp: ["M12 19V5", "M5 12l7-7 7 7"],
  sortDown: ["M12 5v14", "M5 12l7 7 7-7"],
  sprout: ["M12 21v-8", "M12 13c0-4.5-3-6.5-7.5-6.5C4.5 11 7.5 13 12 13z", "M12 13c0-4.5 3-6.5 7.5-6.5C19.5 11 16.5 13 12 13z"],
  chart: ["M4 4v16h16", "M8 14l3-4 3 3 4-6"],
  drop: ["M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"],
  thermometer: ["M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"],
  wind: ["M3 8h9a3 3 0 1 0-3-3", "M3 16h13a3 3 0 1 1-3 3", "M3 12h16"],
  close2: ["M6 6l12 12", "M18 6L6 18"]
};

export function icon(name, className = "w-ico") {
  const paths = PATHS[name] || PATHS.info;
  return svgIcon(paths, "0 0 24 24", className);
}

export function iconButton(name, { label, className = "w-btn w-btn--icon", onclick, title } = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.setAttribute("aria-label", label);
  button.title = title || label;
  button.append(svgIcon(PATHS[name] || PATHS.info, "0 0 24 24", "w-ico"));
  if (onclick) {
    button.addEventListener("click", onclick);
  }
  return button;
}
