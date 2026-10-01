import { readFile } from "node:fs/promises";
import pg from "pg";
import { PICKUP_LOCATION } from "../shared/constants.js";

export function createPool(databaseUrl) {
  return new pg.Pool({ connectionString: databaseUrl, max: 10, connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000, statement_timeout: 10000 });
}

export async function migrate(pool) {
  await pool.query(await readFile(new URL("./schema.sql", import.meta.url), "utf8"));
}

const item = (r) => ({ id: r.id, species: r.species, required_kg: Number(r.required_kg), counted_kg: Number(r.counted_kg), remaining_kg: Number(r.remaining_kg) });

// Table names and column lists come from this fixed map, never from a request.
const LEADS = {
  restaurant: {
    table: "restaurant_leads", other: "fish_owner_leads",
    columns: ["restaurant_name", "contact_name", "phone", "region", "city", "need_range", "species", "trial_interest", "note"],
    values: (d) => [d.restaurant_name, d.contact_name, d.phone, d.region, d.city, d.need, JSON.stringify(d.species), d.trial === "نعم", d.note]
  },
  fish: {
    table: "fish_owner_leads", other: "restaurant_leads",
    columns: ["kind", "name", "shop_name", "phone", "species", "trial_interest", "delivery_answer", "quality_accepted", "note"],
    values: (d) => [d.kind, d.name, d.shop_name, d.phone, JSON.stringify(d.species), d.trial === "نعم", d.delivery, d.quality, d.note]
  }
};
const marks = (columns) => columns.map((c, i) => "$" + (i + 1) + (c === "species" ? "::jsonb" : ""));

