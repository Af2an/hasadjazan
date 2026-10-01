import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { createApp } from "../server/app.js";
import { createTestRepo } from "./pg-repo.js";

const PASSWORD = "test-only-password";
const HASH = bcrypt.hashSync(PASSWORD, 4);
const UNKNOWN = "3f0e4c1a-8a0e-4b7e-9d59-0d7c1e2f3a4b";
const restaurant = (o) => ({ restaurant_name: "مطعم البحر", phone: "0512345678", city: "أبوعريش", district: "الروضة", map_link: "", species: ["هامور"], kg_from: 20, kg_to: 30, sourcing: ["مورد يوصل لنا"], sourcing_other: "", substitute: "نعم", wants_contact: "نعم", note: "", consent: true, ...o });
const supplier = (o) => ({ name: "سالم", phone: "0598765432", kind: "صياد", species: ["هامور"], pickup_location: "حراج جازان", availability_time: "الفجر", note: "", ...o });
const need = (o) => ({ date: "2026-10-12", delivery_location: "أبوعريش، حي الروضة", delivery_time: "قبل 10 صباحًا", lines: [{ species: "هامور", spec: "حبة 1–1.5 كجم", kg: 20 }, { species: "هامور", spec: "حبة 2 كجم", kg: 10 }], note: "", ...o });
const quiet = { error() {}, warn() {} };
const baseConfig = { production: false, sessionSecret: "s".repeat(40), adminPasswordHash: HASH, appOrigin: "", trustProxy: 1, sessionTtlMs: 60000 };

let app, repo, mails;
beforeEach(async () => {
  ({ repo } = await createTestRepo());
  mails = [];
  app = createApp({ config: baseConfig, repo, mailer: { notify: async (subject, lines) => { mails.push({ subject, lines }); } }, logger: quiet, distDir: "tests/fixtures" });
});

const postTo = (target, url, body) => request(target).post(url).set("Content-Type", "application/json").send(JSON.stringify(body));
const post = (url, body) => postTo(app, url, body);
const restaurants = async () => (await repo.listLeads()).restaurants;

async function login() {
  const r = await post("/api/admin/login", { password: PASSWORD });
  expect(r.status).toBe(200);
  const cookie = r.headers["set-cookie"][0].split(";")[0];
  const s = await request(app).get("/api/admin/session").set("Cookie", cookie);
  return { cookie, csrf: s.body.csrf, setCookie: r.headers["set-cookie"][0] };
}
const adminPost = (a, url, body = {}) => post(url, body).set("Cookie", a.cookie).set("X-CSRF-Token", a.csrf);
const adminGet = (a, url) => request(app).get(url).set("Cookie", a.cookie);

// registers a restaurant, verifies it, and returns its personal link token
async function verifiedRestaurant(a, o) {
  expect((await post("/api/submit", restaurant(o))).status).toBe(200);
  const r = (await restaurants()).find((x) => x.phone === (o?.phone || "0512345678"));
  expect((await adminPost(a, "/api/admin/restaurants/" + r.id + "/link")).status).toBe(200);
  return (await restaurants()).find((x) => x.id === r.id).order_token;
}

