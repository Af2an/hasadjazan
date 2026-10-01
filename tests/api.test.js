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
    for (let i = 0; i < 5; i++) expect((await post("/api/submit", { ...restaurant(), phone: "051234567" + i })).status).toBe(200);
    expect((await post("/api/submit", { ...restaurant(), phone: "0512345679" })).status).toBe(429);
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

describe("one registration per phone number", () => {
  const fish = () => ({ type: "fish", kind: "صياد", name: "علي", shop_name: null, phone: "0512345678", species: ["هامور"], trial: "نعم", delivery: "نعم", quality: true, note: "" });
  it("updates the existing record when the same phone registers again in the same form", async () => {
    expect((await post("/api/submit", restaurant())).status).toBe(200);
    const again = await post("/api/submit", { ...restaurant(), restaurant_name: "مطعم البحر الجديد", city: "صبيا" });
    expect(again.status).toBe(200);
    expect(again.body).toEqual({ ok: true });
    expect(repo.db.restaurants).toHaveLength(1);
    expect(repo.db.restaurants[0]).toMatchObject({ restaurant_name: "مطعم البحر الجديد", city: "صبيا" });
  });
  it("refuses a restaurant phone in the fish form, and a fish phone in the restaurant form", async () => {
    expect((await post("/api/submit", restaurant())).status).toBe(200);
    const r = await post("/api/submit", fish());
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ error: "phone_in_use" });
    expect(repo.db.fish).toHaveLength(0);
    expect(mails).toHaveLength(1);

    expect((await post("/api/submit", { ...fish(), phone: "0598765432" })).status).toBe(200);
    expect((await post("/api/submit", { ...restaurant(), phone: "0598765432" })).status).toBe(409);
    expect(repo.db.restaurants).toHaveLength(1);
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

describe("deleting a lead", () => {
  it("needs a session and the CSRF token, then removes only that record", async () => {
    await post("/api/submit", restaurant());
    await post("/api/submit", { ...restaurant(), phone: "0511111111", restaurant_name: "مطعم ثانٍ" });
    const id = repo.db.restaurants.find((r) => r.phone === "0512345678").id;
    const url = "/api/admin/leads/restaurant/" + id + "/delete";

    expect((await post(url, {})).status).toBe(401);
    const a = await login();
    expect((await post(url, {}).set("Cookie", a.cookie)).status).toBe(403);
    expect(repo.db.restaurants).toHaveLength(2);

    expect((await adminPost(a, "/api/admin/leads/fish/" + id + "/delete")).status).toBe(404);
    expect((await adminPost(a, "/api/admin/leads/other/" + id + "/delete")).status).toBe(404);
    expect((await adminPost(a, "/api/admin/leads/restaurant/not-an-id/delete")).status).toBe(404);
    expect(repo.db.restaurants).toHaveLength(2);

    expect((await adminPost(a, url)).status).toBe(200);
    expect(repo.db.restaurants.map((r) => r.restaurant_name)).toEqual(["مطعم ثانٍ"]);
    expect((await adminPost(a, url)).status).toBe(404);
  });
});

describe("admin can edit and delete everything", () => {
  const fishLead = () => ({ type: "fish", kind: "صياد", name: "سالم", shop_name: null, phone: "0598765432", species: ["بياض"], trial: "نعم", delivery: "نعم", quality: true, note: "" });

  it("edits a lead, keeps the one-phone rule, and can take someone off the ready list", async () => {
    await post("/api/submit", restaurant());
    await post("/api/submit", fishLead());
    const id = repo.db.restaurants[0].id;
    const url = "/api/admin/leads/restaurant/" + id + "/update";
    const edited = { ...restaurant(), restaurant_name: "اسم معدّل", city: "صبيا", trial: "لا" };

    expect((await post(url, edited)).status).toBe(401);
    const a = await login();
    expect((await post(url, edited).set("Cookie", a.cookie)).status).toBe(403);
    expect((await adminPost(a, url, { ...edited, phone: "12" })).status).toBe(400);
    expect((await adminPost(a, url, { ...fishLead(), phone: "0512345678" })).status).toBe(400);
    expect((await adminPost(a, url, { ...edited, phone: "0598765432" })).status).toBe(409);
    expect(repo.db.restaurants[0].restaurant_name).toBe("مطعم البحر");

    expect((await adminPost(a, url, edited)).status).toBe(200);
    expect(repo.db.restaurants[0]).toMatchObject({ restaurant_name: "اسم معدّل", city: "صبيا", trial_interest: false, phone: "0512345678" });
    expect((await adminPost(a, "/api/admin/leads/restaurant/3f0e4c1a-8a0e-4b7e-9d59-0d7c1e2f3a4b/update", edited)).status).toBe(409);
    expect((await adminPost(a, "/api/admin/leads/restaurant/3f0e4c1a-8a0e-4b7e-9d59-0d7c1e2f3a4b/update", { ...edited, phone: "0577777777" })).status).toBe(404);
  });

  it("edits, re-opens and deletes a demand, and un-counts or deletes offers", async () => {
    const a = await login();
    const d = await createDemand(a);
    const pub = "/api/trial/" + d.public_token;
    const itemId = d.items[0].id;
    const offer = (q) => ({ name: "علي", phone: "0598765432", items: [{ item_id: itemId, quantity_kg: q, price_per_kg: 45 }], note: "" });
    await post(pub + "/offers", offer(40));
    await post(pub + "/offers", offer(25));
    const offers = async () => (await request(app).get("/api/admin/demands").set("Cookie", a.cookie)).body[0].items.find((i) => i.id === itemId).offers;
    const remaining = async () => (await request(app).get(pub)).body.items.find((i) => i.id === itemId).remaining_kg;
    const [o1, o2] = await offers();

    for (const u of ["/api/admin/offers/" + o1.id + "/uncount", "/api/admin/offers/" + o1.id + "/delete", "/api/admin/demands/" + d.id + "/delete", "/api/admin/demands/" + d.id + "/restore", "/api/admin/demands/" + d.id + "/update"]) {
      expect((await post(u, {})).status).toBe(401);
      expect((await post(u, {}).set("Cookie", a.cookie)).status).toBe(403);
    }

    await adminPost(a, "/api/admin/offers/" + o1.id + "/count");
    await adminPost(a, "/api/admin/offers/" + o2.id + "/count");
    expect(await remaining()).toBe(55);
    expect((await adminPost(a, "/api/admin/offers/" + o1.id + "/uncount")).status).toBe(200);
    expect(await remaining()).toBe(95);
    expect((await adminPost(a, "/api/admin/offers/" + o1.id + "/uncount")).status).toBe(404);
    expect((await adminPost(a, "/api/admin/offers/" + o2.id + "/delete")).status).toBe(200);
    expect(await remaining()).toBe(120);
    expect(await offers()).toHaveLength(1);

    const upd = { title: "احتياج الثلاثاء", date: "2026-10-06", pickup_window: "6:00 – 7:00 صباحًا", items: [{ id: itemId, species: "هامور", required_kg: 150 }, { species: "بياض", required_kg: 60 }] };
    expect((await adminPost(a, "/api/admin/demands/" + d.id + "/update", { ...upd, items: [] })).status).toBe(400);
    expect((await adminPost(a, "/api/admin/demands/" + d.id + "/update", upd)).status).toBe(200);
    const after = (await request(app).get(pub)).body;
    expect(after).toMatchObject({ title: "احتياج الثلاثاء", date: "2026-10-06", pickup_window: "6:00 – 7:00 صباحًا", pickup_location: "حراج جازان" });
    expect(after.items.map((i) => [i.species, i.required_kg]).sort()).toEqual([["بياض", 60], ["هامور", 150]]);
    expect(await offers()).toHaveLength(1);

    await adminPost(a, "/api/admin/demands/" + d.id + "/revoke");
    expect((await request(app).get(pub)).status).toBe(404);
    expect((await adminPost(a, "/api/admin/demands/" + d.id + "/restore")).status).toBe(200);
    expect((await request(app).get(pub)).status).toBe(200);

    expect((await adminPost(a, "/api/admin/demands/" + d.id + "/delete")).status).toBe(200);
    expect((await request(app).get(pub)).status).toBe(404);
    expect(repo.db.demands).toHaveLength(0);
    expect(repo.db.offers).toHaveLength(0);
    expect((await adminPost(a, "/api/admin/demands/" + d.id + "/delete")).status).toBe(404);
  });
});

describe("supply: one sheet for all species, and the personal link", () => {
  const fishLead = () => ({ type: "fish", kind: "محل أسماك", name: "سالم", shop_name: "أسماك الساحل", phone: "0598765432", species: ["بياض"], trial: "نعم", delivery: "نعم", quality: true, note: "" });
  async function twoItemDemand(a) {
    await adminPost(a, "/api/admin/demands", { date: "2026-10-05", pickup_window: "فجرًا", items: [{ species: "هامور", required_kg: 120 }, { species: "بياض", required_kg: 80 }] });
    return (await request(app).get("/api/admin/demands").set("Cookie", a.cookie)).body[0];
  }

  it("public link: several species in one submission, name and phone once", async () => {
    const a = await login();
    const d = await twoItemDemand(a);
    const url = "/api/trial/" + d.public_token + "/offers";
    const body = { name: "علي", phone: "0511112222", note: "", items: [{ item_id: d.items[0].id, quantity_kg: 30, price_per_kg: 40 }, { item_id: d.items[1].id, quantity_kg: 20, price_per_kg: 25 }] };
    expect((await post(url, { ...body, items: [body.items[0], body.items[0]] })).status).toBe(400);
    expect((await post(url, { ...body, items: [] })).status).toBe(400);
    expect((await post(url, { ...body, items: [body.items[0], { ...body.items[1], item_id: "3f0e4c1a-8a0e-4b7e-9d59-0d7c1e2f3a4b" }] })).status).toBe(404);
    expect(repo.db.offers).toHaveLength(0);
    expect((await post(url, body)).status).toBe(200);
    expect(repo.db.offers.map((o) => [o.name, o.phone, o.quantity_kg]).sort()).toEqual([["علي", "0511112222", 20], ["علي", "0511112222", 30]]);
  });

  it("personal link: created by the admin, no name or phone typed, re-sending replaces", async () => {
    await post("/api/submit", fishLead());
    const lead = repo.db.fish[0];
    const linkUrl = "/api/admin/leads/fish/" + lead.id + "/link";
    expect((await post(linkUrl, {})).status).toBe(401);
    const a = await login();
    expect((await post(linkUrl, {}).set("Cookie", a.cookie)).status).toBe(403);
    expect((await adminPost(a, linkUrl)).status).toBe(200);
    const token = lead.supplier_token;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const listed = (await request(app).get("/api/admin/leads").set("Cookie", a.cookie)).body.fish[0];
    expect(listed.supplier_token).toBe(token);

    const before = await request(app).get("/api/supply/" + token);
    expect(before.status).toBe(200);
    expect(before.body).toEqual({ name: "أسماك الساحل", demand: null, mine: [] });

    const d = await twoItemDemand(a);
    const view = (await request(app).get("/api/supply/" + token)).body;
    expect(view.demand.items).toHaveLength(2);
    expect(JSON.stringify(view)).not.toContain("0598765432");

    const send = (items) => post("/api/supply/" + token + "/offers", { items, note: "" });
    expect((await send([{ item_id: d.items[0].id, quantity_kg: 30, price_per_kg: 40 }, { item_id: d.items[1].id, quantity_kg: 20, price_per_kg: 25 }])).status).toBe(200);
    expect((await post("/api/supply/" + token + "/offers", { name: "x", phone: "0500000000", items: [{ item_id: d.items[0].id, quantity_kg: 1, price_per_kg: 1 }] })).status).toBe(400);
    expect(repo.db.offers).toHaveLength(2);
    expect(repo.db.offers[0]).toMatchObject({ name: "أسماك الساحل · سالم", phone: "0598765432", fish_owner_lead_id: lead.id });
    expect((await request(app).get("/api/trial/" + d.public_token)).body.items.every((i) => i.counted_kg === 0)).toBe(true);

    expect((await send([{ item_id: d.items[0].id, quantity_kg: 55, price_per_kg: 41 }])).status).toBe(200);
    expect(repo.db.offers).toHaveLength(2);
    expect((await request(app).get("/api/supply/" + token)).body.mine.map((m) => m.quantity_kg).sort()).toEqual([20, 55]);

    expect((await request(app).get("/api/supply/" + "Z".repeat(43))).status).toBe(404);
    expect((await adminPost(a, linkUrl)).status).toBe(200);
    expect((await request(app).get("/api/supply/" + token)).status).toBe(404);
    expect((await adminPost(a, "/api/admin/leads/fish/" + lead.id + "/unlink")).status).toBe(200);
    expect((await request(app).get("/api/supply/" + lead.supplier_token)).status).toBe(404);
    const page = await request(app).get("/supply/" + token);
    expect(page.headers["referrer-policy"]).toBe("no-referrer");
    expect(page.headers["x-robots-tag"]).toContain("noindex");
  });
});

describe("saved order summaries", () => {
  const summary = (o) => ({ restaurant_name: "مطعم البحر", date: "2026-10-05", lines: [{ species: "هامور", kg: 20, price: 45, source: "حراج جازان" }], service_fee: 60, transport_fee: 40, note: "", ...o });
  it("are admin only: save, list, edit, delete", async () => {
    expect((await request(app).get("/api/admin/summaries")).status).toBe(401);
    expect((await post("/api/admin/summaries", summary())).status).toBe(401);
    const a = await login();
    expect((await post("/api/admin/summaries", summary()).set("Cookie", a.cookie)).status).toBe(403);
    for (const bad of [summary({ lines: [] }), summary({ service_fee: -1 }), summary({ date: "5/10" }), summary({ restaurant_name: "" }), summary({ total: 1000 }), summary({ lines: [{ species: "هامور", kg: 0, price: 45 }] })]) {
      expect((await adminPost(a, "/api/admin/summaries", bad)).status).toBe(400);
    }
    const saved = await adminPost(a, "/api/admin/summaries", summary());
    expect(saved.status).toBe(200);
    const list = async () => (await request(app).get("/api/admin/summaries").set("Cookie", a.cookie)).body;
    expect(await list()).toHaveLength(1);
    expect((await list())[0]).toMatchObject({ id: saved.body.id, restaurant_name: "مطعم البحر", service_fee: 60, lines: [{ species: "هامور", kg: 20, price: 45, source: "حراج جازان" }] });

    const url = "/api/admin/summaries/" + saved.body.id;
    expect((await post(url + "/update", summary()).set("Cookie", a.cookie)).status).toBe(403);
    expect((await adminPost(a, url + "/update", summary({ transport_fee: 55, lines: [{ species: "بياض", kg: 10, price: 30 }] }))).status).toBe(200);
    expect((await list())[0]).toMatchObject({ transport_fee: 55, lines: [{ species: "بياض", kg: 10, price: 30, source: "" }] });
    expect((await adminPost(a, "/api/admin/summaries/3f0e4c1a-8a0e-4b7e-9d59-0d7c1e2f3a4b/update", summary())).status).toBe(404);
    expect((await post(url + "/delete", {}).set("Cookie", a.cookie)).status).toBe(403);
    expect((await adminPost(a, url + "/delete")).status).toBe(200);
    expect(await list()).toHaveLength(0);
    expect((await adminPost(a, url + "/delete")).status).toBe(404);
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
    const offer = { name: "علي الحربي", phone: "0598765432", items: [{ item_id: d.items[0].id, quantity_kg: 40, price_per_kg: 45 }], note: "" };
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
    const offer = { name: "علي", phone: "0598765432", items: [{ item_id: d.items[0].id, quantity_kg: 40, price_per_kg: 45 }], note: "" };
    expect((await post(url, { ...offer, items: [{ ...offer.items[0], quantity_kg: -5 }] })).status).toBe(400);
    expect((await post(url, { ...offer, counted: true })).status).toBe(400);
    expect((await post("/api/trial/" + "B".repeat(43) + "/offers", offer)).status).toBe(404);
    expect(repo.db.offers).toHaveLength(0);
  });
  it("stops serving a revoked link", async () => {
    const a = await login();
    const d = await createDemand(a);
    expect((await adminPost(a, "/api/admin/demands/" + d.id + "/revoke")).status).toBe(200);
    expect((await request(app).get("/api/trial/" + d.public_token)).status).toBe(404);
    const offer = { name: "علي", phone: "0598765432", items: [{ item_id: d.items[0].id, quantity_kg: 40, price_per_kg: 45 }], note: "" };
    expect((await post("/api/trial/" + d.public_token + "/offers", offer)).status).toBe(404);
  });
  it("keeps the token out of the Referer header and out of search indexes", async () => {
    const r = await request(app).get("/trial/" + "A".repeat(43));
    expect(r.headers["referrer-policy"]).toBe("no-referrer");
    expect(r.headers["x-robots-tag"]).toContain("noindex");
  });
});
