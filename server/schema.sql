-- V1 — applied at startup, safe to run repeatedly.

CREATE TABLE IF NOT EXISTS restaurant_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_name text NOT NULL,
  contact_name text NOT NULL,
  phone text NOT NULL,
  region text NOT NULL,
  city text NOT NULL,
  need_range text NOT NULL,
  species jsonb NOT NULL,
  trial_interest boolean NOT NULL,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fish_owner_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  name text NOT NULL,
  shop_name text,
  phone text NOT NULL,
  species jsonb NOT NULL,
  trial_interest boolean NOT NULL,
  delivery_answer text NOT NULL,
  quality_accepted boolean NOT NULL,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trial_demands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_token text NOT NULL UNIQUE,
  title text NOT NULL,
  demand_date date NOT NULL,
  pickup_location text NOT NULL,
  pickup_window text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trial_demand_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_demand_id uuid NOT NULL REFERENCES trial_demands(id) ON DELETE CASCADE,
  species text NOT NULL,
  required_kg numeric(10,2) NOT NULL CHECK (required_kg > 0),
  counted_kg numeric(10,2) NOT NULL DEFAULT 0 CHECK (counted_kg >= 0),
  remaining_kg numeric(10,2) GENERATED ALWAYS AS (GREATEST(required_kg - counted_kg, 0)) STORED
);
CREATE INDEX IF NOT EXISTS trial_demand_items_demand_idx ON trial_demand_items (trial_demand_id);

CREATE TABLE IF NOT EXISTS fish_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_demand_item_id uuid NOT NULL REFERENCES trial_demand_items(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text NOT NULL,
  quantity_kg numeric(10,2) NOT NULL CHECK (quantity_kg > 0),
  price_per_kg numeric(10,2) NOT NULL CHECK (price_per_kg > 0),
  note text NOT NULL DEFAULT '',
  counted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fish_offers_item_idx ON fish_offers (trial_demand_item_id);

CREATE INDEX IF NOT EXISTS restaurant_leads_phone_idx ON restaurant_leads (phone);
CREATE INDEX IF NOT EXISTS fish_owner_leads_phone_idx ON fish_owner_leads (phone);

-- personal supply link of a fish owner, and which owner an offer came from
ALTER TABLE fish_owner_leads ADD COLUMN IF NOT EXISTS supplier_token text UNIQUE;
ALTER TABLE fish_offers ADD COLUMN IF NOT EXISTS fish_owner_lead_id uuid REFERENCES fish_owner_leads(id) ON DELETE SET NULL;

-- order summaries the admin saves for a restaurant (admin only, never public)
CREATE TABLE IF NOT EXISTS order_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_name text NOT NULL,
  summary_date date NOT NULL,
  lines jsonb NOT NULL,
  service_fee numeric(10,2) NOT NULL DEFAULT 0 CHECK (service_fee >= 0),
  transport_fee numeric(10,2) NOT NULL DEFAULT 0 CHECK (transport_fee >= 0),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- interest forms, second version: numeric quantity, frequency, pickup location.
-- Questions that were dropped stay as nullable columns so older records keep their answers.
ALTER TABLE restaurant_leads ADD COLUMN IF NOT EXISTS quantity_kg numeric(10,2) CHECK (quantity_kg > 0);
ALTER TABLE restaurant_leads ADD COLUMN IF NOT EXISTS frequency text;
ALTER TABLE restaurant_leads ALTER COLUMN contact_name DROP NOT NULL;
ALTER TABLE restaurant_leads ALTER COLUMN region DROP NOT NULL;
ALTER TABLE restaurant_leads ALTER COLUMN need_range DROP NOT NULL;
ALTER TABLE fish_owner_leads ADD COLUMN IF NOT EXISTS pickup_location text;
ALTER TABLE fish_owner_leads ADD COLUMN IF NOT EXISTS quantity_kg numeric(10,2) CHECK (quantity_kg > 0);
ALTER TABLE fish_owner_leads ALTER COLUMN trial_interest DROP NOT NULL;
ALTER TABLE fish_owner_leads ALTER COLUMN delivery_answer DROP NOT NULL;
ALTER TABLE fish_owner_leads ALTER COLUMN quality_accepted DROP NOT NULL;

-- third version: substitution consent, preferred pickup time, kg per species; supplier availability time
ALTER TABLE restaurant_leads ADD COLUMN IF NOT EXISTS species_quantities jsonb;
ALTER TABLE restaurant_leads ADD COLUMN IF NOT EXISTS pickup_time text;
ALTER TABLE restaurant_leads ADD COLUMN IF NOT EXISTS accepts_substitute boolean;
ALTER TABLE fish_owner_leads ADD COLUMN IF NOT EXISTS availability_time text;

-- ── restaurants-only version: registration, personal order link, operations ──
ALTER TABLE restaurant_leads ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE restaurant_leads ADD COLUMN IF NOT EXISTS purchase_method text;
ALTER TABLE restaurant_leads ADD COLUMN IF NOT EXISTS priority text;
ALTER TABLE restaurant_leads ADD COLUMN IF NOT EXISTS consent_at timestamptz;
ALTER TABLE restaurant_leads ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE restaurant_leads ADD COLUMN IF NOT EXISTS order_token text UNIQUE;
ALTER TABLE restaurant_leads ALTER COLUMN city DROP NOT NULL;
ALTER TABLE restaurant_leads ALTER COLUMN trial_interest DROP NOT NULL;

-- a dated need sent by a verified restaurant; never a purchase until the team confirms it
CREATE TABLE IF NOT EXISTS needs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurant_leads(id) ON DELETE CASCADE,
  need_date date NOT NULL,
  delivery_location text NOT NULL,
  delivery_time text NOT NULL,
  note text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'confirmed', 'purchasing', 'delivered', 'partial', 'cancelled')),
  service_fee numeric(12,2) CHECK (service_fee >= 0),
  collected numeric(12,2) NOT NULL DEFAULT 0 CHECK (collected >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS needs_date_idx ON needs (need_date);
CREATE TABLE IF NOT EXISTS need_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  need_id uuid NOT NULL REFERENCES needs(id) ON DELETE CASCADE,
  species text NOT NULL,
  spec text NOT NULL,
  kg numeric(10,2) NOT NULL CHECK (kg > 0)
);
CREATE INDEX IF NOT EXISTS need_lines_need_idx ON need_lines (need_id);
-- every status change, with its time
CREATE TABLE IF NOT EXISTS need_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  need_id uuid NOT NULL REFERENCES needs(id) ON DELETE CASCADE,
  status text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);

