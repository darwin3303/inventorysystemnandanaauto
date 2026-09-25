# Nandana Auto Electricals — Parts Inventory

Multi-component parts inventory tracker. Add a "component" (O2 Sensors, Spark
Plugs, whatever you stock) from the home screen, and each one gets its own
tracker: search, brands, to-buy list, interchangeable-parts grouping, low
stock / fast-moving summary, storage locations, and JSON backup/restore.

Backend: Node.js + Express, REST API, static frontend.
Database: Postgres on [Neon](https://neon.tech).

## 1. Create the Neon database

1. Sign in at neon.tech and create a new project (any region close to your Render service).
2. Open the **SQL Editor** for that project, paste the contents of `schema.sql`, and run it.
   (Alternatively, once you've set `DATABASE_URL` locally, run `npm run migrate`.)
3. Copy the connection string from the Neon dashboard (**Connect** button). It looks like:
   `postgresql://user:password@ep-xxxx.neon.tech/dbname?sslmode=require`

## 2. Run locally (optional but recommended first)

```bash
npm install
cp .env.example .env
# paste your Neon connection string into .env as DATABASE_URL
npm run migrate   # applies schema.sql
npm start
```

Visit `http://localhost:3000`.

## 3. Deploy on Render

**Option A — Blueprint (render.yaml)**
1. Push this folder to a GitHub repo.
2. In Render: New → Blueprint → select the repo. Render reads `render.yaml` automatically.
3. When prompted, paste your Neon connection string as the `DATABASE_URL` env var.
4. Deploy.

**Option B — Manual Web Service**
1. Push this folder to a GitHub repo.
2. In Render: New → Web Service → connect the repo.
3. Build command: `npm install`
4. Start command: `npm start`
5. Add an environment variable: `DATABASE_URL` = your Neon connection string.
6. Deploy.

Render's free tier spins down when idle, so the first request after a while
will be slow (~30s) as it wakes up and reconnects to Neon.

## Project structure

```
server.js          Express entry point, serves the API + static frontend
db.js               Neon/Postgres connection pool
schema.sql           Database schema — run once in Neon
routes/api.js         All REST endpoints
scripts/migrate.js    Applies schema.sql via `npm run migrate`
public/               Frontend (HTML/CSS/vanilla JS)
  index.html
  style.css
  app.js
  assets/logo.png, logo-192.png, favicon.png   Your shop logo
render.yaml            Render Blueprint config
.env.example           Template for local DATABASE_URL
```

## API summary

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/api/components` | list / create components |
| PATCH/DELETE | `/api/components/:id` | rename, change settings, delete |
| GET/POST | `/api/components/:id/items` | list / add parts |
| PATCH/DELETE | `/api/items/:id` | edit / delete a part |
| POST | `/api/items/:id/use` | decrement qty by 1, log usage |
| POST | `/api/items/:id/restock` | `{ amount }` add stock |
| POST | `/api/items/:id/toggle-buy` | flag/unflag for the buy list |
| POST | `/api/components/:id/equiv` | `{ itemIds }` group as interchangeable |
| POST | `/api/equiv/:groupId/ungroup` | dissolve a group |
| GET/POST/DELETE | `/api/components/:id/locations` | manage storage bins |
| GET/POST/DELETE | `/api/components/:id/brands` `/api/brands/:id` | manage the brand list |
| GET | `/api/components/:id/summary` | low-stock + fast-moving data |
| GET/POST | `/api/components/:id/export` `/import` | JSON backup / restore |

## Updating an already-deployed database

This version adds a `brands` table (brands are now managed like storage
locations — add one from the Brands tab, then tag parts with it). If you
already ran `schema.sql` once against your Neon database, run this once more
in the Neon SQL editor (it's also included, commented out, at the bottom of
`schema.sql`):

```sql
CREATE TABLE IF NOT EXISTS brands (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  component_id  uuid NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  name          text NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_brands_component ON brands(component_id);
```

## Importing a backup from the old O2 Sensor Inventory site

That site's export format (`brands` / `sensors` / `movements` / `toBuy` /
`locations` / `settings`) is different from this app's. Convert it first:

```bash
node scripts/convert-o2-backup.js old-backup.json converted.json
```

This maps each sensor to a part (brand, part number/name, quantity, storage
box → location), carries over your storage locations and brand list, turns
`toBuy` wishlist entries into zero-stock parts flagged for the buy list (or
flags the matching existing part if one exists), replays "use" events into
usage history so the Fast Moving tab has data from day one, and copies over
your low-stock threshold / fast-mover window. (Equivalent groups aren't
carried over yet — recreate those manually in the Equiv tab if you used
that feature.)

Then in the app: create a component (e.g. "O2 Sensors") → open it → Summary
tab → **Import backup** → choose `converted.json`.

## Notes

- Swap the files in `public/assets/` to update the logo — keep the same filenames or update the `<img>`/`<link>` tags in `public/index.html` and `public/app.js`.
- `sslmode=require` / the `ssl` option in `db.js` is required for Neon; don't remove it.
