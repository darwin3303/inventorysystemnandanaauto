// Converts a backup exported from the old O2 Sensor Inventory site
// (brands / sensors / history / toBuy / locations / settings) into the
// { items, locations, brands, usage, settings } format this app's
// "Import backup" button expects.
//
// Usage:
//   node scripts/convert-o2-backup.js path/to/old-backup.json path/to/converted.json

const fs = require('fs');

const [,, inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error('Usage: node scripts/convert-o2-backup.js <old-backup.json> <converted.json>');
  process.exit(1);
}

const old = JSON.parse(fs.readFileSync(inPath, 'utf8'));

const brandNameById = new Map((old.brands || []).map(b => [b.id, b.name]));
const brands = (old.brands || []).map(b => ({ name: b.name }));
const locations = (old.locations || []).map(name => ({ name }));

// sensorId -> { name, brand } for mapping usage history below
const sensorKeyById = new Map();
const items = [];
const seenKeys = new Set();

for (const s of (old.sensors || [])) {
  const brand = brandNameById.get(s.brandId) || '';
  const name = s.sensorNumber;
  sensorKeyById.set(s.id, { name, brand });
  const key = `${name}||${brand}`;
  seenKeys.add(key);
  items.push({
    name,
    brand,
    part_no: Array.isArray(s.cars) && s.cars.length ? s.cars.join('; ') : '',
    qty: s.quantity || 0,
    location: s.box || '',
    low_stock_override: null,
    to_buy: false
  });
}

// toBuy entries are wishlist parts. If one matches an existing sensor
// (same number + brand), just flag that item; otherwise add a new
// zero-stock item flagged to_buy.
for (const t of (old.toBuy || [])) {
  const key = `${t.sensorNumber}||${t.brandName || ''}`;
  const existing = items.find(i => `${i.name}||${i.brand}` === key);
  if (existing) {
    existing.to_buy = true;
  } else {
    items.push({
      name: t.sensorNumber,
      brand: t.brandName || '',
      part_no: t.notes ? `${t.notes} — want ${t.qty || 1}` : `want ${t.qty || 1}`,
      qty: 0,
      location: '',
      low_stock_override: null,
      to_buy: true
    });
  }
}

// Usage history: only "use" events map onto this app's usage log
// (restocks aren't logged here — they just raise qty).
const usage = (old.movements || old.history || [])
  .filter(h => h.type === 'use' && h.ts)
  .map(h => {
    const ref = sensorKeyById.get(h.sensorId);
    if (!ref) return null;
    return { name: ref.name, brand: ref.brand, ts: h.ts };
  })
  .filter(Boolean);

const settings = old.settings
  ? { low_stock: old.settings.threshold ?? null, fast_window: old.settings.windowDays ?? null }
  : null;

if (Array.isArray(old.equivalents) && old.equivalents.length) {
  console.warn(`Note: ${old.equivalents.length} equivalent group(s) found in the old backup — this converter does not carry those over yet. You'll need to recreate them in the Equiv tab after importing.`);
}

const converted = { items, locations, brands, usage, settings };
fs.writeFileSync(outPath, JSON.stringify(converted, null, 2));
console.log(`Converted ${items.length} parts, ${locations.length} locations, ${brands.length} brands, ${usage.length} usage entries.`);
console.log(`Wrote ${outPath}`);
