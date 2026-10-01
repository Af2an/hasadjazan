// Shared look of the admin screens (the public pages have their own).
import { css } from "./css.js";

export const fmtDate = (d) => { try { return new Date(d).toLocaleString("en-GB", { timeZone: "Asia/Riyadh", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return d; } };
export const kg = (n) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 }) + " كجم";
export const sar = (n) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ر.س";
export const yes = (b) => (b == null ? "" : b ? "نعم" : "لا");
export const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
export const toLogin = () => window.location.replace("/admin/login");

export const primary = css("min-height:46px;padding:10px 20px;background:#2F6666;color:#FFFFFF;border:none;border-radius:999px;font-size:15px;font-weight:700;cursor:pointer");
export const ghost = css("min-height:44px;padding:8px 18px;background:transparent;border:1px solid #DCE5DF;border-radius:999px;font-size:15px;cursor:pointer;color:#16211F");
export const soft = css("min-height:44px;display:inline-flex;align-items:center;padding:8px 18px;background:#EFF4F0;color:#2F6666;border:none;border-radius:999px;font-size:15px;font-weight:700;text-decoration:none;cursor:pointer");
export const small = css("min-height:38px;padding:6px 14px;background:transparent;border:1px solid #DCE5DF;border-radius:999px;font-size:14px;cursor:pointer;color:#16211F");
export const danger = { color: "var(--t-A54B4B, #A54B4B)", borderColor: "var(--s-E5CFCF, #E5CFCF)" };
export const input = css("min-height:46px;padding:8px 12px;background:#FBFCFB;border:1px solid #C6D3CC;border-radius:12px;font-size:16px;color:#16211F;min-width:0;width:100%");
export const card = css("background:#FFFFFF;border:1px solid #DCE5DF;border-radius:16px;padding:18px");
export const label = css("display:flex;flex-direction:column;gap:4px;font-size:14px;font-weight:600;min-width:0");
export const grid = css("display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,170px),1fr));gap:10px;align-items:end");
export const muted = css("margin:0;font-size:14px;color:#546965");
export const errorText = css("margin:0;font-size:14px;font-weight:700;color:#A54B4B");

export function Select({ value, onChange, options, ...rest }) {
  return <select value={value} onChange={(ev) => onChange(ev.target.value)} style={{ ...input, appearance: "auto" }} {...rest}><option value="">اختر</option>{options.map((o) => (Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o} value={o}>{o}</option>))}</select>;
}