describe("restaurant registration", () => {
  it("saves the record, then notifies without contact details", async () => {
    const r = await post("/api/submit", restaurant({ species: ["هامور", "سلطان إبراهيم"], sourcing: ["نروح الحراج بأنفسنا", "طريقة أخرى"], sourcing_other: "قريب لنا", map_link: "https://maps.example/x", note: "سؤال" }));
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
    const [row] = await restaurants();
    expect(row).toMatchObject({ restaurant_name: "مطعم البحر", city: "أبوعريش", district: "الروضة", kg_from: 20, kg_to: 30, sourcing_other: "قريب لنا", substitute_answer: "نعم", accepts_substitute: true, trial_interest: true, note: "سؤال", order_token: null });
    expect(row.consent_at).toBeTruthy();
    expect(mails).toHaveLength(1);
    expect(mails[0].lines.join(" ")).not.toContain("0512345678");
  });
  it("keeps \"sometimes\" as its own answer, never as consent to buy from shops, and respects \"no contact\"", async () => {
    expect((await post("/api/submit", restaurant({ substitute: "أحيانًا", wants_contact: "لا" }))).status).toBe(200);
    expect((await restaurants())[0]).toMatchObject({ substitute_answer: "أحيانًا", accepts_substitute: null, trial_interest: false });
  });
  it("needs the shop answer and the consent, with no default", async () => {
    const noAnswer = restaurant(); delete noAnswer.substitute;
    const noConsent = restaurant(); delete noConsent.consent;
    for (const bad of [noAnswer, noConsent, restaurant({ consent: false }), restaurant({ kg_from: 40, kg_to: 30 })]) expect((await post("/api/submit", bad)).status).toBe(400);
    expect(await restaurants()).toHaveLength(0);
  });
  it("does not notify when saving fails, and hides the error", async () => {
    repo.insertRestaurantLead = async () => { throw new Error("db down: secret detail"); };
    const r = await post("/api/submit", restaurant());
    expect(r.status).toBe(500);
    expect(r.body).toEqual({ error: "server_error" });
    expect(r.text).not.toContain("secret detail");
    expect(mails).toHaveLength(0);
  });
  it("rejects invalid data, unexpected fields and the old supplier form", async () => {
    expect((await post("/api/submit", restaurant({ phone: "123" }))).status).toBe(400);
    expect((await post("/api/submit", restaurant({ is_admin: true }))).status).toBe(400);
    expect((await post("/api/submit", { type: "fish", kind: "صياد", name: "سالم", phone: "0598765432", species: ["هامور"] })).status).toBe(400);
    expect((await request(app).post("/api/submit").set("Content-Type", "application/json").send("{bad")).status).toBe(400);
    expect(await restaurants()).toHaveLength(0);
  });
  it("stores HTML/JS input as plain text, and refuses big or non-JSON bodies", async () => {
    await post("/api/submit", restaurant({ restaurant_name: "<script>alert(1)</script>" }));
    expect((await restaurants())[0].restaurant_name).toBe("<script>alert(1)</script>");
    expect((await post("/api/submit", restaurant({ location: "x".repeat(20000) }))).status).toBe(413);
    expect((await request(app).post("/api/submit").type("form").send("a=b")).status).toBe(415);
  });
  it("silently drops honeypot submissions", async () => {
    expect((await post("/api/submit", restaurant({ website: "http://spam.example" }))).status).toBe(200);
    expect(await restaurants()).toHaveLength(0);
    expect(mails).toHaveLength(0);
  });
  it("updates instead of duplicating, and rate limits to 5 per 10 minutes", async () => {
    expect((await post("/api/submit", restaurant())).status).toBe(200);
    expect((await post("/api/submit", restaurant({ restaurant_name: "مطعم البحر الجديد" }))).status).toBe(200);
    expect((await restaurants()).map((r) => r.restaurant_name)).toEqual(["مطعم البحر الجديد"]);
    for (let i = 0; i < 3; i++) expect((await post("/api/submit", restaurant({ phone: "051234567" + i }))).status).toBe(200);
    expect((await post("/api/submit", restaurant({ phone: "0512345679" }))).status).toBe(429);
  });
  it("refuses cross-origin requests and sends no CORS headers", async () => {
    const cross = await post("/api/submit", restaurant()).set("Origin", "https://evil.example");
    expect(cross.status).toBe(403);
    expect(cross.headers["access-control-allow-origin"]).toBeUndefined();
    expect((await post("/api/submit", restaurant()).set("Sec-Fetch-Site", "cross-site")).status).toBe(403);
    expect((await post("/api/submit", restaurant()).set("Host", "internal:3000").set("X-Forwarded-Host", "x.example").set("Origin", "https://x.example")).status).toBe(200);
    expect((await post("/api/submit", restaurant()).set("Host", "internal:3000").set("X-Forwarded-Host", "x.example").set("Origin", "https://evil.example")).status).toBe(403);
  });
});

describe("public site is for restaurants only", () => {
  it("no longer serves the supplier pages or their APIs", async () => {
    for (const url of ["/trial/" + "T".repeat(43), "/supply/" + "S".repeat(43), "/api/trial/" + "T".repeat(43), "/api/supply/" + "S".repeat(43)]) {
      expect((await request(app).get(url)).status).toBe(404);
    }
  });
});