// Every query is parameterized; no SQL is ever built from user text.
export function createRepo(pool) {
  // Runs fn inside one transaction on one connection.
  const tx = async (fn) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  };
  // Serializes everything that touches one phone number.
  const lockPhone = (client, phone) => client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [phone]);

  return {
    // One registration per phone number across both forms:
    //  - same phone, same form → the existing record is updated (no duplicate)
    //  - phone already in the other form → nothing is saved, returns "other"
    saveLead(type, d) {
      const L = LEADS[type], values = L.values(d), m = marks(L.columns);
      return tx(async (client) => {
        await lockPhone(client, d.phone);
        if ((await client.query(`SELECT 1 FROM ${L.other} WHERE phone = $1 LIMIT 1`, [d.phone])).rows.length) return "other";
        const existing = await client.query(`SELECT id FROM ${L.table} WHERE phone = $1 ORDER BY created_at DESC LIMIT 1`, [d.phone]);
        if (existing.rows.length) {
          const sets = L.columns.map((c, i) => c + " = " + m[i]).join(", ");
          await client.query(`UPDATE ${L.table} SET ${sets}, created_at = now() WHERE id = $${L.columns.length + 1}`, [...values, existing.rows[0].id]);
        } else {
          await client.query(`INSERT INTO ${L.table} (${L.columns.join(", ")}) VALUES (${m.join(", ")})`, values);
        }
        return "saved";
      });
    },
    insertRestaurantLead(d) { return this.saveLead("restaurant", d); },
    insertFishLead(d) { return this.saveLead("fish", d); },

    // Admin edit of one record. Returns "saved", "missing", or "other" when the
    // new phone already belongs to a different registration.
    updateLead(type, id, d) {
      const L = LEADS[type];
      if (!L) return Promise.resolve("missing");
      const values = L.values(d), m = marks(L.columns);
      return tx(async (client) => {
        await lockPhone(client, d.phone);
        if ((await client.query(`SELECT 1 FROM ${L.other} WHERE phone = $1 LIMIT 1`, [d.phone])).rows.length) return "other";
        if ((await client.query(`SELECT 1 FROM ${L.table} WHERE phone = $1 AND id <> $2 LIMIT 1`, [d.phone, id])).rows.length) return "other";
        const sets = L.columns.map((c, i) => c + " = " + m[i]).join(", ");
        const r = await client.query(`UPDATE ${L.table} SET ${sets} WHERE id = $${L.columns.length + 1} RETURNING id`, [...values, id]);
        return r.rows.length ? "saved" : "missing";
      });
    },

    async deleteLead(type, id) {
      const L = LEADS[type];
      if (!L) return false;
      const r = await pool.query(`DELETE FROM ${L.table} WHERE id = $1 RETURNING id`, [id]);
      return r.rows.length > 0;
    },

    async listLeads() {
      const [restaurants, fish] = await Promise.all([
        pool.query(`SELECT id, restaurant_name, contact_name, phone, region, city, need_range, species, trial_interest, note, created_at FROM restaurant_leads ORDER BY created_at DESC LIMIT 2000`),
        pool.query(`SELECT id, kind, name, shop_name, phone, species, trial_interest, delivery_answer, quality_accepted, note, supplier_token, created_at FROM fish_owner_leads ORDER BY created_at DESC LIMIT 2000`)
      ]);
      return { restaurants: restaurants.rows, fish: fish.rows };
    },

    // ── saved order summaries (admin only) ──
    async listSummaries() {
      const r = await pool.query(`SELECT id, restaurant_name, to_char(summary_date, 'YYYY-MM-DD') AS date, lines, service_fee, transport_fee, note, created_at FROM order_summaries ORDER BY summary_date DESC, created_at DESC LIMIT 500`);
      return r.rows.map((s) => ({ ...s, service_fee: Number(s.service_fee), transport_fee: Number(s.transport_fee) }));
    },
    async saveSummary(d) {
      const r = await pool.query(
        `INSERT INTO order_summaries (restaurant_name, summary_date, lines, service_fee, transport_fee, note) VALUES ($1, $2, $3::jsonb, $4, $5, $6) RETURNING id`,
        [d.restaurant_name, d.date, JSON.stringify(d.lines), d.service_fee, d.transport_fee, d.note]);
      return r.rows[0].id;
    },
    async updateSummary(id, d) {
      const r = await pool.query(
        `UPDATE order_summaries SET restaurant_name = $2, summary_date = $3, lines = $4::jsonb, service_fee = $5, transport_fee = $6, note = $7 WHERE id = $1 RETURNING id`,
        [id, d.restaurant_name, d.date, JSON.stringify(d.lines), d.service_fee, d.transport_fee, d.note]);
      return r.rows.length > 0;
    },
    async deleteSummary(id) {
      const r = await pool.query(`DELETE FROM order_summaries WHERE id = $1 RETURNING id`, [id]);
      return r.rows.length > 0;
    },

    createDemand(d, token) {
      return tx(async (client) => {
        const r = await client.query(
          `INSERT INTO trial_demands (public_token, title, demand_date, pickup_location, pickup_window) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [token, d.title, d.date, PICKUP_LOCATION, d.pickup_window]
        );
        for (const i of d.items) {
          await client.query(`INSERT INTO trial_demand_items (trial_demand_id, species, required_kg) VALUES ($1, $2, $3)`, [r.rows[0].id, i.species, i.required_kg]);
        }
        return r.rows[0].id;
      });
    },

    // Admin edit: header fields and the item list. Items sent with an id are
    // updated, items without one are added, items left out are removed
    // together with their offers. Counted quantities are kept.
    updateDemand(id, d) {
      return tx(async (client) => {
        const head = await client.query(`UPDATE trial_demands SET title = $2, demand_date = $3, pickup_window = $4 WHERE id = $1 RETURNING id`, [id, d.title, d.date, d.pickup_window]);
        if (!head.rows.length) return false;
        const existing = (await client.query(`SELECT id FROM trial_demand_items WHERE trial_demand_id = $1`, [id])).rows.map((r) => r.id);
        const kept = new Set();
        for (const i of d.items) {
          if (i.id && existing.includes(i.id)) {
            kept.add(i.id);
            await client.query(`UPDATE trial_demand_items SET species = $2, required_kg = $3 WHERE id = $1`, [i.id, i.species, i.required_kg]);
          } else {
            await client.query(`INSERT INTO trial_demand_items (trial_demand_id, species, required_kg) VALUES ($1, $2, $3)`, [id, i.species, i.required_kg]);
          }
        }
        for (const old of existing) if (!kept.has(old)) await client.query(`DELETE FROM trial_demand_items WHERE id = $1`, [old]);
        return true;
      });
    },

    async deleteDemand(id) {
      const r = await pool.query(`DELETE FROM trial_demands WHERE id = $1 RETURNING id`, [id]);
      return r.rows.length > 0;
    },

    async listDemands() {
      const [demands, items, offers] = await Promise.all([
        pool.query(`SELECT id, public_token, title, to_char(demand_date, 'YYYY-MM-DD') AS demand_date, pickup_location, pickup_window, status, created_at FROM trial_demands ORDER BY created_at DESC LIMIT 200`),
        pool.query(`SELECT id, trial_demand_id, species, required_kg, counted_kg, remaining_kg FROM trial_demand_items ORDER BY species`),
        pool.query(`SELECT id, trial_demand_item_id, name, phone, quantity_kg, price_per_kg, note, counted, created_at FROM fish_offers ORDER BY created_at`)
      ]);
      return demands.rows.map((d) => ({
        ...d,
        items: items.rows.filter((i) => i.trial_demand_id === d.id).map((i) => ({
          ...item(i),
          offers: offers.rows.filter((o) => o.trial_demand_item_id === i.id).map((o) => ({ id: o.id, name: o.name, phone: o.phone, quantity_kg: Number(o.quantity_kg), price_per_kg: Number(o.price_per_kg), note: o.note, counted: o.counted, created_at: o.created_at }))
        }))
      }));
    },

    // status: "revoked" closes the public link, "active" opens it again.
    async setDemandStatus(id, status) {
      const r = await pool.query(`UPDATE trial_demands SET status = $2 WHERE id = $1 RETURNING id`, [id, status]);
      return r.rows.length > 0;
    },
    revokeDemand(id) { return this.setDemandStatus(id, "revoked"); },

    // Public view: the aggregated demand only. No restaurant or offer data is selected.
    async demandView(where, params) {
      const d = await pool.query(`SELECT id, title, to_char(demand_date, 'YYYY-MM-DD') AS demand_date, pickup_location, pickup_window FROM trial_demands WHERE status = 'active' AND ${where} ORDER BY created_at DESC LIMIT 1`, params);
      if (!d.rows.length) return null;
      const items = await pool.query(`SELECT id, species, required_kg, counted_kg, remaining_kg FROM trial_demand_items WHERE trial_demand_id = $1 ORDER BY species`, [d.rows[0].id]);
      const { id, title, demand_date, pickup_location, pickup_window } = d.rows[0];
      return { id, view: { title, date: demand_date, pickup_location, pickup_window, items: items.rows.map(item) } };
    },
    async getPublicDemand(token) {
      const d = await this.demandView("public_token = $1", [token]);
      return d ? d.view : null;
    },

    // Offers are saved only for items of the active demand they were sent to,
    // all or nothing. They never change counted_kg.
    saveOffers(client, demandId, d, who) {
      return (async () => {
        const valid = new Set((await client.query(`SELECT id FROM trial_demand_items WHERE trial_demand_id = $1`, [demandId])).rows.map((r) => r.id));
        if (!d.items.every((i) => valid.has(i.item_id))) return false;
        for (const i of d.items) {
          // A registered owner who sends again replaces his own pending offer for that species.
          if (who.leadId) await client.query(`DELETE FROM fish_offers WHERE fish_owner_lead_id = $1 AND trial_demand_item_id = $2 AND counted = false`, [who.leadId, i.item_id]);
          await client.query(
            `INSERT INTO fish_offers (trial_demand_item_id, name, phone, quantity_kg, price_per_kg, note, fish_owner_lead_id) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [i.item_id, who.name, who.phone, i.quantity_kg, i.price_per_kg, d.note, who.leadId || null]
          );
        }
        return true;
      })();
    },

    insertOffers(token, d) {
      return tx(async (client) => {
        const dem = await client.query(`SELECT id FROM trial_demands WHERE public_token = $1 AND status = 'active'`, [token]);
        if (!dem.rows.length) return false;
        return this.saveOffers(client, dem.rows[0].id, d, { name: d.name, phone: d.phone });
      });
    },
    insertOffer(token, o) {
      return this.insertOffers(token, { name: o.name, phone: o.phone, note: o.note, items: [{ item_id: o.item_id, quantity_kg: o.quantity_kg, price_per_kg: o.price_per_kg }] });
    },

    // ── personal supply link of a registered fish owner ──
    async setSupplierToken(id, token) {
      const r = await pool.query(`UPDATE fish_owner_leads SET supplier_token = $2 WHERE id = $1 RETURNING id`, [id, token]);
      return r.rows.length > 0;
    },

    // What the owner sees: his display name, the current active demand, and what he already sent. No phone.
    async getSupplierView(token) {
      const s = await pool.query(`SELECT id, name, shop_name FROM fish_owner_leads WHERE supplier_token = $1`, [token]);
      if (!s.rows.length) return null;
      const d = await this.demandView("true", []);
      let mine = [];
      if (d) {
        const r = await pool.query(
          `SELECT o.trial_demand_item_id AS item_id, o.quantity_kg, o.price_per_kg, o.counted FROM fish_offers o JOIN trial_demand_items i ON i.id = o.trial_demand_item_id
           WHERE o.fish_owner_lead_id = $1 AND i.trial_demand_id = $2 ORDER BY o.created_at`, [s.rows[0].id, d.id]);
        mine = r.rows.map((o) => ({ item_id: o.item_id, quantity_kg: Number(o.quantity_kg), price_per_kg: Number(o.price_per_kg), counted: o.counted }));
      }
      return { name: s.rows[0].shop_name || s.rows[0].name, demand: d ? d.view : null, mine };
    },

    insertSupplierOffers(token, d) {
      return tx(async (client) => {
        const s = await client.query(`SELECT id, name, shop_name, phone FROM fish_owner_leads WHERE supplier_token = $1`, [token]);
        if (!s.rows.length) return false;
        const dem = await client.query(`SELECT id FROM trial_demands WHERE status = 'active' ORDER BY created_at DESC LIMIT 1`);
        if (!dem.rows.length) return false;
        const who = s.rows[0];
        return this.saveOffers(client, dem.rows[0].id, d, { leadId: who.id, name: who.shop_name ? who.shop_name + " · " + who.name : who.name, phone: who.phone });
      });
    },

    // "احتساب ضمن التغطية": counted_kg (and so remaining_kg) changes only through
    // the three admin actions below.
    countOffer(id) {
      return tx(async (client) => {
        const o = await client.query(`UPDATE fish_offers SET counted = true WHERE id = $1 AND counted = false RETURNING trial_demand_item_id, quantity_kg`, [id]);
        if (!o.rows.length) return false;
        await client.query(`UPDATE trial_demand_items SET counted_kg = counted_kg + $2 WHERE id = $1`, [o.rows[0].trial_demand_item_id, o.rows[0].quantity_kg]);
        return true;
      });
    },

    uncountOffer(id) {
      return tx(async (client) => {
        const o = await client.query(`UPDATE fish_offers SET counted = false WHERE id = $1 AND counted = true RETURNING trial_demand_item_id, quantity_kg`, [id]);
        if (!o.rows.length) return false;
        await client.query(`UPDATE trial_demand_items SET counted_kg = GREATEST(counted_kg - $2, 0) WHERE id = $1`, [o.rows[0].trial_demand_item_id, o.rows[0].quantity_kg]);
        return true;
      });
    },

    // Deleting a counted offer takes its quantity back out of the coverage.
    deleteOffer(id) {
      return tx(async (client) => {
        const o = await client.query(`DELETE FROM fish_offers WHERE id = $1 RETURNING trial_demand_item_id, quantity_kg, counted`, [id]);
        if (!o.rows.length) return false;
        if (o.rows[0].counted) await client.query(`UPDATE trial_demand_items SET counted_kg = GREATEST(counted_kg - $2, 0) WHERE id = $1`, [o.rows[0].trial_demand_item_id, o.rows[0].quantity_kg]);
        return true;
      });
    }
  };
}