-- what a supplier says is available: reported only, never counted as secured
CREATE TABLE IF NOT EXISTS supply_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES fish_owner_leads(id) ON DELETE CASCADE,
  report_date date NOT NULL,
  species text NOT NULL,
  spec text NOT NULL DEFAULT '',
  kg numeric(10,2) NOT NULL CHECK (kg > 0),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- a purchase: bought → accepted after inspection → allocated to need lines → delivered
CREATE TABLE IF NOT EXISTS batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_date date NOT NULL,
  source text NOT NULL CHECK (source IN ('حراج جازان', 'محل أسماك')),
  supplier_id uuid REFERENCES fish_owner_leads(id) ON DELETE SET NULL,
  species text NOT NULL,
  spec text NOT NULL DEFAULT '',
  purchased_kg numeric(10,2) NOT NULL CHECK (purchased_kg > 0),
  cost_total numeric(12,2) NOT NULL CHECK (cost_total >= 0),
  accepted_kg numeric(10,2) CHECK (accepted_kg >= 0 AND accepted_kg <= purchased_kg),
  inspection_note text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES batches(id) ON DELETE RESTRICT,
  line_id uuid NOT NULL REFERENCES need_lines(id) ON DELETE CASCADE,
  kg numeric(10,2) NOT NULL CHECK (kg > 0),
  delivered_kg numeric(10,2) CHECK (delivered_kg >= 0 AND delivered_kg <= kg),
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS allocations_batch_idx ON allocations (batch_id);
CREATE INDEX IF NOT EXISTS allocations_line_idx ON allocations (line_id);