describe("personal order link and needs", () => {
  it("is issued only after the team verifies the restaurant, and shows no phone", async () => {
    const a = await login();
    await post("/api/submit", restaurant());
    const id = (await restaurants())[0].id;
    expect((await post("/api/admin/restaurants/" + id + "/link", {})).status).toBe(401);
    const token = await verifiedRestaurant(a);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const view = await request(app).get("/api/r/" + token);
    expect(view.status).toBe(200);
    expect(view.body).toEqual({ restaurant_name: "مطعم البحر", location: "أبوعريش - الروضة", accepts_substitute: true, substitute_answer: "نعم", usual_species: ["هامور"], order_cutoff: "", delivery_window: "", needs: [] });
    expect((await post("/api/r/" + token + "/needs", need({ delivery_time: "بعد 10 صباحًا", lines: [{ species: "هامور", spec: "", kg: 5 }] }))).status).toBe(200);
    expect(JSON.stringify(view.body)).not.toContain("0512345678");
    const page = await request(app).get("/r/" + token);
    expect(page.headers["referrer-policy"]).toBe("no-referrer");
    expect(page.headers["x-robots-tag"]).toContain("noindex");
  });
  it("saves a dated need with the same species in two sizes", async () => {
    const a = await login();
    const token = await verifiedRestaurant(a);
    const r = await post("/api/r/" + token + "/needs", need());
    expect(r.status).toBe(200);
    const [n] = (await adminGet(a, "/api/admin/needs")).body;
    expect(n).toMatchObject({ date: "2026-10-12", status: "new", restaurant_name: "مطعم البحر", requested_kg: 30, delivered_kg: 0 });
    expect(n.lines.map((l) => l.spec).sort()).toEqual(["حبة 1–1.5 كجم", "حبة 2 كجم"]);
    expect(n.events.map((e) => e.status)).toEqual(["new"]);
    expect((await request(app).get("/api/r/" + token)).body.needs[0].lines).toHaveLength(2);
    expect(mails.at(-1).subject).toBe("احتياج جديد من مطعم");
  });
  it("rejects wrong input, duplicate lines, unknown and revoked links", async () => {
    const a = await login();
    const token = await verifiedRestaurant(a);
    const url = "/api/r/" + token + "/needs";
    for (const bad of [need({ lines: [] }), need({ date: "12/10" }), need({ delivery_time: "الآن" }), need({ lines: [{ species: "هامور", spec: "وسط", kg: 0 }] }),
      need({ lines: [{ species: "هامور", spec: "وسط", kg: 5 }, { species: "هامور", spec: "وسط", kg: 3 }] })]) {
      expect((await post(url, bad)).status).toBe(400);
    }
    expect((await post("/api/r/" + "X".repeat(43) + "/needs", need())).status).toBe(404);
    expect((await request(app).get("/api/r/short")).status).toBe(404);
    const id = (await restaurants())[0].id;
    expect((await adminPost(a, "/api/admin/restaurants/" + id + "/unlink")).status).toBe(200);
    expect((await request(app).get("/api/r/" + token)).status).toBe(404);
    expect((await post(url, need())).status).toBe(404);
    expect((await adminGet(a, "/api/admin/needs")).body).toHaveLength(0);
  });
  it("records each status change with its time", async () => {
    const a = await login();
    const token = await verifiedRestaurant(a);
    await post("/api/r/" + token + "/needs", need());
    const n = (await adminGet(a, "/api/admin/needs")).body[0];
    const url = "/api/admin/needs/" + n.id + "/update";
    expect((await post(url, { status: "confirmed", service_fee: null, cancel_reason: "" }).set("Cookie", a.cookie)).status).toBe(403);
    expect((await adminPost(a, url, { status: "done", service_fee: null, cancel_reason: "" })).status).toBe(400);
    expect((await adminPost(a, url, { status: "confirmed", service_fee: 50, cancel_reason: "" })).status).toBe(200);
    expect((await adminPost(a, url, { status: "confirmed", service_fee: 60, cancel_reason: "" })).status).toBe(200);
    const after = (await adminGet(a, "/api/admin/needs")).body[0];
    expect(after.events.map((e) => e.status)).toEqual(["new", "confirmed"]);
    expect(after).toMatchObject({ service_fee: 60, collected: 0 });
    // money in: payments add up; a bad method or amount is refused
    const pay = "/api/admin/needs/" + n.id + "/payments";
    expect((await adminPost(a, pay, { amount: 0, method: "نقد", paid_on: "2026-10-12", note: "" })).status).toBe(400);
    expect((await adminPost(a, pay, { amount: 10, method: "شيك", paid_on: "2026-10-12", note: "" })).status).toBe(400);
    expect((await adminPost(a, pay, { amount: 15, method: "نقد", paid_on: "2026-10-12", note: "" })).status).toBe(200);
    expect((await adminPost(a, pay, { amount: 5, method: "تحويل", paid_on: "2026-10-13", note: "" })).status).toBe(200);
    const paid = (await adminGet(a, "/api/admin/needs")).body[0];
    expect(paid.collected).toBe(20);
    expect((await adminPost(a, "/api/admin/payments/" + paid.payments[0].id + "/delete")).status).toBe(200);
    expect((await adminGet(a, "/api/admin/needs")).body[0].collected).toBe(5);
  });
});

