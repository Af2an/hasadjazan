import { useState } from "react";
import { Moon, Sun } from "@phosphor-icons/react";
import { css } from "./css.js";

// The starting theme is set before first paint by /theme.js (saved choice, else the device setting).
function apply(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#17221F" : "#E3ECE6");
  try { localStorage.setItem("hj-theme", theme); } catch { /* storage unavailable: the choice lasts for this visit */ }
}

export function useTheme() {
  const [theme, setTheme] = useState(() => (document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light"));
  const toggle = () => { const next = theme === "dark" ? "light" : "dark"; apply(next); setTheme(next); };
  return { dark: theme === "dark", toggle, label: theme === "dark" ? "الوضع النهاري" : "الوضع الليلي" };
}

export const ThemeIcon = ({ dark, size = 22 }) => (dark ? <Sun weight="duotone" size={size} aria-hidden="true" /> : <Moon weight="duotone" size={size} aria-hidden="true" />);

// Round icon button. `onDark` is for headers that are dark in both themes.
export function ThemeToggle({ theme, onDark, className }) {
  return (
    <button type="button" onClick={theme.toggle} aria-label={theme.label} title={theme.label} className={(className ? className + " " : "") + (onDark ? "hv-social" : "hv-nav")}
      style={css("width:44px;height:44px;flex:none;border:0;border-radius:50%;background:transparent;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0;color:" + (onDark ? "#FFFFFF" : "#16211F"))}>
      <ThemeIcon dark={theme.dark} />
    </button>
  );
}
