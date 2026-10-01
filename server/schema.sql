-- حصاد جازان V1 — applied at startup, safe to run repeatedly.

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