-- interest form (final spec): city/district/map link, daily kg range, sourcing methods, "sometimes" kept as its own answer
ALTER TABLE restaurant_leads ADD COLUMN IF NOT EXISTS district text;
ALTER TABLE restaurant_leads ADD COLUMN IF NOT EXISTS map_link text;
ALTER TABLE restaurant_leads ADD COLUMN IF NOT EXISTS kg_from numeric(10,2);
ALTER TABLE restaurant_leads ADD COLUMN IF NOT EXISTS kg_to numeric(10,2);
ALTER TABLE restaurant_leads ADD COLUMN IF NOT EXISTS sourcing jsonb;
ALTER TABLE restaurant_leads ADD COLUMN IF NOT EXISTS sourcing_other text;
ALTER TABLE restaurant_leads ADD COLUMN IF NOT EXISTS substitute_answer text;
ALTER TABLE restaurant_leads ALTER COLUMN contact_name DROP NOT NULL;

-- money in: each payment a restaurant makes, linked to its need (cash or transfer for now; credit = what is still unpaid)
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  need_id uuid NOT NULL REFERENCES needs(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  method text NOT NULL CHECK (method IN ('نقد', 'تحويل')),
  paid_on date NOT NULL,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payments_need_idx ON payments (need_id);
-- money out: when a supplier is owed for a batch, and when they were actually paid
ALTER TABLE batches ADD COLUMN IF NOT EXISTS supplier_due_on date;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS supplier_paid_on date;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS supplier_paid_amount numeric(12,2) CHECK (supplier_paid_amount >= 0);

-- admin follow-up and the agreement with each restaurant (filled after talking to it, never by the public form)
ALTER TABLE restaurant_leads ADD COLUMN IF NOT EXISTS follow_status text NOT NULL DEFAULT 'جديد';
ALTER TABLE restaurant_leads ADD COLUMN IF NOT EXISTS admin_note text NOT NULL DEFAULT '';
ALTER TABLE restaurant_leads ADD COLUMN IF NOT EXISTS fee_terms text NOT NULL DEFAULT '';
ALTER TABLE restaurant_leads ADD COLUMN IF NOT EXISTS payment_terms text;
ALTER TABLE restaurant_leads ADD COLUMN IF NOT EXISTS shortage_policy text NOT NULL DEFAULT '';
ALTER TABLE restaurant_leads ADD COLUMN IF NOT EXISTS rejection_policy text NOT NULL DEFAULT '';
-- for a "sometimes" answer: the cases the restaurant accepted for shops; empty means no shop fish for it
ALTER TABLE restaurant_leads ADD COLUMN IF NOT EXISTS sometimes_cases text NOT NULL DEFAULT '';
ALTER TABLE restaurant_leads ADD COLUMN IF NOT EXISTS agreed_at timestamptz;
ALTER TABLE needs ADD COLUMN IF NOT EXISTS cancel_reason text NOT NULL DEFAULT '';
-- refused or short at delivery, beside what was delivered
ALTER TABLE allocations ADD COLUMN IF NOT EXISTS rejected_kg numeric(10,2) NOT NULL DEFAULT 0 CHECK (rejected_kg >= 0);
ALTER TABLE allocations ADD COLUMN IF NOT EXISTS delivery_note text NOT NULL DEFAULT '';
-- running costs of the week (transport, ice…), kept apart from the fish bought for restaurants
CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  spent_on date NOT NULL,
  category text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
-- every successful admin change: what and when
CREATE TABLE IF NOT EXISTS audit_log (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  action text NOT NULL,
  target text NOT NULL DEFAULT ''
);

-- when each restaurant sends its order and when it is delivered, as agreed with it
ALTER TABLE restaurant_leads ADD COLUMN IF NOT EXISTS order_cutoff text NOT NULL DEFAULT '';
ALTER TABLE restaurant_leads ADD COLUMN IF NOT EXISTS delivery_window text NOT NULL DEFAULT '';

-- a purchase can also come straight from a supplier (fisher or farm), not only the market or a shop
ALTER TABLE batches DROP CONSTRAINT IF EXISTS batches_source_check;
ALTER TABLE batches ADD CONSTRAINT batches_source_check CHECK (source IN ('حراج جازان', 'مورد مباشر', 'محل أسماك'));
-- what we ordered from a supplier; receiving it turns it into a purchase batch
CREATE TABLE IF NOT EXISTS supplier_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES fish_owner_leads(id) ON DELETE CASCADE,
  order_date date NOT NULL,
  species text NOT NULL,
  kg numeric(10,2) NOT NULL CHECK (kg > 0),
  price_per_kg numeric(10,2) CHECK (price_per_kg >= 0),
  note text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'received', 'cancelled')),
  batch_id uuid REFERENCES batches(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
