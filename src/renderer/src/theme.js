import { normalizeTheme, windowBackground } from "../../shared/themeTokens.mjs";

export function applyTheme(theme) {
  const next = normalizeTheme(theme);
  document.body.classList.toggle("light", next === "light");
  document.documentElement.style.background = windowBackground(next);
  document.body.style.background = windowBackground(next);
}

export { windowBackground, normalizeTheme };
