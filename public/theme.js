// Sets the theme before first paint: the saved choice, otherwise the device setting.
(function () {
  var theme = null;
  try { theme = localStorage.getItem("hj-theme"); } catch { /* storage unavailable */ }
  if (theme !== "dark" && theme !== "light") {
    theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  document.documentElement.setAttribute("data-theme", theme);
  if (theme === "dark") {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", "#1B1E1E");
  }
})();
