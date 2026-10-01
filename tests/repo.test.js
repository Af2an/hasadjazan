// Runs server/schema.sql and server/repo.js against a real Postgres engine (PGlite, in memory).
import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { createTestRepo } from "./pg-repo.js";

describe("schema and data on Postgres", () => {
  it("can be applied again at every start", async () => {
    const { pg } = await createTestRepo();
    await pg.exec(await readFile(new URL("../server/schema.sql", import.meta.url), "utf8"));
  });
  it("stores hostile text untouched and unexecuted", async () => {
    const { repo } = await createTestRepo();
    const name = "Robert'); DROP TABLE restaurant_leads;--";
    await repo.insertRestaurantLead({ restaurant_name: name, phone: "0512345678", city: "أبوعريش", district: "<b>x</b>", map_link: "", species: ["هامور"], kg_from: 5, kg_to: 10, sourcing: ["مورد يوصل لنا"], sourcing_other: "", substitute: "أحيانًا", wants_contact: "لا", note: "" });
    expect((await repo.listLeads()).restaurants[0]).toMatchObject({ restaurant_name: name, district: "<b>x</b>", substitute_answer: "أحيانًا", accepts_substitute: null, trial_interest: false });
  });
  it("keeps records saved by earlier form versions, and a new answer replaces their old fields", async () => {
    const { pg, repo } = await createTestRepo();
    await pg.query("INSERT INTO restaurant_leads (restaurant_name, contact_name, phone, region, city, need_range, species, trial_interest) VALUES ('قديم', 'علي', '0533333333', 'جازان', 'جازان', '30–60 كجم', '[\"هامور\"]'::jsonb, true)");
    expect((await repo.listLeads()).restaurants[0]).toMatchObject({ need_range: "30–60 كجم", location: null, order_token: null });
    await repo.insertRestaurantLead({ restaurant_name: "جديد", phone: "0533333333", city: "أبوعريش", district: "الروضة", map_link: "", species: ["هامور"], kg_from: 5, kg_to: 10, sourcing: ["مورد يوصل لنا"], sourcing_other: "", substitute: "لا", wants_contact: "نعم", note: "" });
    const rows = (await repo.listLeads()).restaurants;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ restaurant_name: "جديد", need_range: null, contact_name: null, accepts_substitute: false });
  });
});
