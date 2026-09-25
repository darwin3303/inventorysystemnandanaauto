const API = '/api';
const SHOP_NAME = 'Nandana Auto Electricals';

function esc(s){ return (s||'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function save(k,v){ try{ localStorage.setItem(k, v); }catch(e){} }
function load(k,d){ try{ return localStorage.getItem(k) ?? d; }catch(e){ return d; } }

async function api(path, opts){
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(()=>null);
  if (!res.ok) throw new Error((data && data.error) || 'Request failed');
  return data;
}

let state = { view:'home', compId:null, tab:'search', query:'', comps:[], items:[], locations:[], brands:[], brandFilter:null, summary:null, loading:true };

async function loadHome(){
  state.loading = true; render();
  state.comps = await api('/components');
  state.loading = false; render();
}

async function loadComponent(id){
  state.loading = true; state.brandFilter = null; render();
  const [items, locations, brands] = await Promise.all([
    api(`/components/${id}/items`),
    api(`/components/${id}/locations`),
    api(`/components/${id}/brands`)
  ]);
  state.items = items; state.locations = locations; state.brands = brands;
  if (state.tab === 'summary') state.summary = await api(`/components/${id}/summary`);
  state.loading = false; render();
}

function currentComp(){ return state.comps.find(c => c.id === state.compId); }

function render(){
  const root = document.getElementById('app');
  root.innerHTML = state.view === 'home' ? renderHome() : renderComponent();
  wireEvents();
}

function renderHome(){
  const cards = (state.comps||[]).map(c => `
    <button class="comp-card" data-open="${c.id}">
      <span class="em">${esc(c.emoji||'🔧')}</span>
      <span class="nm">${esc(c.name)}</span>
      <span class="ct">${c.item_count} item${c.item_count===1?'':'s'}</span>
    </button>`).join('');
  return `
  ${headerHtml(null)}
  <main>
    ${state.loading ? '<p class="loading">Loading…</p>' :
      (!state.comps.length ? '<p class="empty">No components yet. Add your first one below — each gets its own full inventory tracker.</p>' : '')}
    <div class="comp-grid">
      ${cards}
      <button class="comp-card add" id="addComp"><span class="em">+</span><span class="nm">Add component</span></button>
    </div>
    <p class="footer-mark">${SHOP_NAME}</p>
  </main>`;
}

function headerHtml(comp){
  return `
  <header>
    <div class="hrow">
      ${comp ? `<button class="iconbtn" id="backBtn">←</button>` : ''}
      <div class="brand">
        <img src="/assets/logo.png" alt="${SHOP_NAME} logo">
        <div class="brand-text">
          <div class="shop">${SHOP_NAME.toUpperCase()}</div>
          <h1>${comp ? esc(comp.name) : 'Parts Inventory'}</h1>
        </div>
      </div>
      <button class="iconbtn" id="themeBtn" title="Toggle theme">◐</button>
    </div>
  </header>`;
}

function bottomNavHtml(){
  const tabs = [
    ['search','🔍','Search'], ['brands','🏷️','Brands'], ['buy','🛒','To Buy'],
    ['equiv','🔗','Equiv'], ['summary','📊','Summary']
  ];
  return `<nav class="bottomnav">
    ${tabs.map(([id,icon,label]) => `
      <button class="navitem ${state.tab===id?'on':''}" data-tab="${id}">
        <span class="ni">${icon}</span><span class="nl">${label}</span>
      </button>`).join('')}
  </nav>`;
}

function renderComponent(){
  const comp = currentComp();
  if (!comp) { state.view='home'; return renderHome(); }
  if (state.loading) return `${headerHtml(comp)}<main class="with-navbar"><p class="loading">Loading…</p></main>${bottomNavHtml()}`;

  const q = state.query.trim().toLowerCase();
  let items = state.items;
  if (q) items = items.filter(i => (i.name+' '+(i.brand||'')+' '+(i.part_no||'')).toLowerCase().includes(q));

  let body = '';
  if (state.tab === 'search') body = renderSearch(items, comp);
  else if (state.tab === 'brands') body = renderBrands(comp);
  else if (state.tab === 'buy') body = renderBuy(comp);
  else if (state.tab === 'equiv') body = renderEquiv();
  else body = renderSummary(comp);

  return `${headerHtml(comp)}
  <main class="with-navbar">${body}</main>
  ${(state.tab==='search' || state.tab==='brands' || state.tab==='buy') ? `<button class="fab" id="fabAdd" title="Add a part">+</button>` : ''}
  ${state.tab==='equiv' ? `<button class="fab" id="fabEquiv" title="New equivalent match">+</button>` : ''}
  ${bottomNavHtml()}`;
}

function renderSearch(items, comp){
  const rows = items.length ? items.map(i => itemCard(i, comp)).join('') :
    `<p class="empty">${state.items.length? 'No matches.' : 'No parts yet — tap + to add one.'}</p>`;
  return `<div class="searchbar"><input id="searchInput" placeholder="Search name, brand, part #" value="${esc(state.query)}"></div>${rows}`;
}

function itemCard(i, comp){
  const threshold = i.low_stock_override ?? comp.low_stock;
  const low = i.qty <= threshold;
  return `<div class="card">
    <div class="item-row">
      <div class="item-main">
        <div class="item-name">${esc(i.name)}</div>
        <div class="item-sub">${esc(i.brand||'—')} · ${esc(i.part_no||'no part #')} · ${esc(i.location||'no location')}</div>
      </div>
      <div class="qty-pill ${low?'low':''}">${i.qty}</div>
    </div>
    <div class="row-actions">
      <button data-use="${i.id}">− Use one</button>
      <button data-restock="${i.id}" class="gold">+ Restock</button>
      <button data-edit="${i.id}">Edit</button>
      <button data-del="${i.id}" class="danger">Delete</button>
    </div>
  </div>`;
}

function renderBrands(comp){
  const active = state.brandFilter; // null = "All", else a brand name string
  const subtabs = `<div class="tabs subtabs">
    <button class="tab ${active===null?'on':''}" data-brandtab="">All</button>
    ${state.brands.map(b=>`<button class="tab ${active===b.name?'on':''}" data-brandtab="${esc(b.name)}">${esc(b.name)}</button>`).join('')}
    <button class="tab addtab" id="addBrandTabBtn">+ Add brand</button>
  </div>`;

  if (!state.brands.length){
    return `${subtabs}<p class="section-note">Add the brands you stock, then add parts under each one.</p>`;
  }

  let body;
  if (active === null){
    const groups = {};
    state.items.forEach(i => { const b = i.brand || 'Unbranded'; (groups[b] = groups[b]||[]).push(i); });
    const brandNames = state.brands.map(b=>b.name);
    const orderedKeys = [...brandNames.filter(n=>groups[n]), ...Object.keys(groups).filter(k=>!brandNames.includes(k))];
    body = orderedKeys.length
      ? orderedKeys.map(b => `<div class="group-title">${esc(b)} (${groups[b].length})</div>` + groups[b].map(i => itemCard(i, comp)).join('')).join('')
      : `<p class="empty">No parts added under a brand yet — pick a brand tab above and tap + to add one.</p>`;
  } else {
    const brandObj = state.brands.find(b => b.name === active);
    const items = state.items.filter(i => i.brand === active);
    const removeRow = brandObj ? `<div class="row-actions" style="margin-bottom:14px;"><button data-delbrand="${brandObj.id}" class="danger">Remove "${esc(active)}" from brand list</button></div>` : '';
    body = removeRow + (items.length ? items.map(i => itemCard(i, comp)).join('') : `<p class="empty">No parts under ${esc(active)} yet — tap + to add one.</p>`);
  }
  return subtabs + body;
}

function renderBuy(comp){
  const low = state.items.filter(i => (i.qty <= (i.low_stock_override ?? comp.low_stock)) || i.to_buy);
  if (!low.length) return `<p class="empty">Nothing needs buying right now.</p>`;
  return `<p class="section-note">Low stock and manually flagged parts.</p>` +
    low.map(i => `<div class="card">
      <div class="item-row">
        <div class="item-main"><div class="item-name">${esc(i.name)}</div>
          <div class="item-sub">${esc(i.brand||'—')} · have ${i.qty}</div></div>
      </div>
      <div class="row-actions">
        <button data-restock="${i.id}" class="gold">+ Restock</button>
        <button data-togglebuy="${i.id}">${i.to_buy?'Unflag':'Keep on list'}</button>
      </div>
    </div>`).join('');
}

function renderEquiv(){
  const groups = {};
  state.items.forEach(i => { if (i.equiv_group) (groups[i.equiv_group] = groups[i.equiv_group]||[]).push(i); });
  const keys = Object.keys(groups);
  const groupHtml = keys.map(g => `
    <div class="card"><div class="group-title" style="margin-top:0">Interchangeable set</div>
      ${groups[g].map(i => `<div class="checkitem">• ${esc(i.name)} <span class="item-sub">(${esc(i.brand||'—')}, qty ${i.qty})</span></div>`).join('')}
      <div class="row-actions"><button data-ungroup="${g}">Ungroup</button></div>
    </div>`).join('');
  return `<p class="section-note">Group sensors that are interchangeable — tap + to start a new match.</p>
    ${groupHtml || '<p class="empty">No equivalent groups yet.</p>'}`;
}

function renderSummary(comp){
  const s = state.summary || { low:[], fast:[] };
  const locs = state.locations || [];
  return `
  <div class="group-title">⚠ Low Quantity</div>
  <div class="card">${s.low.length ? s.low.map(i=>`<div class="checkitem">${esc(i.name)} — ${i.qty} left</div>`).join('') : '<span class="section-note">None below threshold.</span>'}</div>

  <div class="group-title">⚡ Fast Moving <span style="font-weight:400">(last ${comp.fast_window}d)</span></div>
  <div class="card">${s.fast.length ? s.fast.map(x=>`<div class="checkitem">${esc(x.name)} — used ${x.uses}×</div>`).join('') : '<span class="section-note">No usage logged yet.</span>'}</div>

  <div class="group-title">📦 Storage Locations</div>
  <div class="card">
    <div class="chiplist">${locs.map(l=>`<span class="chip">${esc(l.name)} <button data-delloc="${l.id}">×</button></span>`).join('') || '<span class="section-note">None yet.</span>'}</div>
    <div class="row-actions"><button id="addLocBtn">+ Add location</button></div>
  </div>

  <div class="group-title">⚙ Settings</div>
  <div class="card">
    <div class="settings-row"><span>Low-stock threshold</span><input type="number" min="0" id="thresholdInput" value="${comp.low_stock}"></div>
    <div class="settings-row"><span>Fast-mover window (days)</span><input type="number" min="1" id="windowInput" value="${comp.fast_window}"></div>
    <div class="settings-row"><span>Export backup</span><button class="linkbtn gold" id="exportBtn">Download</button></div>
    <div class="settings-row"><span>Import backup</span><label class="linkbtn gold" style="cursor:pointer">Choose file<input type="file" id="importFile" accept="application/json" style="display:none"></label></div>
    <div class="settings-row"><span>Rename component</span><button class="linkbtn gold" id="renameBtn">Rename</button></div>
    <div class="settings-row"><span style="color:var(--danger)">Delete component</span><button class="linkbtn" id="deleteCompBtn">Delete</button></div>
  </div>`;
}

function modal(html){
  const wrap = document.createElement('div');
  wrap.className = 'overlay';
  wrap.innerHTML = `<div class="sheet">${html}</div>`;
  wrap.addEventListener('click', e => { if (e.target === wrap) wrap.remove(); });
  document.body.appendChild(wrap);
  return wrap;
}

function openItemForm(compId, existing, presetBrand){
  const locOpts = state.locations.map(l=>`<option ${existing&&existing.location===l.name?'selected':''}>${esc(l.name)}</option>`).join('');
  const existingBrandMissing = existing && existing.brand && !state.brands.some(b=>b.name===existing.brand);
  const brandOpts = state.brands.map(b=>{
    const isSelected = existing ? existing.brand===b.name : presetBrand===b.name;
    return `<option ${isSelected?'selected':''}>${esc(b.name)}</option>`;
  }).join('') + (existingBrandMissing ? `<option selected>${esc(existing.brand)}</option>` : '');
  const brandField = state.brands.length
    ? `<select id="fBrand"><option value="">— none —</option>${brandOpts}</select>`
    : `<select id="fBrand" disabled><option value="">Add a brand first (Brands tab)</option></select>`;
  const m = modal(`
    <h2>${existing? 'Edit part' : 'Add part'}</h2>
    <div class="field"><label>Name</label><input id="fName" value="${existing?esc(existing.name):''}" placeholder="e.g. Bosch 15730"></div>
    <div class="field-row">
      <div class="field"><label>Brand</label>${brandField}</div>
      <div class="field"><label>Part #</label><input id="fPart" value="${existing?esc(existing.part_no||''):''}"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Quantity</label><input id="fQty" type="number" min="0" value="${existing?existing.qty:1}"></div>
      <div class="field"><label>Low-stock override</label><input id="fLow" type="number" min="0" placeholder="default" value="${existing&&existing.low_stock_override!=null?existing.low_stock_override:''}"></div>
    </div>
    <div class="field"><label>Location</label>
      <select id="fLoc"><option value="">— none —</option>${locOpts}</select>
    </div>
    <div class="sheet-actions">
      <button class="btn ghost" id="cancelForm">Cancel</button>
      <button class="btn primary" id="saveForm">Save</button>
    </div>`);
  m.querySelector('#cancelForm').onclick = () => m.remove();
  m.querySelector('#saveForm').onclick = async () => {
    const name = m.querySelector('#fName').value.trim();
    if (!name) return;
    const lowVal = m.querySelector('#fLow').value;
    const payload = {
      name,
      brand: m.querySelector('#fBrand').value.trim(),
      part_no: m.querySelector('#fPart').value.trim(),
      qty: parseInt(m.querySelector('#fQty').value)||0,
      low_stock_override: lowVal === '' ? null : parseInt(lowVal),
      location: m.querySelector('#fLoc').value
    };
    try{
      if (existing) {
        await api(`/items/${existing.id}`, { method:'PATCH', body: JSON.stringify(payload) });
        m.remove();
        await loadComponent(compId);
        return;
      }

      // Same name + same brand already in this component? Top up its stock instead of duplicating.
      const dup = state.items.find(i =>
        i.name.trim().toLowerCase() === name.toLowerCase() &&
        (i.brand || '') === (payload.brand || '')
      );
      if (dup){
        const addQty = payload.qty || 0;
        if (addQty > 0) await api(`/items/${dup.id}/restock`, { method:'POST', body: JSON.stringify({ amount: addQty }) });
        const patch = {};
        if (payload.part_no && payload.part_no !== dup.part_no) patch.part_no = payload.part_no;
        if (payload.location && payload.location !== dup.location) patch.location = payload.location;
        if (payload.low_stock_override !== dup.low_stock_override) patch.low_stock_override = payload.low_stock_override;
        if (Object.keys(patch).length) await api(`/items/${dup.id}`, { method:'PATCH', body: JSON.stringify(patch) });
        m.remove();
        await loadComponent(compId);
        alert(`"${name}"${payload.brand ? ' ('+payload.brand+')' : ''} is already in your inventory — stock updated to ${dup.qty + addQty}.`);
        return;
      }

      await api(`/components/${compId}/items`, { method:'POST', body: JSON.stringify(payload) });
      m.remove();
      await loadComponent(compId);
    }catch(e){ alert(e.message); }
  };
}

function wireEvents(){
  const themeBtn = document.getElementById('themeBtn');
  if (themeBtn) themeBtn.onclick = () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    save('inv_theme_v1', next);
  };

  if (state.view === 'home'){
    document.querySelectorAll('[data-open]').forEach(el => el.onclick = async () => {
      state.view='component'; state.compId = el.dataset.open; state.tab='search'; state.query='';
      await loadComponent(state.compId);
    });
    const addBtn = document.getElementById('addComp');
    if (addBtn) addBtn.onclick = () => {
      const m = modal(`
        <h2>New component</h2>
        <div class="field"><label>Name</label><input id="cName" placeholder="e.g. Spark Plugs"></div>
        <div class="field"><label>Icon (one emoji, optional)</label><input id="cEmoji" placeholder="🔩" maxlength="4"></div>
        <div class="sheet-actions">
          <button class="btn ghost" id="cCancel">Cancel</button>
          <button class="btn primary" id="cSave">Create</button>
        </div>`);
      m.querySelector('#cCancel').onclick = () => m.remove();
      m.querySelector('#cSave').onclick = async () => {
        const name = m.querySelector('#cName').value.trim();
        if (!name) return;
        try{
          const comp = await api('/components', { method:'POST', body: JSON.stringify({ name, emoji: m.querySelector('#cEmoji').value.trim() }) });
          m.remove();
          state.view='component'; state.compId=comp.id; state.tab='search';
          state.comps.push({ ...comp, item_count:0 });
          await loadComponent(comp.id);
        }catch(e){ alert(e.message); }
      };
    };
    return;
  }

  // component view
  const comp = currentComp();
  if (!comp) return;

  document.getElementById('backBtn').onclick = async () => { state.view='home'; await loadHome(); };
  document.querySelectorAll('[data-tab]').forEach(el => el.onclick = async () => {
    state.tab = el.dataset.tab; state.query='';
    if (state.tab === 'summary') { state.loading=true; render(); state.summary = await api(`/components/${comp.id}/summary`); }
    state.loading=false; render();
  });

  const searchInput = document.getElementById('searchInput');
  if (searchInput){
    searchInput.oninput = () => {
      state.query = searchInput.value; render();
      const el = document.getElementById('searchInput'); if(el){ el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    };
  }

  const fabAdd = document.getElementById('fabAdd');
  if (fabAdd) fabAdd.onclick = () => openItemForm(comp.id, null, state.tab==='brands' ? state.brandFilter : null);

  document.querySelectorAll('[data-edit]').forEach(el => el.onclick = () => {
    const item = state.items.find(i=>i.id===el.dataset.edit); openItemForm(comp.id, item);
  });
  document.querySelectorAll('[data-del]').forEach(el => el.onclick = async () => {
    if (!confirm('Delete this part?')) return;
    await api(`/items/${el.dataset.del}`, { method:'DELETE' });
    await loadComponent(comp.id);
  });
  document.querySelectorAll('[data-use]').forEach(el => el.onclick = async () => {
    await api(`/items/${el.dataset.use}/use`, { method:'POST' });
    await loadComponent(comp.id);
  });
  document.querySelectorAll('[data-restock]').forEach(el => el.onclick = async () => {
    const n = prompt('Add how many?', '1'); const amount = parseInt(n);
    if (amount>0){ await api(`/items/${el.dataset.restock}/restock`, { method:'POST', body: JSON.stringify({amount}) }); await loadComponent(comp.id); }
  });
  document.querySelectorAll('[data-togglebuy]').forEach(el => el.onclick = async () => {
    await api(`/items/${el.dataset.togglebuy}/toggle-buy`, { method:'POST' });
    await loadComponent(comp.id);
  });

  const fabEquiv = document.getElementById('fabEquiv');
  if (fabEquiv) fabEquiv.onclick = () => {
    if (!state.items.length){ alert('Add some parts first.'); return; }
    const list = state.items.map(i=>`<label class="checkitem"><input type="checkbox" value="${i.id}"> ${esc(i.name)} <span class="item-sub">(${esc(i.brand||'—')})</span></label>`).join('');
    const m = modal(`<h2>New equivalent match</h2><div class="field">${list}</div>
      <div class="sheet-actions"><button class="btn ghost" id="eqCancel">Cancel</button><button class="btn primary" id="eqSave">Group</button></div>`);
    m.querySelector('#eqCancel').onclick = () => m.remove();
    m.querySelector('#eqSave').onclick = async () => {
      const ids = [...m.querySelectorAll('input[type=checkbox]:checked')].map(c=>c.value);
      if (ids.length<2){ alert('Pick at least two parts.'); return; }
      await api(`/components/${comp.id}/equiv`, { method:'POST', body: JSON.stringify({ itemIds: ids }) });
      m.remove(); await loadComponent(comp.id);
    };
  };
  document.querySelectorAll('[data-ungroup]').forEach(el => el.onclick = async () => {
    await api(`/equiv/${el.dataset.ungroup}/ungroup`, { method:'POST' });
    await loadComponent(comp.id);
  });

  const addLocBtn = document.getElementById('addLocBtn');
  if (addLocBtn) addLocBtn.onclick = async () => {
    const n = prompt('Location name (e.g. Bin A3)'); if (!n) return;
    await api(`/components/${comp.id}/locations`, { method:'POST', body: JSON.stringify({ name:n.trim() }) });
    await loadComponent(comp.id);
  };
  document.querySelectorAll('[data-delloc]').forEach(el => el.onclick = async () => {
    await api(`/locations/${el.dataset.delloc}`, { method:'DELETE' });
    await loadComponent(comp.id);
  });
  const addBrandTabBtn = document.getElementById('addBrandTabBtn');
  if (addBrandTabBtn) addBrandTabBtn.onclick = async () => {
    const n = prompt('Brand name (e.g. Bosch)'); if (!n) return;
    const b = await api(`/components/${comp.id}/brands`, { method:'POST', body: JSON.stringify({ name:n.trim() }) });
    state.brandFilter = b.name;
    await loadComponent(comp.id);
  };
  document.querySelectorAll('[data-brandtab]').forEach(el => el.onclick = () => {
    state.brandFilter = el.dataset.brandtab || null; render();
  });
  document.querySelectorAll('[data-delbrand]').forEach(el => el.onclick = async () => {
    if (!confirm('Remove this brand from the list? Parts already tagged with it keep the tag.')) return;
    await api(`/brands/${el.dataset.delbrand}`, { method:'DELETE' });
    state.brandFilter = null;
    await loadComponent(comp.id);
  });
  const thresholdInput = document.getElementById('thresholdInput');
  if (thresholdInput) thresholdInput.onchange = async () => {
    await api(`/components/${comp.id}`, { method:'PATCH', body: JSON.stringify({ low_stock: parseInt(thresholdInput.value)||0 }) });
    comp.low_stock = parseInt(thresholdInput.value)||0;
  };
  const windowInput = document.getElementById('windowInput');
  if (windowInput) windowInput.onchange = async () => {
    await api(`/components/${comp.id}`, { method:'PATCH', body: JSON.stringify({ fast_window: parseInt(windowInput.value)||1 }) });
    comp.fast_window = parseInt(windowInput.value)||1;
  };
  const renameBtn = document.getElementById('renameBtn');
  if (renameBtn) renameBtn.onclick = async () => {
    const n = prompt('New name', comp.name); if (!n) return;
    await api(`/components/${comp.id}`, { method:'PATCH', body: JSON.stringify({ name:n.trim() }) });
    comp.name = n.trim(); render();
  };
  const exportBtn = document.getElementById('exportBtn');
  if (exportBtn) exportBtn.onclick = async () => {
    const data = await api(`/components/${comp.id}/export`);
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = comp.name.replace(/\s+/g,'_')+'_backup.json';
    a.click(); URL.revokeObjectURL(url);
  };
  const importFile = document.getElementById('importFile');
  if (importFile) importFile.onchange = () => {
    const f = importFile.files[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try{
        const parsed = JSON.parse(reader.result);
        await api(`/components/${comp.id}/import`, { method:'POST', body: JSON.stringify(parsed) });
        await loadComponent(comp.id);
      }catch(e){ alert('Could not read that file: ' + e.message); }
    };
    reader.readAsText(f);
  };
  const deleteCompBtn = document.getElementById('deleteCompBtn');
  if (deleteCompBtn) deleteCompBtn.onclick = async () => {
    if (!confirm(`Delete "${comp.name}" and all its parts? This cannot be undone.`)) return;
    await api(`/components/${comp.id}`, { method:'DELETE' });
    state.view='home'; await loadHome();
  };
}

// init theme
const savedTheme = load('inv_theme_v1', null);
if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);

loadHome().catch(e => {
  document.getElementById('app').innerHTML = `<main><p class="empty">Couldn't reach the server: ${esc(e.message)}</p></main>`;
});
