// Runs server/schema.sql and server/repo.js against a real Postgres engine (PGlite, in memory).
import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { createRepo } from "../server/repo.js";

let repo, pg;
const token = "T".repeat(43);

beforeAll(async () => {
  pg = new PGlite();
  const schema = await readFile(new URL("../server/schema.sql", import.meta.url), "utf8");
  await pg.exec(schema);
  await pg.exec(schema); // idempotent: startup runs it on every boot
  const query = async (text, params) => {
    const r = await pg.query(text, params);
    return { rows: r.rows, rowCount: r.rows.length || r.affectedRows || 0 };
  };
  repo = createRepo({ query, connect: async () => ({ query, release() {} }) });
});

describe("repo on Postgres", () => {
  it("stores leads with hostile text untouched and unexecuted", async () => {
    const name = "Robert'); DROP TABLE restaurant_leads;--";
    await repo.insertRestaurantLead({ restaurant_name: name, contact_name: "علي", phone: "0512345678", region: "جازان", city: "أبوعريش", need: "30–60 كجم", species: ["هامور", "عربي"], trial: "نعم", note: "<b>x</b>" });
    await repo.insertFishLead({ kind: "صياد", name: "علي", shop_name: null, phone: "0598765432", species: ["هامور"], trial: "لا", delivery: "نعم", quality: true, note: "" });
    const leads = await repo.listLeads();
    expect(leads.restaurants).toHaveLength(1);
    expect(leads.restaurants[0]).toMatchObject({ restaurant_name: name, need_range: "30–60 كجم", species: ["هامور", "عربي"], trial_interest: true, note: "<b>x</b>" });
    expect(leads.restaurants[0].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(leads.fish[0]).toMatchObject({ kind: "صياد", shop_name: null, trial_interest: false, delivery_answer: "نعم", quality_accepted: true });
  });

  it("keeps one record per phone and never lets a phone sit in both tables", async () => {
    const rest = (o) => ({ restaurant_name: "مطعم", contact_name: "علي", phone: "0511111111", region: "جازان", city: "جازان", need: "30–60 كجم", species: ["هامور"], trial: "نعم", note: "", ...o });
    const fish = (o) => ({ kind: "صياد", name: "سالم", shop_name: null, phone: "0522222222", species: ["بياض"], trial: "نعم", delivery: "نعم", quality: true, note: "", ...o });
    const before = await repo.listLeads();

    expect(await repo.insertRestaurantLead(rest())).toBe("saved");
    expect(await repo.insertRestaurantLead(rest({ restaurant_name: "مطعم محدّث", species: ["عربي", "دنيس"], trial: "لا" }))).toBe("saved");
    let leads = await repo.listLeads();
    const mine = leads.restaurants.filter((r) => r.phone === "0511111111");
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ restaurant_name: "مطعم محدّث", species: ["عربي", "دنيس"], trial_interest: false });
    expect(leads.restaurants).toHaveLength(before.restaurants.length + 1);

    expect(await repo.insertFishLead(fish({ phone: "0511111111" }))).toBe("other");
    expect(await repo.insertFishLead(fish())).toBe("saved");
    expect(await repo.insertFishLead(fish({ name: "سالم محدّث" }))).toBe("saved");
    expect(await repo.insertRestaurantLead(rest({ phone: "0522222222" }))).toBe("other");
    leads = await repo.listLeads();
    expect(leads.fish.filter((r) => r.phone === "0522222222")).toHaveLength(1);
    expect(leads.fish.find((r) => r.phone === "0522222222").name).toBe("سالم محدّث");
    expect(leads.fish.some((r) => r.phone === "0511111111")).toBe(false);
    expect(leads.restaurants.some((r) => r.phone === "0522222222")).toBe(false);
  });

  it("deletes one lead by id from the right table only", async () => {
    const phone = "0544444444";
    await repo.insertRestaurantLead({ restaurant_name: "للحذف", contact_name: "علي", phone, region: "جازان", city: "جازان", need: "30–60 كجم", species: ["هامور"], trial: "نعم", note: "" });
    const before = await repo.listLeads();
    const id = before.restaurants.find((r) => r.phone === phone).id;
    expect(await repo.deleteLead("fish", id)).toBe(false);
    expect(await repo.deleteLead("restaurant_leads; DROP TABLE fish_owner_leads", id)).toBe(false);
    expect(await repo.deleteLead("restaurant", id)).toBe(true);
    expect(await repo.deleteLead("restaurant", id)).toBe(false);
    const after = await repo.listLeads();
    expect(after.restaurants).toHaveLength(before.restaurants.length - 1);
    expect(after.fish).toHaveLength(before.fish.length);
    // the number is free again after deletion
    expect(await repo.insertFishLead({ kind: "صياد", name: "سالم", shop_name: null, phone, species: ["بياض"], trial: "نعم", delivery: "نعم", quality: true, note: "" })).toBe("saved");
  });

  it("creates a demand and exposes only the aggregated view by token", async () => {
    await repo.createDemand({ title: "احتياج حصاد جازان للتجربة", date: "2026-10-05", pickup_window: "5:30 – 6:30 صباحًا", items: [{ species: "هامور", required_kg: 120 }, { species: "بياض", required_kg: 85.5 }] }, token);
    const d = await repo.getPublicDemand(token);
    expect(Object.keys(d).sort()).toEqual(["date", "items", "pickup_location", "pickup_window", "title"]);
    expect(d.pickup_location).toBe("حراج جازان");
    expect(d.items).toHaveLength(2);
    expect(d.items.find((i) => i.species === "بياض")).toMatchObject({ required_kg: 85.5, counted_kg: 0, remaining_kg: 85.5 });
    expect(await repo.getPublicDemand("X".repeat(43))).toBeNull();
  });

  it("saves an offer without touching the remaining quantity, then counts it once", async () => {
    const item = (await repo.getPublicDemand(token)).items.find((i) => i.species === "هامور");
    const offer = { item_id: item.id, name: "علي الحربي", phone: "0598765432", quantity_kg: 40.25, price_per_kg: 45, note: "" };
    expect(await repo.insertOffer("X".repeat(43), offer)).toBe(false);
    expect(await repo.insertOffer(token, offer)).toBe(true);
    expect((await repo.getPublicDemand(token)).items.find((i) => i.id === item.id).remaining_kg).toBe(120);

    const admin = (await repo.listDemands())[0];
    const saved = admin.items.find((i) => i.id === item.id).offers[0];
    expect(saved).toMatchObject({ name: "علي الحربي", quantity_kg: 40.25, price_per_kg: 45, counted: false });

    expect(await repo.countOffer(saved.id)).toBe(true);
    expect(await repo.countOffer(saved.id)).toBe(false);
    expect((await repo.getPublicDemand(token)).items.find((i) => i.id === item.id)).toMatchObject({ counted_kg: 40.25, remaining_kg: 79.75 });
    expect(await repo.countOffer("3f0e4c1a-8a0e-4b7e-9d59-0d7c1e2f3a4b")).toBe(false);
  });

  it("never lets the remaining quantity go below zero", async () => {
    const item = (await repo.getPublicDemand(token)).items.find((i) => i.species === "بياض");
    await repo.insertOffer(token, { item_id: item.id, name: "سالم", phone: "0598765432", quantity_kg: 200, price_per_kg: 30, note: "" });
    const offer = (await repo.listDemands())[0].items.find((i) => i.id === item.id).offers[0];
    await repo.countOffer(offer.id);
    expect((await repo.getPublicDemand(token)).items.find((i) => i.id === item.id)).toMatchObject({ counted_kg: 200, remaining_kg: 0 });
  });

  it("revokes a link: no view and no new offers", async () => {
    const admin = (await repo.listDemands())[0];
    expect(await repo.revokeDemand(admin.id)).toBe(true);
    expect(await repo.getPublicDemand(token)).toBeNull();
    expect(await repo.insertOffer(token, { item_id: admin.items[0].id, name: "علي", phone: "0598765432", quantity_kg: 5, price_per_kg: 5, note: "" })).toBe(false);
    expect((await repo.listDemands())[0].status).toBe("revoked");
  });

  it("lets the admin edit a lead without breaking the one-phone rule", async () => {
    const base = { restaurant_name: "للتعديل", contact_name: "علي", phone: "0555555555", region: "جازان", city: "جازان", need: "30–60 كجم", species: ["هامور"], trial: "نعم", note: "" };
    await repo.insertRestaurantLead(base);
    await repo.insertRestaurantLead({ ...base, phone: "0566666666", restaurant_name: "آخر" });
    const row = (await repo.listLeads()).restaurants.find((r) => r.phone === "0555555555");
    expect(await repo.updateLead("restaurant", row.id, { ...base, restaurant_name: "بعد التعديل", species: ["عربي"], trial: "لا", phone: "0557777777" })).toBe("saved");
    const now = (await repo.listLeads()).restaurants.find((r) => r.id === row.id);
    expect(now).toMatchObject({ restaurant_name: "بعد التعديل", species: ["عربي"], trial_interest: false, phone: "0557777777" });
    expect(new Date(now.created_at).getTime()).toBe(new Date(row.created_at).getTime());
    expect(await repo.updateLead("restaurant", row.id, { ...base, phone: "0566666666" })).toBe("other");
    expect(await repo.updateLead("restaurant", "3f0e4c1a-8a0e-4b7e-9d59-0d7c1e2f3a4b", { ...base, phone: "0588888888" })).toBe("missing");
    expect(await repo.updateLead("nope", row.id, base)).toBe("missing");
  });

  it("edits a demand, un-counts and deletes offers, re-opens and deletes the demand", async () => {
    const t = "E".repeat(43);
    const id = await repo.createDemand({ title: "للتعديل", date: "2026-10-07", pickup_window: "فجرًا", items: [{ species: "هامور", required_kg: 100 }, { species: "دنيس", required_kg: 30 }] }, t);
    const pub = async () => (await repo.getPublicDemand(t)).items;
    const hamour = (await pub()).find((i) => i.species === "هامور");
    const denis = (await pub()).find((i) => i.species === "دنيس");
    for (const q of [40, 25]) await repo.insertOffer(t, { item_id: hamour.id, name: "علي", phone: "0598765432", quantity_kg: q, price_per_kg: 45, note: "" });
    await repo.insertOffer(t, { item_id: denis.id, name: "علي", phone: "0598765432", quantity_kg: 10, price_per_kg: 45, note: "" });
    const admin = async () => (await repo.listDemands()).find((d) => d.id === id);
    const [o1, o2] = (await admin()).items.find((i) => i.id === hamour.id).offers;
    await repo.countOffer(o1.id); await repo.countOffer(o2.id);
    expect((await pub()).find((i) => i.id === hamour.id).remaining_kg).toBe(35);

    expect(await repo.uncountOffer(o1.id)).toBe(true);
    expect(await repo.uncountOffer(o1.id)).toBe(false);
    expect((await pub()).find((i) => i.id === hamour.id)).toMatchObject({ counted_kg: 25, remaining_kg: 75 });
    expect(await repo.deleteOffer(o2.id)).toBe(true);
    expect(await repo.deleteOffer(o2.id)).toBe(false);
    expect((await pub()).find((i) => i.id === hamour.id)).toMatchObject({ counted_kg: 0, remaining_kg: 100 });

    expect(await repo.updateDemand(id, { title: "معدّل", date: "2026-10-08", pickup_window: "6 صباحًا", items: [{ id: hamour.id, species: "هامور", required_kg: 150 }, { species: "بياض", required_kg: 60 }] })).toBe(true);
    const d = await repo.getPublicDemand(t);
    expect(d).toMatchObject({ title: "معدّل", date: "2026-10-08", pickup_window: "6 صباحًا" });
    expect(d.items.map((i) => [i.species, i.required_kg]).sort()).toEqual([["بياض", 60], ["هامور", 150]]);
    expect((await admin()).items.flatMap((i) => i.offers)).toHaveLength(1); // the removed item's offer went with it
    expect(await repo.updateDemand("3f0e4c1a-8a0e-4b7e-9d59-0d7c1e2f3a4b", { title: "x", date: "2026-10-08", pickup_window: "x", items: [{ species: "x", required_kg: 1 }] })).toBe(false);

    await repo.setDemandStatus(id, "revoked");
    expect(await repo.getPublicDemand(t)).toBeNull();
    expect(await repo.setDemandStatus(id, "active")).toBe(true);
    expect(await repo.getPublicDemand(t)).not.toBeNull();

    expect(await repo.deleteDemand(id)).toBe(true);
    expect(await repo.deleteDemand(id)).toBe(false);
    expect(await repo.getPublicDemand(t)).toBeNull();
    expect((await repo.listDemands()).some((x) => x.id === id)).toBe(false);
  });

  it("personal supply link: no phone exposed, re-sending replaces, counted offers stay", async () => {
    await repo.insertFishLead({ kind: "محل أسماك", name: "سالم", shop_name: "أسماك الساحل", phone: "0577770000", species: ["بياض"], trial: "نعم", delivery: "نعم", quality: true, note: "" });
    const lead = (await repo.listLeads()).fish.find((f) => f.phone === "0577770000");
    const st = "S".repeat(43);
    expect(await repo.getSupplierView(st)).toBeNull();
    expect(await repo.setSupplierToken(lead.id, st)).toBe(true);
    expect((await repo.listLeads()).fish.find((f) => f.id === lead.id).supplier_token).toBe(st);

    const dt = "P".repeat(43);
    const demandId = await repo.createDemand({ title: "الأحدث", date: "2026-10-09", pickup_window: "فجرًا", items: [{ species: "هامور", required_kg: 100 }, { species: "بياض", required_kg: 50 }] }, dt);
    const view = await repo.getSupplierView(st);
    expect(view.name).toBe("أسماك الساحل");
    expect(view.demand.title).toBe("الأحدث");
    expect(JSON.stringify(view)).not.toContain("0577770000");
    const [a, b] = view.demand.items;

    expect(await repo.insertSupplierOffers(st, { note: "", items: [{ item_id: a.id, quantity_kg: 30, price_per_kg: 40 }, { item_id: "3f0e4c1a-8a0e-4b7e-9d59-0d7c1e2f3a4b", quantity_kg: 1, price_per_kg: 1 }] })).toBe(false);
    expect((await repo.getSupplierView(st)).mine).toHaveLength(0);
    expect(await repo.insertSupplierOffers(st, { note: "", items: [{ item_id: a.id, quantity_kg: 30, price_per_kg: 40 }, { item_id: b.id, quantity_kg: 20, price_per_kg: 25 }] })).toBe(true);
    const admin = async () => (await repo.listDemands()).find((d) => d.id === demandId).items;
    const offerA = (await admin()).find((i) => i.id === a.id).offers[0];
    expect(offerA).toMatchObject({ name: "أسماك الساحل · سالم", phone: "0577770000", quantity_kg: 30 });

    await repo.countOffer(offerA.id);
    expect(await repo.insertSupplierOffers(st, { note: "", items: [{ item_id: a.id, quantity_kg: 10, price_per_kg: 40 }, { item_id: b.id, quantity_kg: 45, price_per_kg: 26 }] })).toBe(true);
    const items = await admin();
    expect(items.find((i) => i.id === a.id).offers.map((o) => [o.quantity_kg, o.counted])).toEqual([[30, true], [10, false]]);
    expect(items.find((i) => i.id === b.id).offers.map((o) => o.quantity_kg)).toEqual([45]);
    expect((await repo.getSupplierView(st)).mine).toHaveLength(3);

    expect(await repo.insertOffers(dt, { name: "عام", phone: "0511110000", note: "", items: [{ item_id: a.id, quantity_kg: 5, price_per_kg: 9 }, { item_id: b.id, quantity_kg: 6, price_per_kg: 9 }] })).toBe(true);
    expect(await repo.insertOffers(dt, { name: "عام", phone: "0511110000", note: "", items: [{ item_id: "3f0e4c1a-8a0e-4b7e-9d59-0d7c1e2f3a4b", quantity_kg: 5, price_per_kg: 9 }] })).toBe(false);

    await repo.deleteLead("fish", lead.id);
    expect(await repo.getSupplierView(st)).toBeNull();
    expect((await admin()).find((i) => i.id === b.id).offers.length).toBe(2); // offers stay after the owner is deleted
    await repo.deleteDemand(demandId);
  });

  it("saves, lists, edits and deletes order summaries", async () => {
    const d = { restaurant_name: "مطعم البحر", date: "2026-10-05", lines: [{ species: "هامور", kg: 20.5, price: 45, source: "حراج جازان" }], service_fee: 60, transport_fee: 40.5, note: "ملاحظة" };
    const id = await repo.saveSummary(d);
    await repo.saveSummary({ ...d, restaurant_name: "أقدم", date: "2026-10-01" });
    let list = await repo.listSummaries();
    expect(list.map((s) => s.restaurant_name)).toEqual(["مطعم البحر", "أقدم"]);
    expect(list[0]).toMatchObject({ id, date: "2026-10-05", service_fee: 60, transport_fee: 40.5, note: "ملاحظة", lines: [{ species: "هامور", kg: 20.5, price: 45, source: "حراج جازان" }] });
    expect(await repo.updateSummary(id, { ...d, restaurant_name: "معدّل", lines: [{ species: "بياض", kg: 5, price: 30, source: "" }] })).toBe(true);
    expect((await repo.listSummaries()).find((s) => s.id === id)).toMatchObject({ restaurant_name: "معدّل", lines: [{ species: "بياض", kg: 5, price: 30, source: "" }] });
    expect(await repo.updateSummary("3f0e4c1a-8a0e-4b7e-9d59-0d7c1e2f3a4b", d)).toBe(false);
    expect(await repo.deleteSummary(id)).toBe(true);
    expect(await repo.deleteSummary(id)).toBe(false);
    expect(await repo.listSummaries()).toHaveLength(1);
  });

  it("rejects non-positive quantities at the database level too", async () => {
    await expect(pg.query(`INSERT INTO trial_demand_items (trial_demand_id, species, required_kg) SELECT id, 'x', -1 FROM trial_demands LIMIT 1`)).rejects.toThrow();
  });
});
