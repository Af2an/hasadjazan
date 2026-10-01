export async function getJson(url) {
  const r = await fetch(url, { credentials: "same-origin", headers: { Accept: "application/json" } });
  return { ok: r.ok, status: r.status, data: r.ok ? await r.json() : null };
}

export async function postJson(url, body, csrf) {
  const headers = { "Content-Type": "application/json" };
  if (csrf) headers["X-CSRF-Token"] = csrf;
  const r = await fetch(url, { method: "POST", credentials: "same-origin", headers, body: JSON.stringify(body || {}) });
  return { ok: r.ok, status: r.status };
}

const toEn = (s) => String(s || "").replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));
export const normPhone = (p) => toEn(p).replace(/\D/g, "").replace(/^00966/, "").replace(/^966/, "").replace(/^0/, "").replace(/^5/, "05");
export const toNumber = (v) => { const n = Number(toEn(v).replace(",", ".").trim()); return Number.isFinite(n) ? n : NaN; };
