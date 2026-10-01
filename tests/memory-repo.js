// In-memory stand-in for server/repo.js with the same contract, for tests and local preview.
import { randomUUID } from "node:crypto";

export function createMemoryRepo() {
  const db = { restaurants: [], fish: [], demands: [], offers: [], summaries: [] };
  const now = () => new Date().toISOString();
  const view = (i) => ({ id: i.id, species: i.species, required_kg: i.required_kg, counted_kg: i.counted_kg, remaining_kg: Math.max(i.required_kg - i.counted_kg, 0) });
  const findItem = (id) => db.demands.flatMap((d) => d.items.map((i) => ({ d, i }))).find((x) => x.i.id === id);

  return {
    db,
    async insertRestaurantLead(d) {
      if (db.fish.some((x) => x.phone === d.phone)) return "other";
      const row = { restaurant_name: d.restaurant_name, contact_name: d.contact_name, phone: d.phone, region: d.region, city: d.city, need_range: d.need, species: d.species, trial_interest: d.trial === "نعم", note: d.note, created_at: now() };
      const old = db.restaurants.find((x) => x.phone === d.phone);
      if (old) Object.assign(old, row); else db.restaurants.unshift({ id: randomUUID(), ...row });
      return "saved";
    },
    async insertFishLead(d) {
      if (db.restaurants.some((x) => x.phone === d.phone)) return "other";
      const row = { kind: d.kind, name: d.name, shop_name: d.shop_name, phone: d.phone, species: d.species, trial_interest: d.trial === "نعم", delivery_answer: d.delivery, quality_accepted: d.quality, note: d.note, created_at: now() };
      const old = db.fish.find((x) => x.phone === d.phone);
      if (old) Object.assign(old, row); else db.fish.unshift({ id: randomUUID(), ...row });
      return "saved";
    },
    async deleteLead(type, id) {
      const list = type === "restaurant" ? db.restaurants : type === "fish" ? db.fish : null;
      const i = list ? list.findIndex((x) => x.id === id) : -1;
      if (i < 0) return false;
      list.splice(i, 1);
      return true;
    },
    async updateLead(type, id, d) {
      const list = type === "restaurant" ? db.restaurants : type === "fish" ? db.fish : null;
      if (!list) return "missing";
      const other = type === "restaurant" ? db.fish : db.restaurants;
      if (other.some((x) => x.phone === d.phone) || list.some((x) => x.phone === d.phone && x.id !== id)) return "other";
      const row = list.find((x) => x.id === id);
      if (!row) return "missing";
      Object.assign(row, type === "restaurant"
        ? { restaurant_name: d.restaurant_name, contact_name: d.contact_name, phone: d.phone, region: d.region, city: d.city, need_range: d.need, species: d.species, trial_interest: d.trial === "نعم", note: d.note }
        : { kind: d.kind, name: d.name, shop_name: d.shop_name, phone: d.phone, species: d.species, trial_interest: d.trial === "نعم", delivery_answer: d.delivery, quality_accepted: d.quality, note: d.note });
      return "saved";
    },
    async listLeads() { return { restaurants: db.restaurants, fish: db.fish }; },
    async listSummaries() { return db.summaries; },
    async saveSummary(d) { const id = randomUUID(); db.summaries.unshift({ id, ...d, created_at: now() }); return id; },
    async updateSummary(id, d) { const s = db.summaries.find((x) => x.id === id); if (s) Object.assign(s, d); return !!s; },
    async deleteSummary(id) { const i = db.summaries.findIndex((x) => x.id === id); if (i >= 0) db.summaries.splice(i, 1); return i >= 0; },
    async createDemand(d, token) {
      const id = randomUUID();
      db.demands.unshift({ id, public_token: token, title: d.title, demand_date: d.date, pickup_location: "حراج جازان", pickup_window: d.pickup_window, status: "active", created_at: now(), items: d.items.map((i) => ({ id: randomUUID(), species: i.species, required_kg: i.required_kg, counted_kg: 0 })) });
      return id;
    },
    async listDemands() {
      return db.demands.map((d) => ({ ...d, items: d.items.map((i) => ({ ...view(i), offers: db.offers.filter((o) => o.trial_demand_item_id === i.id) })) }));
    },
    async setDemandStatus(id, status) {
      const d = db.demands.find((x) => x.id === id);
      if (d) d.status = status;
      return !!d;
    },
    async updateDemand(id, d) {
      const row = db.demands.find((x) => x.id === id);
      if (!row) return false;
      Object.assign(row, { title: d.title, demand_date: d.date, pickup_window: d.pickup_window });
      const next = d.items.map((i) => {
        const old = i.id && row.items.find((x) => x.id === i.id);
        return old ? Object.assign(old, { species: i.species, required_kg: i.required_kg }) : { id: randomUUID(), species: i.species, required_kg: i.required_kg, counted_kg: 0 };
      });
      const keep = new Set(next.map((i) => i.id));
      db.offers = db.offers.filter((o) => keep.has(o.trial_demand_item_id));
      row.items = next;
      return true;
    },
    async deleteDemand(id) {
      const i = db.demands.findIndex((x) => x.id === id);
      if (i < 0) return false;
      const ids = new Set(db.demands[i].items.map((x) => x.id));
      db.offers = db.offers.filter((o) => !ids.has(o.trial_demand_item_id));
      db.demands.splice(i, 1);
      return true;
    },
    async uncountOffer(id) {
      const o = db.offers.find((x) => x.id === id && x.counted);
      if (!o) return false;
      o.counted = false;
      const it = findItem(o.trial_demand_item_id).i;
      it.counted_kg = Math.max(it.counted_kg - o.quantity_kg, 0);
      return true;
    },
    async deleteOffer(id) {
      const i = db.offers.findIndex((x) => x.id === id);
      if (i < 0) return false;
      const [o] = db.offers.splice(i, 1);
      if (o.counted) { const it = findItem(o.trial_demand_item_id).i; it.counted_kg = Math.max(it.counted_kg - o.quantity_kg, 0); }
      return true;
    },
    async getPublicDemand(token) {
      const d = db.demands.find((x) => x.public_token === token && x.status === "active");
      return d ? { title: d.title, date: d.demand_date, pickup_location: d.pickup_location, pickup_window: d.pickup_window, items: d.items.map(view) } : null;
    },
    async insertOffers(token, d, who) {
      const dem = who ? who.demand : db.demands.find((x) => x.public_token === token && x.status === "active");
      if (!dem) return false;
      const ids = new Set(dem.items.map((i) => i.id));
      if (!d.items.every((i) => ids.has(i.item_id))) return false;
      for (const i of d.items) {
        if (who) db.offers = db.offers.filter((o) => !(o.fish_owner_lead_id === who.leadId && o.trial_demand_item_id === i.item_id && !o.counted));
        db.offers.push({ id: randomUUID(), trial_demand_item_id: i.item_id, name: who ? who.name : d.name, phone: who ? who.phone : d.phone, quantity_kg: i.quantity_kg, price_per_kg: i.price_per_kg, note: d.note, counted: false, fish_owner_lead_id: who ? who.leadId : null, created_at: now() });
      }
      return true;
    },
    async insertOffer(token, o) {
      return this.insertOffers(token, { name: o.name, phone: o.phone, note: o.note, items: [{ item_id: o.item_id, quantity_kg: o.quantity_kg, price_per_kg: o.price_per_kg }] });
    },
    async setSupplierToken(id, token) {
      const s = db.fish.find((x) => x.id === id);
      if (s) s.supplier_token = token;
      return !!s;
    },
    async getSupplierView(token) {
      const s = db.fish.find((x) => x.supplier_token && x.supplier_token === token);
      if (!s) return null;
      const dem = db.demands.find((x) => x.status === "active");
      const ids = new Set(dem ? dem.items.map((i) => i.id) : []);
      return {
        name: s.shop_name || s.name,
        demand: dem ? { title: dem.title, date: dem.demand_date, pickup_location: dem.pickup_location, pickup_window: dem.pickup_window, items: dem.items.map(view) } : null,
        mine: db.offers.filter((o) => o.fish_owner_lead_id === s.id && ids.has(o.trial_demand_item_id)).map((o) => ({ item_id: o.trial_demand_item_id, quantity_kg: o.quantity_kg, price_per_kg: o.price_per_kg, counted: o.counted }))
      };
    },
    async insertSupplierOffers(token, d) {
      const s = db.fish.find((x) => x.supplier_token && x.supplier_token === token);
      const dem = db.demands.find((x) => x.status === "active");
      if (!s || !dem) return false;
      return this.insertOffers(null, d, { demand: dem, leadId: s.id, name: s.shop_name ? s.shop_name + " · " + s.name : s.name, phone: s.phone });
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
