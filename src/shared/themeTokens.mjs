const THEME_BACKGROUNDS = {
  dark: "#0f1115",
  light: "#f6f8fa"
};

function normalizeTheme(theme) {
  return theme === "light" ? "light" : "dark";
}

function windowBackground(theme) {
  return THEME_BACKGROUNDS[normalizeTheme(theme)];
}

export { THEME_BACKGROUNDS, normalizeTheme, windowBackground };
