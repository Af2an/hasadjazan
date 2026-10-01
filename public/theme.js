// Night mode is paused until it is tuned: every page renders in the day theme.
// The dark palette stays in app.css; restoring the old script brings it back.
document.documentElement.setAttribute("data-theme", "light");