describe("operations: purchase, inspection, allocation, delivery", () => {
  async function setup(substitute = "نعم") {
    const a = await login();
    const token = await verifiedRestaurant(a, { substitute });
    await post("/api/r/" + token + "/needs", need());
    const n = (await adminGet(a, "/api/admin/needs")).body[0];
    const line = n.lines.find((l) => l.spec === "حبة 1–1.5 كجم");
    // distribution is for confirmed orders only
    expect((await adminPost(a, "/api/admin/needs/" + n.id + "/update", { status: "confirmed", service_fee: null, cancel_reason: "" })).status).toBe(200);
    return { a, n, line };
  }
  const batch = (o) => ({ date: "2026-10-12", source: "حراج جازان", supplier_id: null, species: "هامور", spec: "حبة 1–1.5 كجم", purchased_kg: 25, cost_total: 1000, note: "", ...o });
  const newBatch = async (a, o) => { const r = await adminPost(a, "/api/admin/batches", batch(o)); expect(r.status).toBe(200); return r.body.id; };

  it("keeps reported, purchased, accepted, allocated and delivered apart", async () => {
    const { a, n, line } = await setup();
    // a supplier report is only a report: nothing is secured by it
    expect((await adminPost(a, "/api/admin/suppliers", supplier())).status).toBe(200);
    const sup = (await repo.listLeads()).fish[0];
    expect((await adminPost(a, "/api/admin/supply-reports", { supplier_id: sup.id, date: "2026-10-12", species: "هامور", spec: "", kg: 100, note: "" })).status).toBe(200);
    expect((await adminGet(a, "/api/admin/needs")).body[0].allocated_kg).toBe(0);

    const b = await newBatch(a, { supplier_id: sup.id, supplier_due_on: "2026-10-12" });
    expect((await adminPost(a, "/api/admin/batches/" + b + "/payout", { amount: 1000, paid_on: "2026-10-12" })).status).toBe(200);
    expect((await adminPost(a, "/api/admin/allocations", { batch_id: b, line_id: line.id, kg: 5 })).body.error).toBe("not_inspected");
    expect((await adminPost(a, "/api/admin/batches/" + b + "/inspect", { accepted_kg: 30, note: "" })).body.error).toBe("above_purchased");
    expect((await adminPost(a, "/api/admin/batches/" + b + "/inspect", { accepted_kg: 22, note: "3 كجم مرفوضة" })).status).toBe(200);
    expect((await adminPost(a, "/api/admin/allocations", { batch_id: b, line_id: line.id, kg: 18 })).status).toBe(200);
    // the same kilos cannot go out twice, and a line cannot get more than it asked for
    expect((await adminPost(a, "/api/admin/allocations", { batch_id: b, line_id: line.id, kg: 3 })).body.error).toBe("line_exceeded");
    const other = n.lines.find((l) => l.spec === "حبة 2 كجم");
    expect((await adminPost(a, "/api/admin/allocations", { batch_id: b, line_id: other.id, kg: 5 })).body.error).toBe("batch_exceeded");
    expect((await adminPost(a, "/api/admin/batches/" + b + "/inspect", { accepted_kg: 10, note: "" })).body.error).toBe("below_allocated");
    expect((await adminPost(a, "/api/admin/batches/" + b + "/delete")).body.error).toBe("in_use");

    const [bb] = (await adminGet(a, "/api/admin/batches")).body;
    expect(bb).toMatchObject({ purchased_kg: 25, accepted_kg: 22, allocated_kg: 18, available_kg: 4 });

    const alloc = (await adminGet(a, "/api/admin/needs")).body[0].lines.find((l) => l.id === line.id).allocations[0];
    expect((await adminPost(a, "/api/admin/allocations/" + alloc.id + "/deliver", { delivered_kg: 19 })).status).toBe(404);
    expect((await adminPost(a, "/api/admin/allocations/" + alloc.id + "/deliver", { delivered_kg: 17.5 })).status).toBe(200);
    expect((await adminPost(a, "/api/admin/allocations/" + alloc.id + "/delete")).status).toBe(404); // delivered: kept

    const after = (await adminGet(a, "/api/admin/needs")).body[0];
    expect(after).toMatchObject({ requested_kg: 30, allocated_kg: 18, delivered_kg: 17.5, purchase_cost: 700 }); // 17.5 kg × 40
    await adminPost(a, "/api/admin/needs/" + n.id + "/update", { status: "partial", service_fee: 50, cancel_reason: "" });
    await adminPost(a, "/api/admin/needs/" + n.id + "/payments", { amount: 300, method: "تحويل", paid_on: "2026-10-12", note: "" });
    const rep = (await adminGet(a, "/api/admin/report")).body;
    expect(rep).toMatchObject({ needs: 1, restaurants: 1, reordering_restaurants: 0, requested_kg: 30, delivered_kg: 17.5, shortage_kg: 12.5, purchased_kg: 25, rejected_kg: 3,
      purchase_cost_total: 1000, cost_to_restaurants: 700, service_fees: 50, due: 750, collected: 300, outstanding: 450 });
    expect(rep.deliveries).toHaveLength(1);
    expect(rep).toMatchObject({ supplier_batches: 1, supplier_paid_on_time: 1, supplier_paid_late: 0, supplier_unpaid: 0 });
  });
  it("never allocates a shop batch to a restaurant that said no, or the wrong species", async () => {
    const { a, line } = await setup("لا");
    const shop = await newBatch(a, { source: "محل أسماك" });
    await adminPost(a, "/api/admin/batches/" + shop + "/inspect", { accepted_kg: 25, note: "" });
    expect((await adminPost(a, "/api/admin/allocations", { batch_id: shop, line_id: line.id, kg: 5 })).body.error).toBe("shop_refused");
    const other = await newBatch(a, { species: "بياض" });
    await adminPost(a, "/api/admin/batches/" + other + "/inspect", { accepted_kg: 25, note: "" });
    expect((await adminPost(a, "/api/admin/allocations", { batch_id: other, line_id: line.id, kg: 5 })).body.error).toBe("species_mismatch");
    const souq = await newBatch(a);
    await adminPost(a, "/api/admin/batches/" + souq + "/inspect", { accepted_kg: 25, note: "" });
    expect((await adminPost(a, "/api/admin/allocations", { batch_id: souq, line_id: line.id, kg: 5 })).status).toBe(200);
  });
  it("validates every admin input", async () => {
    const a = await login();
    for (const bad of [batch({ source: "مزرعة" }), batch({ purchased_kg: 0 }), batch({ cost_total: -1 }), batch({ species: "" })]) expect((await adminPost(a, "/api/admin/batches", bad)).status).toBe(400);
    expect((await adminPost(a, "/api/admin/batches", batch({ supplier_id: UNKNOWN }))).status).toBe(404);
    expect((await adminPost(a, "/api/admin/allocations", { batch_id: UNKNOWN, line_id: UNKNOWN, kg: 1 })).status).toBe(404);
    expect((await adminPost(a, "/api/admin/supply-reports", { supplier_id: UNKNOWN, date: "2026-10-12", species: "هامور", spec: "", kg: 5, note: "" })).status).toBe(404);
  });
});

