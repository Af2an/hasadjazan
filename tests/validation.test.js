import { describe, it, expect } from "vitest";
import { parseSubmit, parseOffer, parseDemand, isToken } from "../server/validation.js";

const restaurant = () => ({ type: "restaurant", restaurant_name: "مطعم البحر", contact_name: "علي", phone: "0512345678", region: "جازان", city: "أبوعريش", need: "30–60 كجم", species: ["هامور", "بياض"], trial: "نعم", note: "" });
const fish = () => ({ type: "fish", kind: "صياد", name: "علي", shop_name: null, phone: "0512345678", species: ["هامور"], trial: "نعم", delivery: "نعم", quality: true, note: "" });
const offer = () => ({ item_id: "3f0e4c1a-8a0e-4b7e-9d59-0d7c1e2f3a4b", name: "علي", phone: "0512345678", quantity_kg: 40, price_per_kg: 45, note: "" });

describe("submit validation", () => {
  it("accepts valid restaurant and fish payloads", () => {
    expect(parseSubmit(restaurant())).toMatchObject({ type: "restaurant", need: "30–60 كجم" });
    expect(parseSubmit(fish())).toMatchObject({ type: "fish", shop_name: null });
  });
  it("rejects unknown type and unexpected fields", () => {
    expect(parseSubmit({ ...restaurant(), type: "admin" })).toBeNull();
    expect(parseSubmit({ ...restaurant(), role: "admin" })).toBeNull();
    expect(parseSubmit({ ...fish(), price: 5 })).toBeNull();
    expect(parseSubmit(null)).toBeNull();
    expect(parseSubmit("x")).toBeNull();
  });
  it("accepts only Saudi mobile numbers 05XXXXXXXX", () => {
    for (const phone of ["512345678", "05123456789", "0412345678", "+966512345678", "05١٢٣٤٥٦٧٨", "", 512345678]) {
      expect(parseSubmit({ ...restaurant(), phone })).toBeNull();
    }
  });
  it("checks region, need, trial and delivery against fixed lists", () => {
    expect(parseSubmit({ ...restaurant(), region: "دبي" })).toBeNull();
    expect(parseSubmit({ ...restaurant(), need: "أقل من 30 كجم" })).toBeNull();
    expect(parseSubmit({ ...restaurant(), need: "أقل من 29 كجم" })).not.toBeNull();
    expect(parseSubmit({ ...restaurant(), trial: "ربما" })).toBeNull();
    expect(parseSubmit({ ...fish(), delivery: "من الفجر الى 7 صباحا فقط" })).toBeNull();
    expect(parseSubmit({ ...fish(), delivery: "لا" })).not.toBeNull();
  });
  it("requires the quality declaration to be exactly true", () => {
    expect(parseSubmit({ ...fish(), quality: false })).toBeNull();
    expect(parseSubmit({ ...fish(), quality: "true" })).toBeNull();
  });
  it("requires a shop name only for fish shops", () => {
    expect(parseSubmit({ ...fish(), kind: "محل أسماك" })).toBeNull();
    expect(parseSubmit({ ...fish(), kind: "محل أسماك", shop_name: "أسماك الساحل" })).toMatchObject({ shop_name: "أسماك الساحل" });
    expect(parseSubmit({ ...fish(), shop_name: "يُتجاهل" }).shop_name).toBeNull();
  });
  it("limits text lengths and species", () => {
    expect(parseSubmit({ ...restaurant(), restaurant_name: "م".repeat(121) })).toBeNull();
    expect(parseSubmit({ ...restaurant(), city: "م".repeat(81) })).toBeNull();
    expect(parseSubmit({ ...restaurant(), note: "م".repeat(601) })).toBeNull();
    expect(parseSubmit({ ...restaurant(), species: [] })).toBeNull();
    expect(parseSubmit({ ...restaurant(), species: ["م".repeat(41)] })).toBeNull();
    expect(parseSubmit({ ...restaurant(), species: Array.from({ length: 21 }, (x, i) => "صنف" + i) })).toBeNull();
    expect(parseSubmit({ ...restaurant(), species: ["هامور", "هامور"] }).species).toEqual(["هامور"]);
    expect(parseSubmit({ ...restaurant(), restaurant_name: "   " })).toBeNull();
  });
  it("keeps HTML as inert text and strips control characters", () => {
    const d = parseSubmit({ ...restaurant(), restaurant_name: "<script>alert(1)</script>", note: "<img src=x onerror=alert(1)>\u0000\nسطر" });
    expect(d.restaurant_name).toBe("<script>alert(1)</script>");
    expect(d.note).toBe("<img src=x onerror=alert(1)>\nسطر");
  });
});

describe("offer validation", () => {
  it("accepts a valid offer", () => expect(parseOffer(offer())).toMatchObject({ quantity_kg: 40, price_per_kg: 45 }));
  it("accepts only positive numbers for quantity and price", () => {
    for (const bad of [0, -1, "40", null, Infinity, 1e9]) {
      expect(parseOffer({ ...offer(), quantity_kg: bad })).toBeNull();
      expect(parseOffer({ ...offer(), price_per_kg: bad })).toBeNull();
    }
  });
  it("rejects bad item ids and unexpected fields", () => {
    expect(parseOffer({ ...offer(), item_id: "1" })).toBeNull();
    expect(parseOffer({ ...offer(), counted: true })).toBeNull();
  });
});

describe("demand validation", () => {
  const demand = () => ({ date: "2026-10-05", pickup_window: "5:30 – 6:30 صباحًا", items: [{ species: "هامور", required_kg: 120 }] });
  it("accepts a valid demand", () => expect(parseDemand(demand())).not.toBeNull());
  it("rejects bad dates, empty items, duplicates and non-positive quantities", () => {
    expect(parseDemand({ ...demand(), date: "2026-02-31" })).toBeNull();
    expect(parseDemand({ ...demand(), date: "05/10/2026" })).toBeNull();
    expect(parseDemand({ ...demand(), items: [] })).toBeNull();
    expect(parseDemand({ ...demand(), items: [{ species: "هامور", required_kg: 0 }] })).toBeNull();
    expect(parseDemand({ ...demand(), items: [{ species: "هامور", required_kg: 5 }, { species: "هامور", required_kg: 6 }] })).toBeNull();
    expect(parseDemand({ ...demand(), pickup_location: "مكان آخر" })).toBeNull();
  });
});

describe("trial token shape", () => {
  it("accepts only 256-bit base64url tokens", () => {
    expect(isToken("A".repeat(43))).toBe(true);
    expect(isToken("1")).toBe(false);
    expect(isToken("A".repeat(42) + "/")).toBe(false);
  });
});
