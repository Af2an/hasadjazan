import { describe, it, expect } from "vitest";
import { parseRestaurant, parseNeed, parseBatch, parseAllocation, parseNeedUpdate, parseSupplier, isToken } from "../server/validation.js";

const restaurant = (o) => ({ restaurant_name: "مطعم البحر", phone: "0512345678", city: "أبوعريش", district: "الروضة", map_link: "", species: ["هامور"], kg_from: 20, kg_to: 30, sourcing: ["مورد يوصل لنا"], sourcing_other: "", substitute: "نعم", wants_contact: "نعم", note: "", consent: true, ...o });
const need = (o) => ({ date: "2026-10-12", delivery_location: "أبوعريش", delivery_time: "بعد 10 صباحًا", lines: [{ species: "هامور", spec: "وسط", kg: 10 }], note: "", ...o });

describe("restaurant registration", () => {
  it("needs every answer except the map link and the note, with a valid kg range", () => {
    expect(parseRestaurant(restaurant())).toMatchObject({ substitute: "نعم", map_link: "", note: "" });
    expect(parseRestaurant(restaurant({ kg_from: 30, kg_to: 30 }))).not.toBeNull();
    expect(parseRestaurant(restaurant({ kg_from: 40, kg_to: 30 }))).toBeNull();
    expect(parseRestaurant(restaurant({ kg_from: 0 }))).toBeNull();
    expect(parseRestaurant(restaurant({ species: [] }))).toBeNull();
    expect(parseRestaurant(restaurant({ sourcing: [] }))).toBeNull();
    expect(parseRestaurant(restaurant({ sourcing: ["طريقة أخرى"] }))).toBeNull();
    expect(parseRestaurant(restaurant({ sourcing: ["طريقة أخرى"], sourcing_other: "من قريب" }))).not.toBeNull();
    expect(parseRestaurant(restaurant({ substitute: "أحيانًا" })).substitute).toBe("أحيانًا");
    expect(parseRestaurant(restaurant({ map_link: "javascript:alert(1)" }))).toBeNull();
    expect(parseRestaurant(restaurant({ contact_name: "علي" }))).toBeNull();
    for (const k of ["city", "district", "wants_contact", "substitute"]) { const b = restaurant(); delete b[k]; expect(parseRestaurant(b)).toBeNull(); }
  });
  it("accepts only Saudi mobile numbers 05XXXXXXXX", () => {
    for (const phone of ["512345678", "05123456789", "0412345678", "+966512345678", "05١٢٣٤٥٦٧٨", "", 512345678]) expect(parseRestaurant(restaurant({ phone }))).toBeNull();
  });
  it("checks every choice against its fixed list", () => {
    expect(parseRestaurant(restaurant({ substitute: "ربما" }))).toBeNull();
    expect(parseRestaurant(restaurant({ sourcing: ["شيء"] }))).toBeNull();
    expect(parseRestaurant(restaurant({ kg_to: "25" }))).toBeNull();
    expect(parseRestaurant(restaurant({ consent: "true" }))).toBeNull();
  });
  it("limits lengths, removes duplicate species and keeps HTML as text", () => {
    expect(parseRestaurant(restaurant({ restaurant_name: "م".repeat(121) }))).toBeNull();
    expect(parseRestaurant(restaurant({ district: "   " }))).toBeNull();
    expect(parseRestaurant(restaurant({ species: ["هامور", "هامور"] })).species).toEqual(["هامور"]);
    expect(parseRestaurant(restaurant({ restaurant_name: "<b>x</b>\u0000" })).restaurant_name).toBe("<b>x</b>");
  });
});

describe("needs", () => {
  it("allows the same species in two specs, never the same spec twice", () => {
    expect(parseNeed(need({ lines: [{ species: "هامور", spec: "وسط", kg: 10 }, { species: "هامور", spec: "كبير", kg: 5 }] }))).not.toBeNull();
    expect(parseNeed(need({ lines: [{ species: "هامور", spec: "وسط", kg: 10 }, { species: "هامور", spec: "وسط", kg: 5 }] }))).toBeNull();
  });
  it("needs a real date, a known delivery time, and positive weights", () => {
    for (const bad of [need({ date: "2026-02-30" }), need({ delivery_time: "الآن" }), need({ lines: [] }), need({ lines: [{ species: "هامور", spec: "وسط", kg: -1 }] }), need({ extra: 1 })]) expect(parseNeed(bad)).toBeNull();
    expect(parseNeed(need({ lines: [{ species: "هامور", spec: "وسط", kg: 12.345 }] })).lines[0].kg).toBe(12.35);
  });
});

describe("admin inputs", () => {
  it("validate batches, allocations, status updates and suppliers", () => {
    const b = { date: "2026-10-12", source: "حراج جازان", species: "هامور", purchased_kg: 10, cost_total: 400 };
    expect(parseBatch(b)).toMatchObject({ supplier_id: null, spec: "" });
    expect(parseBatch({ ...b, source: "مزرعة" })).toBeNull();
    expect(parseAllocation({ batch_id: "x", line_id: "y", kg: 1 })).toBeNull();
    expect(parseNeedUpdate({ status: "delivered", service_fee: null, cancel_reason: "" })).not.toBeNull();
    expect(parseNeedUpdate({ status: "paid", service_fee: null, cancel_reason: "" })).toBeNull();
    expect(parseSupplier({ name: "سالم", phone: "0598765432", kind: "استزراع" })).not.toBeNull();
  });
  it("recognizes 256-bit link tokens only", () => {
    expect(isToken("A".repeat(43))).toBe(true);
    expect(isToken("A".repeat(42))).toBe(false);
    expect(isToken("A".repeat(42) + "!")).toBe(false);
  });
});