describe("a full week cycle: interest → agreement → order → purchase → distribution → delivery → collection", () => {
  it("runs end to end with the checks in place", async () => {
    const a = await login();
    await post("/api/submit", restaurant({ substitute: "أحيانًا", phone: "0511111111" }));
    await post("/api/submit", restaurant({ restaurant_name: "لا تواصل", phone: "0522222222", wants_contact: "لا" }));
    const r = (await restaurants()).find((x) => x.phone === "0511111111");
    expect(r).toMatchObject({ follow_status: "جديد", substitute_answer: "أحيانًا", sometimes_cases: "" });

    // follow-up and agreement are the team's, after talking to the restaurant
    expect((await adminPost(a, "/api/admin/restaurants/" + r.id + "/follow", { follow_status: "مجهول", admin_note: "" })).status).toBe(400);
    expect((await adminPost(a, "/api/admin/restaurants/" + r.id + "/follow", { follow_status: "تم الاتفاق", admin_note: "يفضل التواصل بعد العصر" })).status).toBe(200);
    const agreement = { fee_terms: "رسوم ثابتة لكل طلب", payment_terms: "آجل نهاية الأسبوع", order_cutoff: "قبل 9 مساءً", delivery_window: "6 – 8 صباحًا", shortage_policy: "يُحاسب على المسلّم فقط", rejection_policy: "يُرفض عند الاستلام ويُخصم", sometimes_cases: "" };
    expect((await adminPost(a, "/api/admin/restaurants/" + r.id + "/agreement", { ...agreement, payment_terms: "شيك" })).status).toBe(400);
    expect((await adminPost(a, "/api/admin/restaurants/" + r.id + "/agreement", agreement)).status).toBe(200);

    // the order is created by the team after the agreement, and starts as new
    expect((await adminPost(a, "/api/admin/needs", { restaurant_id: r.id, ...need({ lines: [{ species: "هامور", spec: "", kg: 20 }] }) })).status).toBe(200);
    let n = (await adminGet(a, "/api/admin/needs")).body[0];
    const line = n.lines[0];
    const shop = (await adminPost(a, "/api/admin/batches", { date: "2026-10-12", source: "محل أسماك", supplier_id: null, species: "هامور", spec: "", purchased_kg: 10, cost_total: 500, note: "" })).body.id;
    const souq = (await adminPost(a, "/api/admin/batches", { date: "2026-10-12", source: "حراج جازان", supplier_id: null, species: "هامور", spec: "", purchased_kg: 18, cost_total: 720, note: "" })).body.id;
    await adminPost(a, "/api/admin/batches/" + shop + "/inspect", { accepted_kg: 10, note: "" });
    await adminPost(a, "/api/admin/batches/" + souq + "/inspect", { accepted_kg: 16, note: "2 كجم مرفوضة بالفحص" });
    expect((await adminPost(a, "/api/admin/allocations", { batch_id: souq, line_id: line.id, kg: 16 })).body.error).toBe("not_confirmed");
    expect((await adminPost(a, "/api/admin/needs/" + n.id + "/update", { status: "cancelled", service_fee: null, cancel_reason: "" })).status).toBe(400);
    expect((await adminPost(a, "/api/admin/needs/" + n.id + "/update", { status: "confirmed", service_fee: 40, cancel_reason: "" })).status).toBe(200);
    expect((await adminPost(a, "/api/admin/allocations", { batch_id: souq, line_id: line.id, kg: 16 })).status).toBe(200);
    // "sometimes" with no documented cases: no shop fish; once documented, allowed
    expect((await adminPost(a, "/api/admin/allocations", { batch_id: shop, line_id: line.id, kg: 4 })).body.error).toBe("sometimes_undocumented");
    await adminPost(a, "/api/admin/restaurants/" + r.id + "/agreement", { ...agreement, sometimes_cases: "إذا نقص الهامور فقط" });
    expect((await adminPost(a, "/api/admin/allocations", { batch_id: shop, line_id: line.id, kg: 4 })).status).toBe(200);
    expect((await adminPost(a, "/api/admin/allocations", { batch_id: souq, line_id: line.id, kg: 1 })).body.error).toBe("batch_exceeded");

    // delivery with a refusal at the door; delivered + refused never above what was allocated
    n = (await adminGet(a, "/api/admin/needs")).body[0];
    const [aSouq, aShop] = n.lines[0].allocations;
    expect((await adminPost(a, "/api/admin/allocations/" + aSouq.id + "/deliver", { delivered_kg: 15, rejected_kg: 2, note: "" })).status).toBe(404);
    expect((await adminPost(a, "/api/admin/allocations/" + aSouq.id + "/deliver", { delivered_kg: 15, rejected_kg: 1, note: "حبة غير مطابقة", delivered_at: "2026-10-13T07:15" })).status).toBe(200);
    expect((await adminPost(a, "/api/admin/allocations/" + aShop.id + "/deliver", { delivered_kg: 4, rejected_kg: 0, note: "" })).status).toBe(200);
    await adminPost(a, "/api/admin/needs/" + n.id + "/update", { status: "partial", service_fee: 40, cancel_reason: "" });
    n = (await adminGet(a, "/api/admin/needs")).body[0];
    // charged on delivered weight at actual cost: 15 × 40 + 4 × 50 = 800, plus the fee
    expect(n).toMatchObject({ requested_kg: 20, delivered_kg: 19, rejected_kg: 1, purchase_cost: 800, due: 840, payment_status: "unpaid", fee_terms: "رسوم ثابتة لكل طلب" });
    await adminPost(a, "/api/admin/needs/" + n.id + "/payments", { amount: 500, method: "تحويل", paid_on: "2026-10-13", note: "" });
    const afterPay = (await adminGet(a, "/api/admin/needs")).body[0];
    expect(afterPay).toMatchObject({ payment_status: "partial", order_cutoff: "قبل 9 مساءً", delivery_window: "6 – 8 صباحًا" });
    // the typed delivery time is kept, read as Riyadh time
    expect(new Date(afterPay.lines[0].allocations.find((x) => x.id === aSouq.id).delivered_at).toISOString()).toBe("2026-10-13T04:15:00.000Z");
    expect((await adminPost(a, "/api/admin/allocations/" + aShop.id + "/deliver", { delivered_kg: 1, delivered_at: "13/10 7am" })).status).toBe(400);
    await adminPost(a, "/api/admin/needs/" + n.id + "/payments", { amount: 340, method: "نقد", paid_on: "2026-10-14", note: "" });
    expect((await adminGet(a, "/api/admin/needs")).body[0].payment_status).toBe("paid");

    // running costs and the week summary: fish cost passed to the restaurant is not income
    expect((await adminPost(a, "/api/admin/expenses", { date: "2026-10-12", category: "نقل", amount: 0, note: "" })).status).toBe(400);
    expect((await adminPost(a, "/api/admin/expenses", { date: "2026-10-12", category: "ثلج وتبريد", amount: 25, note: "" })).status).toBe(200);
    const rep = (await adminGet(a, "/api/admin/report")).body;
    expect(rep).toMatchObject({ requested_kg: 20, delivered_kg: 19, coverage_pct: 95, rejected_kg: 2, rejected_at_delivery_kg: 1, cost_to_restaurants: 800, service_fees: 40, due: 840, collected: 840, outstanding: 0, operating_costs: 25, estimated_margin: 15 });

    // every change is in the log; the log and the summary are admin only
    const log = (await adminGet(a, "/api/admin/audit")).body;
    expect(log.map((x) => x.action)).toEqual(expect.arrayContaining(["/admin/restaurants/:id/agreement", "/admin/allocations", "/admin/needs/:id/payments", "/admin/expenses"]));
    for (const u of ["/api/admin/audit", "/api/admin/expenses", "/api/admin/report"]) expect((await request(app).get(u)).status).toBe(401);
  });
});

