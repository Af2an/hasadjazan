import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import "./app.css";
import Home from "./pages/Home.jsx";

const Privacy = lazy(() => import("./pages/Privacy.jsx"));
const Order = lazy(() => import("./pages/Order.jsx"));
const AdminLogin = lazy(() => import("./pages/AdminLogin.jsx"));
const Admin = lazy(() => import("./pages/Admin.jsx"));

function route(path) {
  const p = path.replace(/\/+$/, "") || "/";
  if (p === "/") return <Home />;
  if (p === "/privacy") return <Privacy />;
  if (p === "/admin/login") return <AdminLogin />;
  if (p === "/admin") return <Admin />;
  const order = p.match(/^\/r\/([A-Za-z0-9_-]+)$/);
  if (order) return <Order token={order[1]} />;
  return <Home />;
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Suspense fallback={null}>{route(window.location.pathname)}</Suspense>
  </StrictMode>
);
