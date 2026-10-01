// In-memory stand-in for server/repo.js with the same contract, for tests and local preview.
import { randomUUID } from "node:crypto";

export function createMemoryRepo() {
  const db = { restaurants: [], fish: [], demands: [], offers: [] };
  const now = () => new Date().toISOString();
  const view = (i) => ({ id: i.id, species: i.species, required_kg: i.required_kg, counted_kg: i.counted_kg, remaining_kg: Math.max(i.required_kg - i.counted_kg, 0) });
  const findItem = (id) => db.demands.flatMap((d) => d.items.map((i) => ({ d, i }))).find((x) => x.i.id === id);

  return {
    db,
    async insertRestaurantLead(d) {
      db.restaurants.unshift({ id: randomUUID(), restaurant_name: d.restaurant_name, contact_name: d.contact_name, phone: d.phone, region: d.region, city: d.city, need_range: d.need, species: d.species, trial_interest: d.trial === "نعم", note: d.note, created_at: now() });
    },
    async insertFishLead(d) {
      db.fish.unshift({ id: randomUUID(), kind: d.kind, name: d.name, shop_name: d.shop_name, phone: d.phone, species: d.species, trial_interest: d.trial === "نعم", delivery_answer: d.delivery, quality_accepted: d.quality, note: d.note, created_at: now() });
    },
    async listLeads() { return { restaurants: db.restaurants, fish: db.fish }; },
    async createDemand(d, token) {
      const id = randomUUID();
      db.demands.unshift({ id, public_token: token, title: d.title, demand_date: d.date, pickup_location: "حراج جازان", pickup_window: d.pickup_window, status: "active", created_at: now(), items: d.items.map((i) => ({ id: randomUUID(), species: i.species, required_kg: i.required_kg, counted_kg: 0 })) });
      return id;
    },
    async listDemands() {
      return db.demands.map((d) => ({ ...d, items: d.items.map((i) => ({ ...view(i), offers: db.offers.filter((o) => o.trial_demand_item_id === i.id) })) }));
    },
    async revokeDemand(id) {
      const d = db.demands.find((x) => x.id === id);
      if (d) d.status = "revoked";
      return !!d;
    },
    async getPublicDemand(token) {
      const d = db.demands.find((x) => x.public_token === token && x.status === "active");
      return d ? { title: d.title, date: d.demand_date, pickup_location: d.pickup_location, pickup_window: d.pickup_window, items: d.items.map(view) } : null;
    },
    async insertOffer(token, o) {
      const hit = findItem(o.item_id);
      if (!hit || hit.d.public_token !== token || hit.d.status !== "active") return false;
      db.offers.push({ id: randomUUID(), trial_demand_item_id: o.item_id, name: o.name, phone: o.phone, quantity_kg: o.quantity_kg, price_per_kg: o.price_per_kg, note: o.note, counted: false, created_at: now() });
      return true;
    },
    async countOffer(id) {
      const o = db.offers.find((x) => x.id === id && !x.counted);
      if (!o) return false;
      o.counted = true;
      findItem(o.trial_demand_item_id).i.counted_kg += o.quantity_kg;
      return true;
    }
  };
}
