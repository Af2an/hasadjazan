import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { createApp } from "../server/app.js";
import { createMemoryRepo } from "./memory-repo.js";

const PASSWORD = "test-only-password";
const HASH = bcrypt.hashSync(PASSWORD, 4);
const restaurant = () => ({ type: "restaurant", restaurant_name: "مطعم البحر", contact_name: "علي", phone: "0512345678", region: "جازان", city: "أبوعريش", need: "30–60 كجم", species: ["هامور"], trial: "نعم", note: "" });
const quiet = { error() {}, warn() {} };
const baseConfig = { production: false, sessionSecret: "s".repeat(40), adminPasswordHash: HASH, appOrigin: "", trustProxy: 1, sessionTtlMs: 60000 };

let app, repo, mails;
beforeEach(() => {
  repo = createMemoryRepo();
  mails = [];
  app = createApp({ config: baseConfig, repo, mailer: { notify: async (subject, lines) => { mails.push({ subject, lines }); } }, logger: quiet, distDir: "tests/fixtures" });
});

const postTo = (target, url, body) => request(target).post(url).set("Content-Type", "application/json").send(JSON.stringify(body));
const post = (url, body) => postTo(app, url, body);

async function login() {
  const r = await post("/api/admin/login", { password: PASSWORD });
  expect(r.status).toBe(200);
  const cookie = r.headers["set-cookie"][0].split(";")[0];
  const s = await request(app).get("/api/admin/session").set("Cookie", cookie);
  return { cookie, csrf: s.body.csrf, setCookie: r.headers["set-cookie"][0] };
}
const adminPost = (a, url, body = {}) => post(url, body).set("Cookie", a.cookie).set("X-CSRF-Token", a.csrf);

async function createDemand(a) {
  const r = await adminPost(a, "/api/admin/demands", { date: "2026-10-05", pickup_window: "5:30 – 6:30 صباحًا", items: [{ species: "هامور", required_kg: 120 }] });
  expect(r.status).toBe(200);
  return (await request(app).get("/api/admin/demands").set("Cookie", a.cookie)).body[0];
}

describe("POST /api/submit", () => {
  it("saves a valid lead, then notifies, and answers generically", async () => {
    const r = await post("/api/submit", restaurant());
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
    expect(repo.db.restaurants).toHaveLength(1);
    expect(mails).toHaveLength(1);
    expect(mails[0].lines.join(" ")).not.toContain("0512345678");
  });
  it("does not notify when saving fails, and hides the error", async () => {
    repo.insertRestaurantLead = async () => { throw new Error("db down: secret detail"); };
    const r = await post("/api/submit", restaurant());
    expect(r.status).toBe(500);
    expect(r.body).toEqual({ error: "server_error" });
    expect(r.text).not.toContain("secret detail");
    expect(mails).toHaveLength(0);
  });
  it("rejects invalid data and unexpected fields", async () => {
    expect((await post("/api/submit", { ...restaurant(), phone: "123" })).status).toBe(400);
    expect((await post("/api/submit", { ...restaurant(), is_admin: true })).status).toBe(400);
    expect((await request(app).post("/api/submit").set("Content-Type", "application/json").send("{bad")).status).toBe(400);
    expect(repo.db.restaurants).toHaveLength(0);
  });
  it("stores HTML/JS input as plain text", async () => {
    await post("/api/submit", { ...restaurant(), restaurant_name: "<script>alert(1)</script>" });
    expect(repo.db.restaurants[0].restaurant_name).toBe("<script>alert(1)</script>");
  });
  it("rejects payloads over 16KB", async () => {
    const r = await post("/api/submit", { ...restaurant(), note: "x".repeat(20000) });
    expect(r.status).toBe(413);
  });
  it("only accepts JSON", async () => {
    const r = await request(app).post("/api/submit").type("form").send("type=restaurant");
    expect(r.status).toBe(415);
  });
  it("silently drops honeypot submissions", async () => {
    const r = await post("/api/submit", { ...restaurant(), website: "http://spam.example" });
    expect(r.status).toBe(200);
    expect(repo.db.restaurants).toHaveLength(0);
    expect(mails).toHaveLength(0);
  });
  it("rate limits to 5 submissions per 10 minutes per IP", async () => {
    for (let i = 0; i < 5; i++) expect((await post("/api/submit", restaurant())).status).toBe(200);
    expect((await post("/api/submit", restaurant())).status).toBe(429);
    expect(repo.db.restaurants).toHaveLength(5);
  });
  it("refuses cross-origin requests and sends no CORS headers", async () => {
    const cross = await post("/api/submit", restaurant()).set("Origin", "https://evil.example");
    expect(cross.status).toBe(403);
    expect(cross.headers["access-control-allow-origin"]).toBeUndefined();
    const site = await post("/api/submit", restaurant()).set("Sec-Fetch-Site", "cross-site");
    expect(site.status).toBe(403);
    const pre = await request(app).options("/api/submit").set("Origin", "https://evil.example").set("Access-Control-Request-Method", "POST");
    expect(pre.headers["access-control-allow-origin"]).toBeUndefined();
    const same = await post("/api/submit", restaurant()).set("Host", "hasad.example").set("Origin", "https://hasad.example");
    expect(same.status).toBe(200);
    const proxied = await post("/api/submit", restaurant()).set("Host", "internal:3000").set("X-Forwarded-Host", "hasad.example").set("Origin", "https://hasad.example");
    expect(proxied.status).toBe(200);
    const spoof = await post("/api/submit", restaurant()).set("Host", "internal:3000").set("X-Forwarded-Host", "hasad.example").set("Origin", "https://evil.example");
    expect(spoof.status).toBe(403);
  });
});

