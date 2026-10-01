import { readFile } from "node:fs/promises";
import pg from "pg";
import { PICKUP_LOCATION } from "../shared/constants.js";

// DATE columns come back as plain "YYYY-MM-DD" strings, not JS dates.
pg.types.setTypeParser(1082, (v) => v);

export function createPool(databaseUrl) {
  return new pg.Pool({ connectionString: databaseUrl, max: 10, connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000, statement_timeout: 10000 });
}

export async function migrate(pool) {
  await pool.query(await readFile(new URL("./schema.sql", import.meta.url), "utf8"));
}

const item = (r) => ({ id: r.id, species: r.species, required_kg: Number(r.required_kg), counted_kg: Number(r.counted_kg), remaining_kg: Number(r.remaining_kg) });

// Every query is parameterized; no SQL is ever built from user text.
export function createRepo(pool) {
  return {
    async insertRestaurantLead(d) {
      await pool.query(
        `INSERT INTO restaurant_leads (restaurant_name, contact_name, phone, region, city, need_range, species, trial_interest, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`,
        [d.restaurant_name, d.contact_name, d.phone, d.region, d.city, d.need, JSON.stringify(d.species), d.trial === "نعم", d.note]
      );
    },

    async insertFishLead(d) {
      await pool.query(
        `INSERT INTO fish_owner_leads (kind, name, shop_name, phone, species, trial_interest, delivery_answer, quality_accepted, note)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)`,
        [d.kind, d.name, d.shop_name, d.phone, JSON.stringify(d.species), d.trial === "نعم", d.delivery, d.quality, d.note]
      );
    },

    async listLeads() {
      const [restaurants, fish] = await Promise.all([
        pool.query(`SELECT id, restaurant_name, contact_name, phone, region, city, need_range, species, trial_interest, note, created_at FROM restaurant_leads ORDER BY created_at DESC LIMIT 2000`),
        pool.query(`SELECT id, kind, name, shop_name, phone, species, trial_interest, delivery_answer, quality_accepted, note, created_at FROM fish_owner_leads ORDER BY created_at DESC LIMIT 2000`)
      ]);
      return { restaurants: restaurants.rows, fish: fish.rows };
    },

    async createDemand(d, token) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const r = await client.query(
          `INSERT INTO trial_demands (public_token, title, demand_date, pickup_location, pickup_window) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [token, d.title, d.date, PICKUP_LOCATION, d.pickup_window]
        );
        for (const i of d.items) {
          await client.query(`INSERT INTO trial_demand_items (trial_demand_id, species, required_kg) VALUES ($1, $2, $3)`, [r.rows[0].id, i.species, i.required_kg]);
        }
        await client.query("COMMIT");
        return r.rows[0].id;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    },

    async listDemands() {
      const [demands, items, offers] = await Promise.all([
        pool.query(`SELECT id, public_token, title, demand_date, pickup_location, pickup_window, status, created_at FROM trial_demands ORDER BY created_at DESC LIMIT 200`),
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

    async revokeDemand(id) {
      const r = await pool.query(`UPDATE trial_demands SET status = 'revoked' WHERE id = $1`, [id]);
      return r.rowCount > 0;
    },

    // Public view: the aggregated demand only. No restaurant or offer data is selected.
    async getPublicDemand(token) {
      const d = await pool.query(`SELECT id, title, demand_date, pickup_location, pickup_window FROM trial_demands WHERE public_token = $1 AND status = 'active'`, [token]);
      if (!d.rows.length) return null;
      const items = await pool.query(`SELECT id, species, required_kg, counted_kg, remaining_kg FROM trial_demand_items WHERE trial_demand_id = $1 ORDER BY species`, [d.rows[0].id]);
      const { title, demand_date, pickup_location, pickup_window } = d.rows[0];
      return { title, date: demand_date, pickup_location, pickup_window, items: items.rows.map(item) };
    },

    // Saved only when the item belongs to the active demand behind this token. Never changes counted_kg.
    async insertOffer(token, d) {
      const r = await pool.query(
        `INSERT INTO fish_offers (trial_demand_item_id, name, phone, quantity_kg, price_per_kg, note)
         SELECT i.id, $3, $4, $5, $6, $7
         FROM trial_demand_items i JOIN trial_demands t ON t.id = i.trial_demand_id
         WHERE i.id = $1 AND t.public_token = $2 AND t.status = 'active'
         RETURNING id`,
        [d.item_id, token, d.name, d.phone, d.quantity_kg, d.price_per_kg, d.note]
      );
      return r.rowCount > 0;
    },

    // "احتساب ضمن التغطية": the only place counted_kg (and so remaining_kg) changes.
    async countOffer(id) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const o = await client.query(`UPDATE fish_offers SET counted = true WHERE id = $1 AND counted = false RETURNING trial_demand_item_id, quantity_kg`, [id]);
        if (!o.rowCount) { await client.query("ROLLBACK"); return false; }
        await client.query(`UPDATE trial_demand_items SET counted_kg = counted_kg + $2 WHERE id = $1`, [o.rows[0].trial_demand_item_id, o.rows[0].quantity_kg]);
        await client.query("COMMIT");
        return true;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    }
  };
}