describe("ordering from a supplier", () => {
  it("records the order, then receiving it creates the purchase from that supplier", async () => {
    const a = await login();
    await adminPost(a, "/api/admin/suppliers", supplier());
    await adminPost(a, "/api/admin/suppliers", supplier({ name: "محل الساحل", phone: "0533330000", kind: "محل أسماك" }));
    const [shop, fisher] = (await repo.listLeads()).fish;
    const order = (o) => ({ supplier_id: fisher.id, date: "2026-10-12", species: "هامور", kg: 30, price_per_kg: 40, note: "", ...o });
    expect((await post("/api/admin/supplier-orders", order()).set("Cookie", a.cookie)).status).toBe(403);
    expect((await adminPost(a, "/api/admin/supplier-orders", order({ kg: 0 }))).status).toBe(400);
    expect((await adminPost(a, "/api/admin/supplier-orders", order({ supplier_id: UNKNOWN }))).status).toBe(404);
    const id = (await adminPost(a, "/api/admin/supplier-orders", order())).body.id;
    const id2 = (await adminPost(a, "/api/admin/supplier-orders", order({ supplier_id: shop.id }))).body.id;
    let list = (await adminGet(a, "/api/admin/supplier-orders")).body;
    expect(list.find((x) => x.id === id)).toMatchObject({ status: "requested", supplier_name: "سالم", kg: 30, price_per_kg: 40 });

    expect((await adminPost(a, "/api/admin/supplier-orders/" + id + "/receive", { date: "2026-10-12", purchased_kg: 28, cost_total: 1120, supplier_due_on: "2026-10-14" })).status).toBe(200);
    expect((await adminPost(a, "/api/admin/supplier-orders/" + id + "/receive", { date: "2026-10-12", purchased_kg: 28, cost_total: 1120 })).body.error).toBe("not_open");
    expect((await adminPost(a, "/api/admin/supplier-orders/" + id2 + "/receive", { date: "2026-10-12", purchased_kg: 10, cost_total: 500 })).status).toBe(200);
    const batches = (await adminGet(a, "/api/admin/batches")).body;
    expect(batches.find((b) => b.supplier_id === fisher.id)).toMatchObject({ source: "مورد مباشر", purchased_kg: 28, cost_total: 1120, supplier_due_on: "2026-10-14", accepted_kg: null });
    expect(batches.find((b) => b.supplier_id === shop.id)).toMatchObject({ source: "محل أسماك" });
    list = (await adminGet(a, "/api/admin/supplier-orders")).body;
    expect(list.find((x) => x.id === id).status).toBe("received");

    const id3 = (await adminPost(a, "/api/admin/supplier-orders", order())).body.id;
    expect((await adminPost(a, "/api/admin/supplier-orders/" + id3 + "/cancel")).status).toBe(200);
    expect((await adminPost(a, "/api/admin/supplier-orders/" + id3 + "/receive", { date: "2026-10-12", purchased_kg: 1, cost_total: 1 })).body.error).toBe("not_open");
    expect((await request(app).get("/api/admin/supplier-orders")).status).toBe(401);
  });
});

