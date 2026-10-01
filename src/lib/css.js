// Turns the design's CSS declaration strings into React style objects, so the
// markup keeps the exact values of the visual reference.
//
// Every hex colour becomes a CSS variable with the original colour as its
// fallback: `--t-RRGGBB` when it is a text colour, `--s-RRGGBB` when it paints
// a surface (background, border, shadow). The light theme defines none of
// them, so it renders the reference colours; the dark theme in app.css
// overrides the ones that need to change.
const cache = new Map();
const HEX = /#([0-9A-Fa-f]{6})\b/g;
const LIME = "background:#AEBA3C"; // lime keeps its dark ink in both themes

export function css(str) {
  let style = cache.get(str);
  if (!style) {
    style = {};
    const onLime = str.includes(LIME);
    for (const part of str.split(";")) {
      const i = part.indexOf(":");
      if (i < 1) continue;
      const prop = part.slice(0, i).trim();
      const role = prop === "color" ? "t" : "s";
      let value = part.slice(i + 1).trim();
      if (!(onLime && role === "t")) value = value.replace(HEX, (hex, h) => "var(--" + role + "-" + h.toUpperCase() + ", " + hex + ")");
      style[prop.replace(/-([a-z])/g, (m, c) => c.toUpperCase())] = value;
    }
    cache.set(str, style);
  }
  return style;
}
