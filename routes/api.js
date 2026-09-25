const express = require('express');
const pool = require('../db');
const router = express.Router();

// ---------- helpers ----------
const ok = (res, data) => res.json(data);
const notFound = (res) => res.status(404).json({ error: 'Not found' });

// ---------- components ----------
router.get('/components', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT c.*, COUNT(i.id)::int AS item_count
      FROM components c
      LEFT JOIN items i ON i.component_id = c.id
      GROUP BY c.id
      ORDER BY c.created_at ASC
    `);
    ok(res, rows);
  } catch (e) { next(e); }
});

router.post('/components', async (req, res, next) => {
  try {
    const { name, emoji } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    const { rows } = await pool.query(
      `INSERT INTO components (name, emoji) VALUES ($1, $2) RETURNING *`,
      [name.trim(), emoji || null]
    );
    ok(res, rows[0]);
  } catch (e) { next(e); }
});

router.patch('/components/:id', async (req, res, next) => {
  try {
    const { name, emoji, low_stock, fast_window } = req.body;
    const { rows } = await pool.query(
      `UPDATE components SET
         name = COALESCE($2, name),
         emoji = COALESCE($3, emoji),
         low_stock = COALESCE($4, low_stock),
         fast_window = COALESCE($5, fast_window)
       WHERE id = $1 RETURNING *`,
      [req.params.id, name, emoji, low_stock, fast_window]
    );
    if (!rows[0]) return notFound(res);
    ok(res, rows[0]);
  } catch (e) { next(e); }
});

router.delete('/components/:id', async (req, res, next) => {
  try {
    await pool.query(`DELETE FROM components WHERE id = $1`, [req.params.id]);
    res.status(204).end();
  } catch (e) { next(e); }
});

// ---------- items ----------
router.get('/components/:id/items', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM items WHERE component_id = $1 ORDER BY created_at DESC`,
      [req.params.id]
    );
    ok(res, rows);
  } catch (e) { next(e); }
});

router.post('/components/:id/items', async (req, res, next) => {
  try {
    const { name, brand, part_no, qty, location, low_stock_override } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    const { rows } = await pool.query(
      `INSERT INTO items (component_id, name, brand, part_no, qty, location, low_stock_override)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.params.id, name.trim(), brand || null, part_no || null, qty ?? 0, location || null, low_stock_override ?? null]
    );
    ok(res, rows[0]);
  } catch (e) { next(e); }
});

router.patch('/items/:id', async (req, res, next) => {
  try {
    const { name, brand, part_no, qty, location, low_stock_override, to_buy } = req.body;
    const { rows } = await pool.query(
      `UPDATE items SET
         name = COALESCE($2, name),
         brand = COALESCE($3, brand),
         part_no = COALESCE($4, part_no),
         qty = COALESCE($5, qty),
         location = COALESCE($6, location),
         low_stock_override = $7,
         to_buy = COALESCE($8, to_buy)
       WHERE id = $1 RETURNING *`,
      [req.params.id, name, brand, part_no, qty, location,
       low_stock_override === undefined ? null : low_stock_override, to_buy]
    );
    if (!rows[0]) return notFound(res);
    ok(res, rows[0]);
  } catch (e) { next(e); }
});

router.delete('/items/:id', async (req, res, next) => {
  try {
    await pool.query(`DELETE FROM items WHERE id = $1`, [req.params.id]);
    res.status(204).end();
  } catch (e) { next(e); }
});

router.post('/items/:id/use', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `UPDATE items SET qty = GREATEST(qty - 1, 0) WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!rows[0]) return notFound(res);
    await pool.query(`INSERT INTO usage_log (item_id) VALUES ($1)`, [req.params.id]);
    ok(res, rows[0]);
  } catch (e) { next(e); }
});

router.post('/items/:id/restock', async (req, res, next) => {
  try {
    const amount = parseInt(req.body.amount) || 0;
    if (amount <= 0) return res.status(400).json({ error: 'amount must be positive' });
    const { rows } = await pool.query(
      `UPDATE items SET qty = qty + $2, to_buy = false WHERE id = $1 RETURNING *`,
      [req.params.id, amount]
    );
    if (!rows[0]) return notFound(res);
    ok(res, rows[0]);
  } catch (e) { next(e); }
});

router.post('/items/:id/toggle-buy', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `UPDATE items SET to_buy = NOT to_buy WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!rows[0]) return notFound(res);
    ok(res, rows[0]);
  } catch (e) { next(e); }
});

// ---------- equivalents ----------
router.post('/components/:id/equiv', async (req, res, next) => {
  try {
    const { itemIds } = req.body;
    if (!Array.isArray(itemIds) || itemIds.length < 2) {
      return res.status(400).json({ error: 'Provide at least two itemIds' });
    }
    const { rows } = await pool.query(
      `UPDATE items SET equiv_group = gen_random_uuid()
       WHERE id = ANY($1::uuid[]) AND component_id = $2
       RETURNING equiv_group`,
      [itemIds, req.params.id]
    );
    ok(res, { group: rows[0]?.equiv_group });
  } catch (e) { next(e); }
});

router.post('/equiv/:groupId/ungroup', async (req, res, next) => {
  try {
    await pool.query(`UPDATE items SET equiv_group = NULL WHERE equiv_group = $1`, [req.params.groupId]);
    res.status(204).end();
  } catch (e) { next(e); }
});

// ---------- locations ----------
router.get('/components/:id/locations', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM locations WHERE component_id = $1 ORDER BY name ASC`,
      [req.params.id]
    );
    ok(res, rows);
  } catch (e) { next(e); }
});

