import { z } from "zod";
import { YESNO, SUBSTITUTE, SOURCING, OTHER_SOURCING, PAY_METHODS, PAY_TERMS, FOLLOW, EXPENSE_CATS, DELIVERY_TIMES, KIND, AVAILABILITY, SOURCES, NEED_STATUS, PHONE_RE, LIMITS } from "../shared/constants.js";

// Control characters are dropped, then the length is checked on what remains.
const clean = (s, keepNewlines) =>
// eslint-disable-next-line no-control-regex -- stripping control characters is the point
  s.normalize("NFC").replace(keepNewlines ? /[\u0000-\u0009\u000B-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g, "").trim();

const text = (max) => z.string().max(max * 4).transform((s) => clean(s, false)).pipe(z.string().min(1).max(max));
const optText = (max) => z.string().max(max * 4).transform((s) => clean(s, false)).pipe(z.string().max(max)).optional().default("");
const note = z.string().max(LIMITS.note * 4).transform((s) => clean(s, true)).pipe(z.string().max(LIMITS.note)).optional().default("");
const phone = z.string().regex(PHONE_RE);
const honeypot = z.string().max(200).optional();
const speciesList = z.array(text(LIMITS.species)).max(LIMITS.speciesCount).transform((a) => [...new Set(a)]);
const positive = (max) => z.number().positive().max(max).refine(Number.isFinite).transform((n) => Math.round(n * 100) / 100).pipe(z.number().positive());
const nonNegative = (max) => z.number().min(0).max(max).refine(Number.isFinite).transform((n) => Math.round(n * 100) / 100);
const money = nonNegative(LIMITS.price * 100);
const uuid = z.uuid();
const parse = (schema) => (body) => { const r = schema.safeParse(body); return r.success ? r.data : null; };

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => {
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
});

// ── public: restaurant interest ── .strict() rejects any field that is not listed.
const mapLink = z.string().max(LIMITS.url * 2).transform((s) => clean(s, false)).pipe(z.union([z.literal(""), z.url({ protocol: /^https?$/ }).max(LIMITS.url)])).optional().default("");
const restaurant = z.object({
  restaurant_name: text(LIMITS.name),
  phone,
  city: text(LIMITS.city),
  district: text(LIMITS.district),
  map_link: mapLink,
  species: speciesList.pipe(z.array(z.string()).min(1)),
  kg_from: positive(LIMITS.leadKg),
  kg_to: positive(LIMITS.leadKg),
  sourcing: z.array(z.enum(SOURCING)).min(1).max(SOURCING.length).transform((a) => [...new Set(a)]),
  sourcing_other: optText(LIMITS.other),
  substitute: z.enum(SUBSTITUTE),
  wants_contact: z.enum(YESNO),
  note,
  consent: z.literal(true),
  website: honeypot
}).strict();
export function parseRestaurant(body) {
  const d = parse(restaurant)(body);
  if (!d || d.kg_from > d.kg_to) return null;
  if (d.sourcing.includes(OTHER_SOURCING) ? !d.sourcing_other : d.sourcing_other) d.sourcing_other = d.sourcing.includes(OTHER_SOURCING) ? null : "";
  return d.sourcing_other === null ? null : d;
}

// ── public (personal link): a dated need with several lines ──
// The same species may come twice with different specs, never twice with the same one.
const need = z.object({
  date: isoDate,
  delivery_location: text(LIMITS.location),
  delivery_time: z.enum(DELIVERY_TIMES),
  lines: z.array(z.object({ species: text(LIMITS.species), spec: optText(LIMITS.spec), kg: positive(LIMITS.kg) }).strict()).min(1).max(LIMITS.lines),
  note,
  website: honeypot
}).strict();
export function parseNeed(body) {
  const d = parse(need)(body);
  if (!d) return null;
  const keys = d.lines.map((l) => l.species + "\u0000" + l.spec);
  return new Set(keys).size === keys.length ? d : null;
}