describe("security headers", () => {
  it("sets CSP, HSTS, nosniff, referrer, permissions and frame protections", async () => {
    const r = await request(app).get("/");
    expect(r.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(r.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(r.headers["content-security-policy"]).not.toContain("unsafe-inline");
    expect(r.headers["strict-transport-security"]).toContain("max-age=31536000");
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
    expect(r.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(r.headers["permissions-policy"]).toContain("camera=()");
    expect(r.headers["x-powered-by"]).toBeUndefined();
  });
});

describe("admin access", () => {
  it("redirects /admin to the login page without a session", async () => {
    const r = await request(app).get("/admin");
    expect(r.status).toBe(302);
    expect(r.headers.location).toBe("/admin/login");
  });
  it("blocks every admin API without a session", async () => {
    for (const url of ["/api/admin/leads", "/api/admin/demands", "/api/admin/session"]) expect((await request(app).get(url)).status).toBe(401);
    expect((await post("/api/admin/demands", {})).status).toBe(401);
    expect((await post("/api/admin/offers/3f0e4c1a-8a0e-4b7e-9d59-0d7c1e2f3a4b/count", {})).status).toBe(401);
  });
  it("rejects a wrong password and a forged cookie", async () => {
    expect((await post("/api/admin/login", { password: "wrong" })).status).toBe(401);
    const forged = Buffer.from(JSON.stringify({ sid: "x", csrf: "y", exp: Date.now() + 60000 })).toString("base64url") + ".AAAA";
    expect((await request(app).get("/api/admin/leads").set("Cookie", "hj_admin=" + forged)).status).toBe(401);
  });
  it("limits login attempts", async () => {
    for (let i = 0; i < 5; i++) expect((await post("/api/admin/login", { password: "wrong" })).status).toBe(401);
    expect((await post("/api/admin/login", { password: PASSWORD })).status).toBe(429);
  });
  it("issues an HttpOnly SameSite=Strict session cookie", async () => {
    const a = await login();
    expect(a.setCookie).toMatch(/HttpOnly/i);
    expect(a.setCookie).toMatch(/SameSite=Strict/i);
    expect((await request(app).get("/api/admin/leads").set("Cookie", a.cookie)).status).toBe(200);
    expect((await request(app).get("/admin").set("Cookie", a.cookie)).status).toBe(200);
  });
  it("redirects to HTTPS and marks the cookie Secure with the __Host- prefix in production", async () => {
    const prod = createApp({ config: { ...baseConfig, production: true }, repo, mailer: { notify: async () => {} }, logger: quiet, distDir: "tests/fixtures" });
    const plain = await request(prod).get("/privacy?x=1").set("Host", "hasad.example").set("X-Forwarded-Proto", "http");
    expect(plain.status).toBe(308);
    expect(plain.headers.location).toBe("https://hasad.example/privacy?x=1");
    expect((await request(prod).get("/").set("X-Forwarded-Proto", "https")).status).toBe(200);
    expect((await request(prod).get("/")).status).toBe(200); // no proxy header: never loop
    const r = await postTo(prod, "/api/admin/login", { password: PASSWORD }).set("X-Forwarded-Proto", "https");
    expect(r.headers["set-cookie"][0]).toMatch(/^__Host-hj_admin=.*Secure/i);
  });
  it("requires the CSRF token for every admin change", async () => {
    const a = await login();
    const body = { date: "2026-10-05", pickup_window: "فجرًا", items: [{ species: "هامور", required_kg: 10 }] };
    expect((await post("/api/admin/demands", body).set("Cookie", a.cookie)).status).toBe(403);
    expect((await post("/api/admin/demands", body).set("Cookie", a.cookie).set("X-CSRF-Token", "wrong")).status).toBe(403);
    expect((await post("/api/admin/logout", {}).set("Cookie", a.cookie)).status).toBe(403);
    expect(repo.db.demands).toHaveLength(0);
    expect((await adminPost(a, "/api/admin/demands", body)).status).toBe(200);
  });
  it("ends the session on logout and when it expires", async () => {
    const a = await login();
    expect((await adminPost(a, "/api/admin/logout")).status).toBe(200);
    expect((await request(app).get("/api/admin/leads").set("Cookie", a.cookie)).status).toBe(401);
    const expired = createApp({ config: { ...baseConfig, sessionTtlMs: -1 }, repo, mailer: { notify: async () => {} }, logger: quiet, distDir: "tests/fixtures" });
    const r = await postTo(expired, "/api/admin/login", { password: PASSWORD });
    expect((await request(expired).get("/api/admin/leads").set("Cookie", r.headers["set-cookie"][0].split(";")[0])).status).toBe(401);
  });
});

describe("trial demand", () => {
  it("creates an unguessable link that shows the aggregated demand only", async () => {
    await post("/api/submit", restaurant());
    const a = await login();
    const d = await createDemand(a);
    expect(d.public_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(d.pickup_location).toBe("حراج جازان");
    const r = await request(app).get("/api/trial/" + d.public_token);
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual(["date", "items", "pickup_location", "pickup_window", "title"]);
    expect(Object.keys(r.body.items[0]).sort()).toEqual(["counted_kg", "id", "remaining_kg", "required_kg", "species"]);
    expect(r.text).not.toContain("مطعم البحر");
    expect(r.text).not.toContain("0512345678");
    expect(r.body.items[0]).toMatchObject({ required_kg: 120, counted_kg: 0, remaining_kg: 120 });
  });
  it("returns 404 for unknown and malformed tokens", async () => {
    expect((await request(app).get("/api/trial/" + "A".repeat(43))).status).toBe(404);
    expect((await request(app).get("/api/trial/1")).status).toBe(404);
  });
  it("keeps the remaining quantity until the admin counts the offer", async () => {
    const a = await login();
    const d = await createDemand(a);
    const url = "/api/trial/" + d.public_token;
    const offer = { item_id: d.items[0].id, name: "علي الحربي", phone: "0598765432", quantity_kg: 40, price_per_kg: 45, note: "" };
    expect((await post(url + "/offers", offer)).status).toBe(200);
    const afterOffer = await request(app).get(url);
    expect(afterOffer.body.items[0].remaining_kg).toBe(120);
    expect(afterOffer.text).not.toContain("0598765432");

    const admin = (await request(app).get("/api/admin/demands").set("Cookie", a.cookie)).body[0];
    const offerId = admin.items[0].offers[0].id;
    expect((await post("/api/admin/offers/" + offerId + "/count", {}).set("Cookie", a.cookie)).status).toBe(403);
    expect((await request(app).get(url)).body.items[0].remaining_kg).toBe(120);

    expect((await adminPost(a, "/api/admin/offers/" + offerId + "/count")).status).toBe(200);
    expect((await request(app).get(url)).body.items[0]).toMatchObject({ counted_kg: 40, remaining_kg: 80 });
    expect((await adminPost(a, "/api/admin/offers/" + offerId + "/count")).status).toBe(404);
    expect((await request(app).get(url)).body.items[0].remaining_kg).toBe(80);
  });
  it("rejects invalid offers and offers sent through another token", async () => {
    const a = await login();
    const d = await createDemand(a);
    const url = "/api/trial/" + d.public_token + "/offers";
    const offer = { item_id: d.items[0].id, name: "علي", phone: "0598765432", quantity_kg: 40, price_per_kg: 45, note: "" };
    expect((await post(url, { ...offer, quantity_kg: -5 })).status).toBe(400);
    expect((await post(url, { ...offer, counted: true })).status).toBe(400);
    expect((await post("/api/trial/" + "B".repeat(43) + "/offers", offer)).status).toBe(404);
    expect(repo.db.offers).toHaveLength(0);
  });
  it("stops serving a revoked link", async () => {
    const a = await login();
    const d = await createDemand(a);
    expect((await adminPost(a, "/api/admin/demands/" + d.id + "/revoke")).status).toBe(200);
    expect((await request(app).get("/api/trial/" + d.public_token)).status).toBe(404);
    const offer = { item_id: d.items[0].id, name: "علي", phone: "0598765432", quantity_kg: 40, price_per_kg: 45, note: "" };
    expect((await post("/api/trial/" + d.public_token + "/offers", offer)).status).toBe(404);
  });
  it("keeps the token out of the Referer header and out of search indexes", async () => {
    const r = await request(app).get("/trial/" + "A".repeat(43));
    expect(r.headers["referrer-policy"]).toBe("no-referrer");
    expect(r.headers["x-robots-tag"]).toContain("noindex");
  });
});
