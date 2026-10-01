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

  it("rejects non-positive quantities at the database level too", async () => {
    await expect(pg.query(`INSERT INTO trial_demand_items (trial_demand_id, species, required_kg) SELECT id, 'x', -1 FROM trial_demands LIMIT 1`)).rejects.toThrow();
  });
});
