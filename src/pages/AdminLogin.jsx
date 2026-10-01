import { useEffect, useState } from "react";
import { css } from "../lib/css.js";
import { postJson } from "../lib/api.js";
import logoWhite from "../assets/logo-h-white.png";

export default function AdminLogin() {
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { document.title = "حصاد جازان | الإدارة"; }, []);

  const login = async (ev) => {
    ev.preventDefault();
    if (busy || !pass) return;
    setBusy(true);
    try {
      const r = await postJson("/api/admin/login", { password: pass });
      if (r.ok) { window.location.replace("/admin"); return; }
      setBusy(false);
      setError(r.status === 429 ? "محاولات كثيرة، انتظر قليلًا." : "كلمة المرور غير صحيحة.");
    } catch {
      setBusy(false);
      setError("تعذّر الاتصال.");
    }
  };

  return (
    <div dir="rtl" lang="ar" style={css("min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#16211F")}>
      <form onSubmit={login} style={css("width:100%;max-width:380px;display:flex;flex-direction:column;gap:14px")}>
        <img src={logoWhite} alt="حصاد جازان" style={css("height:36px;width:auto;align-self:flex-start")} />
        <label htmlFor="ad-pw" style={css("margin-top:12px;font-size:16px;font-weight:600;color:#FFFFFF")}>كلمة المرور</label>
        <input id="ad-pw" type="password" dir="ltr" autoComplete="current-password" maxLength={200} value={pass} onChange={(ev) => { setPass(ev.target.value); setError(""); }} style={css("min-height:52px;padding:12px 14px;background:#1F2D2A;border:1px solid #2F403C;border-radius:14px;font-size:17px;color:#FFFFFF")} />
        {error && <p role="alert" style={css("margin:0;font-size:14px;color:#F0B8B8")}>{error}</p>}
        <button type="submit" style={css("min-height:54px;background:#AEBA3C;color:#16211F;border:none;border-radius:999px;font-size:17px;font-weight:700;cursor:pointer")}>{busy ? "لحظة…" : "دخول"}</button>
      </form>
    </div>
  );
}
