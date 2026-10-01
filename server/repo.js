import { readFile } from "node:fs/promises";
import pg from "pg";
import { SHOP_SOURCE, DIRECT_SOURCE } from "../shared/constants.js";

export function createPool(databaseUrl) {
  return new pg.Pool({ connectionString: databaseUrl, max: 10, connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000, statement_timeout: 10000 });
}

export async function migrate(pool) {
  await pool.query(await readFile(new URL("./schema.sql", import.meta.url), "utf8"));
}

const num = (v) => (v == null ? null : Number(v));
const round = (n) => Math.round(n * 100) / 100;

// Table names and column lists come from this fixed map, never from a request.
// Trailing columns hold answers of earlier form versions; a new answer clears them.
const LEADS = {
  restaurant: {
    table: "restaurant_leads", other: "fish_owner_leads",
    // accepts_substitute is true only for a plain "yes": "sometimes" is never taken as consent to buy from shops
    columns: ["restaurant_name", "phone", "city", "district", "map_link", "location", "species", "kg_from", "kg_to", "sourcing", "sourcing_other", "substitute_answer", "accepts_substitute", "trial_interest", "note",
      "contact_name", "purchase_method", "quantity_kg", "species_quantities", "frequency", "pickup_time", "priority", "region", "need_range"],
    values: (d) => [d.restaurant_name, d.phone, d.city, d.district, d.map_link, d.city + " - " + d.district, JSON.stringify(d.species), d.kg_from, d.kg_to, JSON.stringify(d.sourcing), d.sourcing_other,
      d.substitute, d.substitute === "نعم" ? true : d.substitute === "لا" ? false : null, d.wants_contact === "نعم", d.note,
      null, null, null, null, null, null, null, null, null]
  },
  // fish owners are suppliers now, entered by the team inside the admin panel only
  fish: {
    table: "fish_owner_leads", other: "restaurant_leads",
    columns: ["kind", "name", "phone", "species", "pickup_location", "availability_time", "note", "quantity_kg", "shop_name", "trial_interest", "delivery_answer", "quality_accepted"],
    values: (d) => [d.kind, d.name, d.phone, JSON.stringify(d.species), d.pickup_location, d.availability_time, d.note, null, null, null, null, null]
  }
};
const JSON_COLUMNS = ["species", "species_quantities", "sourcing"];
const marks = (columns) => columns.map((c, i) => "$" + (i + 1) + (JSON_COLUMNS.includes(c) ? "::jsonb" : ""));

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
    // One record per phone number across restaurants and suppliers:
    //  - same phone, same table → the existing record is updated (no duplicate)
    //  - phone already in the other table → nothing is saved, returns "other"
    saveLead(type, d) {
      const L = LEADS[type], values = L.values(d), m = marks(L.columns);
      return tx(async (client) => {
        await lockPhone(client, d.phone);
        if ((await client.query(`SELECT 1 FROM ${L.other} WHERE phone = $1 LIMIT 1`, [d.phone])).rows.length) return "other";
        const existing = await client.query(`SELECT id FROM ${L.table} WHERE phone = $1 ORDER BY created_at DESC LIMIT 1`, [d.phone]);
        const consent = type === "restaurant" ? ", consent_at = now()" : "";
        if (existing.rows.length) {
          const sets = L.columns.map((c, i) => c + " = " + m[i]).join(", ");
          await client.query(`UPDATE ${L.table} SET ${sets}${consent}, created_at = now() WHERE id = $${L.columns.length + 1}`, [...values, existing.rows[0].id]);
        } else {
          const r = await client.query(`INSERT INTO ${L.table} (${L.columns.join(", ")}) VALUES (${m.join(", ")}) RETURNING id`, values);
          if (consent) await client.query(`UPDATE restaurant_leads SET consent_at = now() WHERE id = $1`, [r.rows[0].id]);
        }
        return "saved";
      });
    },
    insertRestaurantLead(d) { return this.saveLead("restaurant", d); },
    insertSupplier(d) { return this.saveLead("fish", d); },

    // Admin edit of one record. Returns "saved", "missing", or "other" when the
    // new phone already belongs to a different record.
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
        pool.query(`SELECT id, restaurant_name, phone, city, district, map_link, location, species, kg_from::float8 AS kg_from, kg_to::float8 AS kg_to, sourcing, sourcing_other, substitute_answer, accepts_substitute,
          follow_status, admin_note, fee_terms, payment_terms, order_cutoff, delivery_window, shortage_policy, rejection_policy, sometimes_cases, agreed_at,
          trial_interest, note, consent_at, verified_at, order_token, contact_name, quantity_kg::float8 AS quantity_kg, frequency, need_range, created_at
          FROM restaurant_leads ORDER BY created_at DESC LIMIT 2000`),
        pool.query(`SELECT id, kind, name, phone, species, pickup_location, availability_time, note, quantity_kg::float8 AS quantity_kg, shop_name, created_at
          FROM fish_owner_leads ORDER BY created_at DESC LIMIT 2000`)
      ]);
      return { restaurants: restaurants.rows, fish: fish.rows };
    },

    // ── personal order link of a verified restaurant ──
    async setOrderToken(id, token) {
      const r = await pool.query(
        token
          ? `UPDATE restaurant_leads SET order_token = $2, verified_at = COALESCE(verified_at, now()) WHERE id = $1 RETURNING id`
          : `UPDATE restaurant_leads SET order_token = NULL WHERE id = $1 AND $2::text IS NULL RETURNING id`,
        [id, token]);
      return r.rows.length > 0;
    },
    // What the restaurant sees through its link: its own name, location, choice and recent needs. No phone.
    async getRestaurantView(token) {
      const r = await pool.query(`SELECT id, restaurant_name, location, accepts_substitute, substitute_answer, species, order_cutoff, delivery_window FROM restaurant_leads WHERE order_token = $1`, [token]);
      if (!r.rows.length) return null;
      const me = r.rows[0];
      const needs = await pool.query(`SELECT id, to_char(need_date, 'YYYY-MM-DD') AS date, delivery_time, status FROM needs WHERE restaurant_id = $1 ORDER BY need_date DESC, created_at DESC LIMIT 10`, [me.id]);
      const lines = needs.rows.length ? await pool.query(`SELECT need_id, species, spec, kg::float8 AS kg FROM need_lines WHERE need_id = ANY($1::uuid[])`, [needs.rows.map((n) => n.id)]) : { rows: [] };
      return {
        restaurant_name: me.restaurant_name, location: me.location || "", accepts_substitute: me.accepts_substitute, substitute_answer: me.substitute_answer || null,
        usual_species: me.species || [], order_cutoff: me.order_cutoff || "", delivery_window: me.delivery_window || "",
        needs: needs.rows.map((n) => ({ date: n.date, delivery_time: n.delivery_time, status: n.status, lines: lines.rows.filter((l) => l.need_id === n.id).map(({ species, spec, kg }) => ({ species, spec, kg })) }))
      };
    },
    // Returns the new need id, or null when the link is not valid (any more).
    createNeedByToken(token, d) { return this.createNeed("order_token", token, d); },
    createNeedForRestaurant(id, d) { return this.createNeed("id", id, d); },
    // by is one of two fixed column names, never request text
    createNeed(by, key, d) {
      return tx(async (client) => {
        const r = await client.query(by === "id" ? `SELECT id FROM restaurant_leads WHERE id = $1` : `SELECT id FROM restaurant_leads WHERE order_token = $1`, [key]);
        if (!r.rows.length) return null;
        const n = await client.query(`INSERT INTO needs (restaurant_id, need_date, delivery_location, delivery_time, note) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [r.rows[0].id, d.date, d.delivery_location, d.delivery_time, d.note]);
        const id = n.rows[0].id;
        for (const l of d.lines) await client.query(`INSERT INTO need_lines (need_id, species, spec, kg) VALUES ($1, $2, $3, $4)`, [id, l.species, l.spec, l.kg]);
        await client.query(`INSERT INTO need_events (need_id, status) VALUES ($1, 'new')`, [id]);
        return id;
      });
    },

    // ── needs, for the team ──
    async listNeeds() {
      const [needs, lines, allocs, events, pays] = await Promise.all([
        pool.query(`SELECT n.id, to_char(n.need_date, 'YYYY-MM-DD') AS date, n.delivery_location, n.delivery_time, n.note, n.status, n.service_fee::float8 AS service_fee,
          COALESCE((SELECT SUM(amount) FROM payments p WHERE p.need_id = n.id), 0)::float8 AS collected, n.created_at, n.cancel_reason, r.id AS restaurant_id, r.restaurant_name, r.contact_name, r.phone, r.accepts_substitute, r.substitute_answer,
          r.sometimes_cases, r.fee_terms, r.payment_terms, r.order_cutoff, r.delivery_window, r.shortage_policy, r.rejection_policy, r.agreed_at, r.substitute_answer
          FROM needs n JOIN restaurant_leads r ON r.id = n.restaurant_id ORDER BY n.need_date DESC, n.created_at DESC LIMIT 500`),
        pool.query(`SELECT id, need_id, species, spec, kg::float8 AS kg FROM need_lines ORDER BY species, spec`),
        pool.query(`SELECT a.id, a.line_id, a.batch_id, a.kg::float8 AS kg, a.delivered_kg::float8 AS delivered_kg, a.rejected_kg::float8 AS rejected_kg, a.delivery_note, a.delivered_at, b.source, to_char(b.purchase_date, 'YYYY-MM-DD') AS purchase_date,
          CASE WHEN b.purchased_kg > 0 THEN b.cost_total / b.purchased_kg ELSE 0 END::float8 AS cost_per_kg FROM allocations a JOIN batches b ON b.id = a.batch_id ORDER BY a.created_at`),
        pool.query(`SELECT need_id, status, at FROM need_events ORDER BY at`),
        pool.query(`SELECT id, need_id, amount::float8 AS amount, method, to_char(paid_on, 'YYYY-MM-DD') AS paid_on, note FROM payments ORDER BY paid_on, created_at`)
      ]);
      return needs.rows.map((n) => {
        const myLines = lines.rows.filter((l) => l.need_id === n.id).map((l) => {
          const a = allocs.rows.filter((x) => x.line_id === l.id);
          return { ...l, allocations: a, allocated_kg: round(a.reduce((s, x) => s + x.kg, 0)), delivered_kg: round(a.reduce((s, x) => s + (x.delivered_kg || 0), 0)), rejected_kg: round(a.reduce((s, x) => s + (x.rejected_kg || 0), 0)) };
        });
        const all = myLines.flatMap((l) => l.allocations);
        const cost = round(all.reduce((s, x) => s + (x.delivered_kg ?? x.kg) * x.cost_per_kg, 0));
        return {
          ...n, lines: myLines, events: events.rows.filter((e) => e.need_id === n.id), payments: pays.rows.filter((p) => p.need_id === n.id),
          requested_kg: round(myLines.reduce((s, l) => s + l.kg, 0)), allocated_kg: round(myLines.reduce((s, l) => s + l.allocated_kg, 0)),
          delivered_kg: round(myLines.reduce((s, l) => s + l.delivered_kg, 0)), rejected_kg: round(myLines.reduce((s, l) => s + l.rejected_kg, 0)),
          purchase_cost: cost, due: round(cost + (n.service_fee || 0)),
          // payment status is kept apart from the order status
          payment_status: n.collected <= 0 ? "unpaid" : n.collected + 0.005 < cost + (n.service_fee || 0) ? "partial" : "paid"
        };
      });
    },
    updateNeed(id, d) {
      return tx(async (client) => {
        const old = await client.query(`SELECT status FROM needs WHERE id = $1 FOR UPDATE`, [id]);
        if (!old.rows.length) return false;
        await client.query(`UPDATE needs SET status = $2, service_fee = $3, cancel_reason = $4 WHERE id = $1`, [id, d.status, d.service_fee, d.status === "cancelled" ? d.cancel_reason : ""]);
        if (old.rows[0].status !== d.status) await client.query(`INSERT INTO need_events (need_id, status) VALUES ($1, $2)`, [id, d.status]);
        return true;
      });
    },

    // ── restaurants: follow-up and agreement ──
    async setFollowUp(id, d) {
      return (await pool.query(`UPDATE restaurant_leads SET follow_status = $2, admin_note = $3 WHERE id = $1 RETURNING id`, [id, d.follow_status, d.admin_note])).rows.length > 0;
    },
    async setAgreement(id, d) {
      return (await pool.query(`UPDATE restaurant_leads SET fee_terms = $2, payment_terms = $3, shortage_policy = $4, rejection_policy = $5, sometimes_cases = $6, order_cutoff = $7, delivery_window = $8, agreed_at = now() WHERE id = $1 RETURNING id`,
        [id, d.fee_terms, d.payment_terms, d.shortage_policy, d.rejection_policy, d.sometimes_cases, d.order_cutoff, d.delivery_window])).rows.length > 0;
    },
    // ── running costs and the change log ──
    async addExpense(d) {
      await pool.query(`INSERT INTO expenses (spent_on, category, amount, note) VALUES ($1, $2, $3, $4)`, [d.date, d.category, d.amount, d.note]);
    },
    async listExpenses() {
      return (await pool.query(`SELECT id, to_char(spent_on, 'YYYY-MM-DD') AS date, category, amount::float8 AS amount, note FROM expenses ORDER BY spent_on DESC, created_at DESC LIMIT 500`)).rows;
    },
    async deleteExpense(id) {
      return (await pool.query(`DELETE FROM expenses WHERE id = $1 RETURNING id`, [id])).rows.length > 0;
    },
    async addAudit(action, target) {
      await pool.query(`INSERT INTO audit_log (action, target) VALUES ($1, $2)`, [action, target]);
    },
    async listAudit() {
      return (await pool.query(`SELECT at, action, target FROM audit_log ORDER BY id DESC LIMIT 200`)).rows;
    },

    // ── money ──
    async addPayment(needId, d) {
      if (!(await pool.query(`SELECT 1 FROM needs WHERE id = $1`, [needId])).rows.length) return false;
      await pool.query(`INSERT INTO payments (need_id, amount, method, paid_on, note) VALUES ($1, $2, $3, $4, $5)`, [needId, d.amount, d.method, d.paid_on, d.note]);
      return true;
    },
    async deletePayment(id) {
      return (await pool.query(`DELETE FROM payments WHERE id = $1 RETURNING id`, [id])).rows.length > 0;
    },
    async payoutBatch(id, d) {
      return (await pool.query(`UPDATE batches SET supplier_paid_amount = $2, supplier_paid_on = $3 WHERE id = $1 RETURNING id`, [id, d.amount, d.paid_on])).rows.length > 0;
    },

    // ── supplier reports: what is said to be available, not what is secured ──
    async addSupplyReport(d) {
      const s = await pool.query(`SELECT 1 FROM fish_owner_leads WHERE id = $1`, [d.supplier_id]);
      if (!s.rows.length) return null;
      const r = await pool.query(`INSERT INTO supply_reports (supplier_id, report_date, species, spec, kg, note) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [d.supplier_id, d.date, d.species, d.spec, d.kg, d.note]);
      return r.rows[0].id;
    },
    async listSupplyReports() {
      const r = await pool.query(`SELECT s.id, s.supplier_id, f.name AS supplier_name, to_char(s.report_date, 'YYYY-MM-DD') AS date, s.species, s.spec, s.kg::float8 AS kg, s.note
        FROM supply_reports s JOIN fish_owner_leads f ON f.id = s.supplier_id ORDER BY s.report_date DESC, s.created_at DESC LIMIT 300`);
      return r.rows;
    },
    async deleteSupplyReport(id) {
      return (await pool.query(`DELETE FROM supply_reports WHERE id = $1 RETURNING id`, [id])).rows.length > 0;
    },

    // ── orders to suppliers ──
    async createSupplierOrder(d) {
      if (!(await pool.query(`SELECT 1 FROM fish_owner_leads WHERE id = $1`, [d.supplier_id])).rows.length) return null;
      const r = await pool.query(`INSERT INTO supplier_orders (supplier_id, order_date, species, kg, price_per_kg, note) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [d.supplier_id, d.date, d.species, d.kg, d.price_per_kg, d.note]);
      return r.rows[0].id;
    },
    async listSupplierOrders() {
      return (await pool.query(`SELECT o.id, o.supplier_id, f.name AS supplier_name, f.kind AS supplier_kind, f.phone AS supplier_phone, to_char(o.order_date, 'YYYY-MM-DD') AS date, o.species,
        o.kg::float8 AS kg, o.price_per_kg::float8 AS price_per_kg, o.note, o.status, o.batch_id FROM supplier_orders o JOIN fish_owner_leads f ON f.id = o.supplier_id
        ORDER BY o.order_date DESC, o.created_at DESC LIMIT 300`)).rows;
    },
    async cancelSupplierOrder(id) {
      return (await pool.query(`UPDATE supplier_orders SET status = 'cancelled' WHERE id = $1 AND status = 'requested' RETURNING id`, [id])).rows.length > 0;
    },
    // What arrived becomes a purchase batch from that supplier: a shop stays a shop, a fisher or farm is a direct supplier.
    receiveSupplierOrder(id, d) {
      return tx(async (client) => {
        const o = await client.query(`SELECT o.supplier_id, o.species, o.status, f.kind FROM supplier_orders o JOIN fish_owner_leads f ON f.id = o.supplier_id WHERE o.id = $1 FOR UPDATE OF o`, [id]);
        if (!o.rows.length) return "missing";
        if (o.rows[0].status !== "requested") return "not_open";
        const src = o.rows[0].kind === SHOP_SOURCE ? SHOP_SOURCE : DIRECT_SOURCE;
        const b = await client.query(`INSERT INTO batches (purchase_date, source, supplier_id, species, spec, purchased_kg, cost_total, supplier_due_on) VALUES ($1, $2, $3, $4, '', $5, $6, $7) RETURNING id`,
          [d.date, src, o.rows[0].supplier_id, o.rows[0].species, d.purchased_kg, d.cost_total, d.supplier_due_on]);
        await client.query(`UPDATE supplier_orders SET status = 'received', batch_id = $2 WHERE id = $1`, [id, b.rows[0].id]);
        return "ok";
      });
    },

    // ── purchases ──
    async createBatch(d) {
      if (d.supplier_id && !(await pool.query(`SELECT 1 FROM fish_owner_leads WHERE id = $1`, [d.supplier_id])).rows.length) return null;
      const r = await pool.query(`INSERT INTO batches (purchase_date, source, supplier_id, species, spec, purchased_kg, cost_total, note, supplier_due_on) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [d.date, d.source, d.supplier_id, d.species, d.spec, d.purchased_kg, d.cost_total, d.note, d.supplier_due_on]);
      return r.rows[0].id;
    },
    async listBatches() {
      const r = await pool.query(`SELECT b.id, to_char(b.purchase_date, 'YYYY-MM-DD') AS date, b.source, b.supplier_id, f.name AS supplier_name, b.species, b.spec,
        b.purchased_kg::float8 AS purchased_kg, b.cost_total::float8 AS cost_total, to_char(b.supplier_due_on, 'YYYY-MM-DD') AS supplier_due_on,
        to_char(b.supplier_paid_on, 'YYYY-MM-DD') AS supplier_paid_on, b.supplier_paid_amount::float8 AS supplier_paid_amount, b.accepted_kg::float8 AS accepted_kg, b.inspection_note, b.note,
        COALESCE((SELECT SUM(kg) FROM allocations a WHERE a.batch_id = b.id), 0)::float8 AS allocated_kg
        FROM batches b LEFT JOIN fish_owner_leads f ON f.id = b.supplier_id ORDER BY b.purchase_date DESC, b.created_at DESC LIMIT 500`);
      return r.rows.map((b) => ({ ...b, available_kg: b.accepted_kg == null ? 0 : round(b.accepted_kg - b.allocated_kg) }));
    },
    // Accepted weight after inspection; never below what is already allocated. Returns "ok", "missing" or "below_allocated".
    inspectBatch(id, d) {
      return tx(async (client) => {
        const b = await client.query(`SELECT purchased_kg::float8 AS purchased_kg FROM batches WHERE id = $1 FOR UPDATE`, [id]);
        if (!b.rows.length) return "missing";
        if (d.accepted_kg > b.rows[0].purchased_kg) return "above_purchased";
        const used = (await client.query(`SELECT COALESCE(SUM(kg), 0)::float8 AS s FROM allocations WHERE batch_id = $1`, [id])).rows[0].s;
        if (d.accepted_kg < used) return "below_allocated";
        await client.query(`UPDATE batches SET accepted_kg = $2, inspection_note = $3 WHERE id = $1`, [id, d.accepted_kg, d.note]);
        return "ok";
      });
    },
    async deleteBatch(id) {
      if ((await pool.query(`SELECT 1 FROM allocations WHERE batch_id = $1 LIMIT 1`, [id])).rows.length) return "in_use";
      return (await pool.query(`DELETE FROM batches WHERE id = $1 RETURNING id`, [id])).rows.length ? "ok" : "missing";
    },

    // Allocates accepted weight of a batch to one need line. The batch row is locked,
    // so the same kilos can never be allocated twice. Returns "ok" or a reason.
    allocate(d) {
      return tx(async (client) => {
        const b = await client.query(`SELECT source, species, accepted_kg::float8 AS accepted_kg FROM batches WHERE id = $1 FOR UPDATE`, [d.batch_id]);
        if (!b.rows.length) return "missing";
        const batch = b.rows[0];
        if (batch.accepted_kg == null) return "not_inspected";
        const l = await client.query(`SELECT l.species, l.kg::float8 AS kg, n.status, r.accepts_substitute, r.substitute_answer, r.sometimes_cases FROM need_lines l JOIN needs n ON n.id = l.need_id
          JOIN restaurant_leads r ON r.id = n.restaurant_id WHERE l.id = $1 FOR UPDATE OF l`, [d.line_id]);
        if (!l.rows.length) return "missing";
        const line = l.rows[0];
        if (line.status === "cancelled") return "cancelled";
        if (line.status === "new") return "not_confirmed";
        if (line.species !== batch.species) return "species_mismatch";
        const shopOk = line.accepts_substitute === true || (line.substitute_answer === "أحيانًا" && line.sometimes_cases.trim() !== "");
        if (batch.source === SHOP_SOURCE && !shopOk) return line.substitute_answer === "أحيانًا" ? "sometimes_undocumented" : "shop_refused";
        const usedBatch = (await client.query(`SELECT COALESCE(SUM(kg), 0)::float8 AS s FROM allocations WHERE batch_id = $1`, [d.batch_id])).rows[0].s;
        if (d.kg > round(batch.accepted_kg - usedBatch)) return "batch_exceeded";
        const usedLine = (await client.query(`SELECT COALESCE(SUM(kg), 0)::float8 AS s FROM allocations WHERE line_id = $1`, [d.line_id])).rows[0].s;
        if (d.kg > round(line.kg - usedLine)) return "line_exceeded";
        await client.query(`INSERT INTO allocations (batch_id, line_id, kg) VALUES ($1, $2, $3)`, [d.batch_id, d.line_id, d.kg]);
        return "ok";
      });
    },
    async deleteAllocation(id) {
      const r = await pool.query(`DELETE FROM allocations WHERE id = $1 AND delivered_kg IS NULL RETURNING id`, [id]);
      return r.rows.length > 0;
    },
    async deliverAllocation(id, d) {
      const r = await pool.query(`UPDATE allocations SET delivered_kg = $2, rejected_kg = $3, delivery_note = $4, delivered_at = COALESCE($5::timestamptz, now()) WHERE id = $1 AND $2::numeric + $3::numeric <= kg RETURNING id`,
        [id, d.delivered_kg, d.rejected_kg, d.note, d.delivered_at ? d.delivered_at + ":00+03:00" : null]);
      return r.rows.length > 0;
    },

    // Trial numbers. Registrations are not sales, and one week is not proof of viability.
    async report() {
      const all = await this.listNeeds();
      const needs = all.filter((n) => n.status !== "cancelled");
      const expenses = await this.listExpenses();
      const batches = await this.listBatches();
      const perRestaurant = {};
      for (const n of needs) perRestaurant[n.restaurant_id] = (perRestaurant[n.restaurant_id] || 0) + 1;
      const sum = (list, f) => round(list.reduce((s, x) => s + (f(x) || 0), 0));
      const requested = sum(needs, (n) => n.requested_kg), delivered = sum(needs, (n) => n.delivered_kg);
      return {
        needs: needs.length,
        restaurants: Object.keys(perRestaurant).length,
        reordering_restaurants: Object.values(perRestaurant).filter((c) => c > 1).length,
        requested_kg: requested,
        allocated_kg: sum(needs, (n) => n.allocated_kg),
        delivered_kg: delivered,
        shortage_kg: round(Math.max(requested - delivered, 0)),
        purchased_kg: sum(batches, (b) => b.purchased_kg),
        rejected_kg: sum(batches.filter((b) => b.accepted_kg != null), (b) => b.purchased_kg - b.accepted_kg),
        purchase_cost_total: sum(batches, (b) => b.cost_total),
        cost_to_restaurants: sum(needs, (n) => n.purchase_cost),
        service_fees: sum(needs, (n) => n.service_fee),
        due: sum(needs, (n) => n.due),
        collected: sum(needs, (n) => n.collected),
        cancelled: all.length - needs.length,
        rejected_at_delivery_kg: sum(needs, (n) => n.rejected_kg),
        coverage_pct: requested > 0 ? Math.round((delivered / requested) * 1000) / 10 : 0,
        operating_costs: sum(expenses, (e) => e.amount),
        // fees minus running costs: an estimate, and fish cost passed to restaurants is not income
        estimated_margin: round(sum(needs, (n) => n.service_fee) - sum(expenses, (e) => e.amount)),
        outstanding: round(Math.max(sum(needs, (n) => n.due) - sum(needs, (n) => n.collected), 0)),
        // suppliers paid on time: only batches bought from a known supplier with a due date
        supplier_batches: batches.filter((b) => b.supplier_due_on).length,
        supplier_paid_on_time: batches.filter((b) => b.supplier_due_on && b.supplier_paid_on && b.supplier_paid_on <= b.supplier_due_on).length,
        supplier_paid_late: batches.filter((b) => b.supplier_due_on && b.supplier_paid_on && b.supplier_paid_on > b.supplier_due_on).length,
        supplier_unpaid: batches.filter((b) => b.supplier_due_on && !b.supplier_paid_on).length,
        deliveries: needs.flatMap((n) => n.lines.flatMap((l) => l.allocations.filter((a) => a.delivered_at).map((a) => ({ need_id: n.id, date: n.date, requested_time: n.delivery_time, delivered_at: a.delivered_at }))))
      };
    },

    // ── saved order summaries (admin only) ──
    async listSummaries() {
      const r = await pool.query(`SELECT id, restaurant_name, to_char(summary_date, 'YYYY-MM-DD') AS date, lines, service_fee, transport_fee, note, created_at FROM order_summaries ORDER BY summary_date DESC, created_at DESC LIMIT 500`);
      return r.rows.map((s) => ({ ...s, service_fee: num(s.service_fee), transport_fee: num(s.transport_fee) }));
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
    }
  };
}
