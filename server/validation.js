import { z } from "zod";
import { REGIONS, NEED, YESNO, DELIVERY, KIND, SHOP_KIND, PHONE_RE, LIMITS } from "../shared/constants.js";

// Control characters are dropped, then the length is checked on what remains.
const clean = (s, keepNewlines) =>
// eslint-disable-next-line no-control-regex -- stripping control characters is the point
  s.normalize("NFC").replace(keepNewlines ? /[\u0000-\u0009\u000B-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g, "").trim();

const text = (max) => z.string().max(max * 4).transform((s) => clean(s, false)).pipe(z.string().min(1).max(max));
const note = z.string().max(LIMITS.note * 4).transform((s) => clean(s, true)).pipe(z.string().max(LIMITS.note)).optional().default("");
const phone = z.string().regex(PHONE_RE);
const honeypot = z.string().max(200).optional();
const species = z.array(text(LIMITS.species)).min(1).max(LIMITS.speciesCount).transform((a) => [...new Set(a)]);
const positive = (max) => z.number().positive().max(max).refine(Number.isFinite).transform((n) => Math.round(n * 100) / 100).pipe(z.number().positive());

// .strict() rejects any field that is not listed.
const restaurant = z.object({
  type: z.literal("restaurant"),
  restaurant_name: text(LIMITS.name),
  contact_name: text(LIMITS.name),
  phone,
  region: z.enum(REGIONS),
  city: text(LIMITS.city),
  need: z.enum(NEED),
  species,
  trial: z.enum(YESNO),
  note,
  website: honeypot
}).strict();

const fish = z.object({
  type: z.literal("fish"),
  kind: z.enum(KIND),
  name: text(LIMITS.name),
  shop_name: text(LIMITS.name).nullable().optional(),
  phone,
  species,
  trial: z.enum(YESNO),
  delivery: z.enum(DELIVERY),
  quality: z.literal(true),
  note,
  website: honeypot
}).strict();

const submitSchema = z.discriminatedUnion("type", [restaurant, fish]);

export function parseSubmit(body) {
  const r = submitSchema.safeParse(body);
  if (!r.success) return null;
  const d = r.data;
  if (d.type === "fish") {
    if (d.kind === SHOP_KIND && !d.shop_name) return null;
    if (d.kind !== SHOP_KIND) d.shop_name = null;
  }
  return d;
}

const offerItems = z.array(z.object({ item_id: z.uuid(), quantity_kg: positive(LIMITS.kg), price_per_kg: positive(LIMITS.price) }).strict()).min(1).max(LIMITS.demandItems);
const uniqueItems = (d) => (d && new Set(d.items.map((i) => i.item_id)).size === d.items.length ? d : null);

// Public link: the fish owner types name and phone once for the whole sheet.
const offerSchema = z.object({ name: text(LIMITS.name), phone, items: offerItems, note, website: honeypot }).strict();
export function parseOffer(body) {
  const r = offerSchema.safeParse(body);
  return r.success ? uniqueItems(r.data) : null;
}

// Personal link: identity comes from the registration, nothing to type.
const supplyOfferSchema = z.object({ items: offerItems, note, website: honeypot }).strict();
export function parseSupplyOffer(body) {
  const r = supplyOfferSchema.safeParse(body);
  return r.success ? uniqueItems(r.data) : null;
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => {
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
});

const demandSchema = z.object({
  title: text(LIMITS.title).optional(),
  date: isoDate,
  pickup_window: text(LIMITS.window),
  items: z.array(z.object({ id: z.uuid().optional(), species: text(LIMITS.species), required_kg: positive(LIMITS.kg) }).strict()).min(1).max(LIMITS.demandItems)
}).strict();

export function parseDemand(body) {
  const r = demandSchema.safeParse(body);
  if (!r.success) return null;
  const names = r.data.items.map((i) => i.species);
  if (new Set(names).size !== names.length) return null;
  return r.data;
}

const money = z.number().min(0).max(LIMITS.price * 100).refine(Number.isFinite).transform((n) => Math.round(n * 100) / 100);
const summarySchema = z.object({
  restaurant_name: text(LIMITS.name),
  date: isoDate,
  lines: z.array(z.object({
    species: text(LIMITS.species),
    kg: positive(LIMITS.kg),
    price: money,
    source: z.string().max(320).transform((s) => clean(s, false)).pipe(z.string().max(80)).optional().default("")
  }).strict()).min(1).max(LIMITS.demandItems),
  service_fee: money,
  transport_fee: money,
  note
}).strict();
export function parseSummary(body) {
  const r = summarySchema.safeParse(body);
  return r.success ? r.data : null;
}

const loginSchema = z.object({ password: z.string().min(1).max(200) }).strict();
export function parseLogin(body) {
  const r = loginSchema.safeParse(body);
  return r.success ? r.data : null;
}

export const isUuid = (s) => typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
export const isToken = (s) => typeof s === "string" && /^[A-Za-z0-9_-]{43}$/.test(s);