router.post('/components/:id/locations', async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    const { rows } = await pool.query(
      `INSERT INTO locations (component_id, name) VALUES ($1,$2) RETURNING *`,
      [req.params.id, name.trim()]
    );
    ok(res, rows[0]);
  } catch (e) { next(e); }
});

router.delete('/locations/:id', async (req, res, next) => {
  try {
    await pool.query(`DELETE FROM locations WHERE id = $1`, [req.params.id]);
    res.status(204).end();
  } catch (e) { next(e); }
});

// ---------- brands ----------
router.get('/components/:id/brands', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM brands WHERE component_id = $1 ORDER BY name ASC`,
      [req.params.id]
    );
    ok(res, rows);
  } catch (e) { next(e); }
});

router.post('/components/:id/brands', async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    const { rows } = await pool.query(
      `INSERT INTO brands (component_id, name) VALUES ($1,$2) RETURNING *`,
      [req.params.id, name.trim()]
    );
    ok(res, rows[0]);
  } catch (e) { next(e); }
});

router.delete('/brands/:id', async (req, res, next) => {
  try {
    await pool.query(`DELETE FROM brands WHERE id = $1`, [req.params.id]);
    res.status(204).end();
  } catch (e) { next(e); }
});

// ---------- summary ----------
router.get('/components/:id/summary', async (req, res, next) => {
  try {
    const compRes = await pool.query(`SELECT * FROM components WHERE id = $1`, [req.params.id]);
    const comp = compRes.rows[0];
    if (!comp) return notFound(res);

    const lowRes = await pool.query(
      `SELECT * FROM items
       WHERE component_id = $1
         AND qty <= COALESCE(low_stock_override, $2)
       ORDER BY qty ASC`,
      [req.params.id, comp.low_stock]
    );

    const fastRes = await pool.query(
      `SELECT i.*, COUNT(u.id)::int AS uses
       FROM items i
       JOIN usage_log u ON u.item_id = i.id
       WHERE i.component_id = $1
         AND u.used_at >= now() - ($2 || ' days')::interval
       GROUP BY i.id
       ORDER BY uses DESC
       LIMIT 10`,
      [req.params.id, comp.fast_window]
    );

    ok(res, { low: lowRes.rows, fast: fastRes.rows });
  } catch (e) { next(e); }
});

// ---------- backup / restore ----------
router.get('/components/:id/export', async (req, res, next) => {
  try {
    const compRes = await pool.query(`SELECT * FROM components WHERE id = $1`, [req.params.id]);
    if (!compRes.rows[0]) return notFound(res);
    const itemsRes = await pool.query(`SELECT * FROM items WHERE component_id = $1`, [req.params.id]);
    const locRes = await pool.query(`SELECT * FROM locations WHERE component_id = $1`, [req.params.id]);
    const brandRes = await pool.query(`SELECT * FROM brands WHERE component_id = $1`, [req.params.id]);
    ok(res, { component: compRes.rows[0], items: itemsRes.rows, locations: locRes.rows, brands: brandRes.rows });
  } catch (e) { next(e); }
});

router.post('/components/:id/import', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { items = [], locations = [], brands = [] } = req.body;
    await client.query('BEGIN');
    await client.query(`DELETE FROM items WHERE component_id = $1`, [req.params.id]);
    await client.query(`DELETE FROM locations WHERE component_id = $1`, [req.params.id]);
    await client.query(`DELETE FROM brands WHERE component_id = $1`, [req.params.id]);
    for (const loc of locations) {
      await client.query(`INSERT INTO locations (component_id, name) VALUES ($1,$2)`, [req.params.id, loc.name]);
    }
    for (const b of brands) {
      await client.query(`INSERT INTO brands (component_id, name) VALUES ($1,$2)`, [req.params.id, b.name]);
    }
    for (const it of items) {
      await client.query(
        `INSERT INTO items (component_id, name, brand, part_no, qty, location, low_stock_override, to_buy)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [req.params.id, it.name, it.brand || null, it.part_no || null, it.qty || 0,
         it.location || null, it.low_stock_override ?? null, !!it.to_buy]
      );
    }
    await client.query('COMMIT');
    ok(res, { restored: items.length });
  } catch (e) {
    await client.query('ROLLBACK');
    next(e);
  } finally {
    client.release();
  }
});

module.exports = router;
