-- Nandana Auto Electricals — Parts Inventory
-- Run this once against your Neon database (Neon SQL editor, or `npm run migrate`).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS components (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  emoji        text,
  low_stock    integer NOT NULL DEFAULT 2,
  fast_window  integer NOT NULL DEFAULT 30,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS locations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  component_id  uuid NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  name          text NOT NULL
);

CREATE TABLE IF NOT EXISTS items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  component_id        uuid NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  name                text NOT NULL,
  brand               text,
  part_no             text,
  qty                 integer NOT NULL DEFAULT 0,
  location            text,
  low_stock_override  integer,
  equiv_group         uuid,
  to_buy              boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS usage_log (
  id        bigserial PRIMARY KEY,
  item_id   uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  used_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_items_component ON items(component_id);
CREATE INDEX IF NOT EXISTS idx_items_equiv ON items(equiv_group);
CREATE INDEX IF NOT EXISTS idx_usage_item ON usage_log(item_id);
CREATE INDEX IF NOT EXISTS idx_locations_component ON locations(component_id);