// ── admin ──
export const parseSupplier = parse(z.object({
  name: text(LIMITS.name), phone, kind: z.enum(KIND), species: speciesList.optional().default([]),
  pickup_location: optText(LIMITS.location), availability_time: z.enum(AVAILABILITY).nullable().optional().default(null), note
}).strict());

export const parseSupplyReport = parse(z.object({
  supplier_id: uuid, date: isoDate, species: text(LIMITS.species), spec: optText(LIMITS.spec), kg: positive(LIMITS.kg), note
}).strict());

export const parseBatch = parse(z.object({
  date: isoDate, source: z.enum(SOURCES), supplier_id: uuid.nullable().optional().default(null),
  species: text(LIMITS.species), spec: optText(LIMITS.spec), purchased_kg: positive(LIMITS.kg), cost_total: money, note,
  supplier_due_on: isoDate.nullable().optional().default(null)
}).strict());

export const parseFollowUp = parse(z.object({ follow_status: z.enum(FOLLOW), admin_note: note }).strict());
export const parseAgreement = parse(z.object({
  fee_terms: optText(300), payment_terms: z.enum(PAY_TERMS), order_cutoff: optText(80), delivery_window: optText(80),
  shortage_policy: optText(300), rejection_policy: optText(300), sometimes_cases: optText(300)
}).strict());
export const parseExpense = parse(z.object({ date: isoDate, category: z.enum(EXPENSE_CATS), amount: positive(LIMITS.price * 100), note }).strict());
export const parseSupplierOrder = parse(z.object({
  supplier_id: uuid, date: isoDate, species: text(LIMITS.species), kg: positive(LIMITS.kg), price_per_kg: money.nullable().optional().default(null), note
}).strict());
export const parseReceive = parse(z.object({
  date: isoDate, purchased_kg: positive(LIMITS.kg), cost_total: money, supplier_due_on: isoDate.nullable().optional().default(null)
}).strict());
export const parseInspection = parse(z.object({ accepted_kg: nonNegative(LIMITS.kg), note }).strict());
export const parseAllocation = parse(z.object({ batch_id: uuid, line_id: uuid, kg: positive(LIMITS.kg) }).strict());
export const parseDelivery = parse(z.object({
  delivered_kg: nonNegative(LIMITS.kg), rejected_kg: nonNegative(LIMITS.kg).optional().default(0), note: optText(200),
  delivered_at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).refine((s) => !Number.isNaN(new Date(s + ":00+03:00").getTime())).nullable().optional().default(null)
}).strict());
export const parseNeedUpdate = parse(z.object({
  status: z.enum(Object.keys(NEED_STATUS)), service_fee: money.nullable(), cancel_reason: optText(200)
}).strict().refine((d) => d.status !== "cancelled" || d.cancel_reason));
export const parsePayment = parse(z.object({ amount: positive(LIMITS.price * 100), method: z.enum(PAY_METHODS), paid_on: isoDate, note }).strict());
export const parsePayout = parse(z.object({ amount: money, paid_on: isoDate }).strict());
// a need typed in by the team for a restaurant that ordered by WhatsApp or phone
export function parseAdminNeed(body) {
  if (!body || typeof body !== "object") return null;
  const { restaurant_id, ...rest } = body;
  const d = parseNeed(rest);
  return d && isUuid(restaurant_id) ? { ...d, restaurant_id } : null;
}

const summarySchema = z.object({
  restaurant_name: text(LIMITS.name),
  date: isoDate,
  lines: z.array(z.object({
    species: text(LIMITS.species),
    kg: positive(LIMITS.kg),
    price: money,
    source: optText(80)
  }).strict()).min(1).max(LIMITS.lines),
  service_fee: money,
  transport_fee: money,
  note
}).strict();
export const parseSummary = parse(summarySchema);

export const parseLogin = parse(z.object({ password: z.string().min(1).max(200) }).strict());

export const isUuid = (s) => typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
export const isToken = (s) => typeof s === "string" && /^[A-Za-z0-9_-]{43}$/.test(s);