describe("needs typed in by the team", () => {
  it("are saved for a known restaurant only, without its link", async () => {
    await post("/api/submit", restaurant());
    const a = await login();
    const id = (await restaurants())[0].id;
    expect((await post("/api/admin/needs", { restaurant_id: id, ...need() })).status).toBe(401);
    expect((await adminPost(a, "/api/admin/needs", { restaurant_id: "x", ...need() })).status).toBe(400);
    expect((await adminPost(a, "/api/admin/needs", { restaurant_id: UNKNOWN, ...need() })).status).toBe(404);
    expect((await adminPost(a, "/api/admin/needs", { restaurant_id: id, ...need() })).status).toBe(200);
    expect((await adminGet(a, "/api/admin/needs")).body[0]).toMatchObject({ restaurant_name: "مطعم البحر", requested_kg: 30, status: "new" });
  });
});

describe("suppliers are internal", () => {
  it("are added by the team only, keeping the one-phone rule", async () => {
    expect((await post("/api/admin/suppliers", supplier())).status).toBe(401);
    const a = await login();
    expect((await post("/api/admin/suppliers", supplier()).set("Cookie", a.cookie)).status).toBe(403);
    expect((await adminPost(a, "/api/admin/suppliers", supplier({ kind: "تاجر" }))).status).toBe(400);
    expect((await adminPost(a, "/api/admin/suppliers", supplier())).status).toBe(200);
    expect((await post("/api/submit", restaurant({ phone: "0598765432" }))).status).toBe(409);
    expect((await adminPost(a, "/api/admin/suppliers", supplier({ phone: "0512345678" }))).status).toBe(200);
    expect((await post("/api/submit", restaurant())).status).toBe(409);
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
    for (const url of ["/api/admin/leads", "/api/admin/needs", "/api/admin/batches", "/api/admin/supply-reports", "/api/admin/report", "/api/admin/summaries", "/api/admin/session"]) {
      expect((await request(app).get(url)).status).toBe(401);
    }
    for (const url of ["/api/admin/batches", "/api/admin/allocations", "/api/admin/suppliers", "/api/admin/needs/" + UNKNOWN + "/update", "/api/admin/restaurants/" + UNKNOWN + "/link"]) {
      expect((await post(url, {})).status).toBe(401);
    }
  });
  it("rejects a wrong password and a forged cookie, and limits attempts", async () => {
    const forged = Buffer.from(JSON.stringify({ sid: "x", csrf: "y", exp: Date.now() + 60000 })).toString("base64url") + ".AAAA";
    expect((await request(app).get("/api/admin/leads").set("Cookie", "hj_admin=" + forged)).status).toBe(401);
    for (let i = 0; i < 5; i++) expect((await post("/api/admin/login", { password: "wrong" })).status).toBe(401);
    expect((await post("/api/admin/login", { password: PASSWORD })).status).toBe(429);
  });
  it("issues an HttpOnly SameSite=Strict session cookie", async () => {
    const a = await login();
    expect(a.setCookie).toMatch(/HttpOnly/i);
    expect(a.setCookie).toMatch(/SameSite=Strict/i);
    expect((await adminGet(a, "/api/admin/leads")).status).toBe(200);
    expect((await adminGet(a, "/admin")).status).toBe(200);
  });
  it("redirects to HTTPS and marks the cookie Secure with the __Host- prefix in production", async () => {
    const prod = createApp({ config: { ...baseConfig, production: true }, repo, mailer: { notify: async () => {} }, logger: quiet, distDir: "tests/fixtures" });
    const plain = await request(prod).get("/privacy?x=1").set("Host", "hasad.example").set("X-Forwarded-Proto", "http");
    expect(plain.status).toBe(308);
    expect(plain.headers.location).toBe("https://hasad.example/privacy?x=1");
    expect((await request(prod).get("/")).status).toBe(200); // no proxy header: never loop
    const r = await postTo(prod, "/api/admin/login", { password: PASSWORD }).set("X-Forwarded-Proto", "https");
    expect(r.headers["set-cookie"][0]).toMatch(/^__Host-hj_admin=.*Secure/i);
  });
  it("requires the CSRF token for every admin change, and ends the session on logout", async () => {
    const a = await login();
    expect((await post("/api/admin/suppliers", supplier()).set("Cookie", a.cookie).set("X-CSRF-Token", "wrong")).status).toBe(403);
    expect((await post("/api/admin/logout", {}).set("Cookie", a.cookie)).status).toBe(403);
    expect((await adminPost(a, "/api/admin/logout")).status).toBe(200);
    expect((await adminGet(a, "/api/admin/leads")).status).toBe(401);
  });
});

describe("admin edits and deletes records", () => {
  it("edits a restaurant without touching its consent time, and deletes one record only", async () => {
    await post("/api/submit", restaurant());
    await post("/api/submit", restaurant({ phone: "0511111111", restaurant_name: "مطعم ثانٍ" }));
    const a = await login();
    const row = (await restaurants()).find((r) => r.phone === "0512345678");
    const body = restaurant({ restaurant_name: "اسم معدّل", substitute: "لا" }); delete body.consent;
    expect((await adminPost(a, "/api/admin/leads/restaurant/" + row.id + "/update", body)).status).toBe(200);
    const now = (await restaurants()).find((r) => r.id === row.id);
    expect(now).toMatchObject({ restaurant_name: "اسم معدّل", accepts_substitute: false });
    expect(new Date(now.consent_at).getTime()).toBe(new Date(row.consent_at).getTime());
    expect((await adminPost(a, "/api/admin/leads/restaurant/" + row.id + "/update", { ...body, phone: "0511111111" })).status).toBe(409);
    expect((await adminPost(a, "/api/admin/leads/other/" + row.id + "/delete")).status).toBe(404);
    expect((await adminPost(a, "/api/admin/leads/restaurant/" + row.id + "/delete")).status).toBe(200);
    expect((await restaurants()).map((r) => r.restaurant_name)).toEqual(["مطعم ثانٍ"]);
  });
});

describe("saved order summaries", () => {
  const summary = (o) => ({ restaurant_name: "مطعم البحر", date: "2026-10-05", lines: [{ species: "هامور", kg: 20, price: 45, source: "حراج جازان" }], service_fee: 60, transport_fee: 40, note: "", ...o });
  it("are admin only: save, list, edit, delete", async () => {
    expect((await request(app).get("/api/admin/summaries")).status).toBe(401);
    const a = await login();
    for (const bad of [summary({ lines: [] }), summary({ service_fee: -1 }), summary({ total: 1000 })]) expect((await adminPost(a, "/api/admin/summaries", bad)).status).toBe(400);
    const saved = await adminPost(a, "/api/admin/summaries", summary());
    expect(saved.status).toBe(200);
    const url = "/api/admin/summaries/" + saved.body.id;
    expect((await adminPost(a, url + "/update", summary({ transport_fee: 55 }))).status).toBe(200);
    expect((await adminGet(a, "/api/admin/summaries")).body[0]).toMatchObject({ transport_fee: 55 });
    expect((await adminPost(a, url + "/delete")).status).toBe(200);
    expect((await adminGet(a, "/api/admin/summaries")).body).toHaveLength(0);
  });
});
