/* The Innocent Kitchen — dashboard menu catalogue + recipe editor.
   Uses the existing menu_catalog table and save_kitchen_menu_item_v1 RPC.
   Loaded after admin-v2.html's inline script and other dashboard modules. */
(function () {
  'use strict';

  const PANEL_ID = 'tikMenuCatalogPanel';
  const state = { catalog: [], recipes: {}, components: [], loading: false, saving: false, selectedSku: '', skuManuallyEdited: false };
  const $ = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

  function admin() {
    try {
      if (typeof sb !== 'undefined' && sb && typeof session !== 'undefined' && session && session.user) {
        return { client: sb, session };
      }
    } catch (_) {}
    return null;
  }

  function ensurePanel() {
    const dashboard = $('dashboard');
    if (!dashboard) return null;
    let panel = $(PANEL_ID);
    if (panel) return panel;
    panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.className = 'panel';
    panel.innerHTML = `
      <div class="row" style="align-items:flex-start">
        <div><h2 style="margin-bottom:4px">Menu catalogue &amp; recipe builder</h2><div class="sub">Add a product once here. Its name, regular price, availability record and per-item recipe are saved in Supabase. No menu-item code edit is needed for future additions.</div></div>
        <button type="button" id="tikCatalogRefresh" class="btn light fixed">Refresh catalogue</button>
      </div>
      <div id="tikCatalogStatus" class="alert" role="status" aria-live="polite" style="margin-top:10px">Sign in with a kitchen-admin account to manage the catalogue.</div>
      <label for="tikCatalogExisting">Edit an existing item or create a new one</label>
      <select id="tikCatalogExisting"><option value="">＋ Create a new menu item</option></select>
      <div class="row" style="margin-top:8px;align-items:flex-start">
        <div><label for="tikCatalogSku">SKU (permanent item code)</label><input id="tikCatalogSku" maxlength="100" placeholder="e.g. paneer-biryani" autocomplete="off"><div class="tiny">Use lowercase letters, numbers and hyphens. Existing SKUs cannot be changed because past orders refer to them.</div></div>
        <div><label for="tikCatalogName">Customer-facing item name</label><input id="tikCatalogName" maxlength="100" placeholder="e.g. Paneer Biryani"></div>
      </div>
      <label for="tikCatalogDescription">Short description</label>
      <input id="tikCatalogDescription" maxlength="500" placeholder="A brief description shown on the customer ordering page">
      <div class="row" style="align-items:flex-end">
        <div style="max-width:260px"><label for="tikCatalogPrice">Regular price (₹)</label><input id="tikCatalogPrice" type="number" min="0.01" max="5000" step="0.5" inputmode="decimal" placeholder="e.g. 149"></div>
        <label style="display:flex;align-items:center;gap:8px;margin:8px 0 12px;color:var(--ink);font-size:13px"><input id="tikCatalogActive" type="checkbox" checked style="width:20px;height:20px"> Active in the regular menu</label>
      </div>
      <div style="border-top:1px solid var(--line);margin-top:12px;padding-top:12px">
        <h3 style="margin:0 0 4px">Recipe for one saleable item</h3>
        <p class="sub">Enter the quantity of each component used for one menu item. Keep units consistent across recipes (for example, raw chicken in g, rice in g, eggs in piece).</p>
        <div id="tikCatalogRecipeRows"></div>
        <div class="row" style="margin-top:8px"><button type="button" id="tikCatalogAddComponent" class="btn light">Add recipe component</button><button type="button" id="tikCatalogSave" class="btn">Save item + recipe</button><button type="button" id="tikCatalogNew" class="btn light">Clear / new item</button></div>
      </div>
      <h3 style="margin:18px 0 5px">Current catalogue</h3>
      <div id="tikCatalogList"><div class="empty">Loading catalogue…</div></div>
      <p class="tiny">Archiving an item does not delete previous orders or recipes. If it is selected on a current/future published daily menu, first remove it from that menu and save the change.</p>`;
    const anchor = $('packingPrepPanel');
    if (anchor && anchor.parentElement === dashboard) dashboard.insertBefore(panel, anchor);
    else dashboard.prepend(panel);

    $('tikCatalogRefresh').addEventListener('click', () => loadCatalog(state.selectedSku));
    $('tikCatalogExisting').addEventListener('change', () => selectItem($('tikCatalogExisting').value));
    $('tikCatalogName').addEventListener('input', () => {
      if (!state.selectedSku && !state.skuManuallyEdited) $('tikCatalogSku').value = slugify($('tikCatalogName').value);
    });
    $('tikCatalogSku').addEventListener('input', () => { if (!state.selectedSku) state.skuManuallyEdited = true; });
    $('tikCatalogAddComponent').addEventListener('click', () => { state.components.push({ name: '', qty: '', unit: 'g' }); renderComponents(); });
    $('tikCatalogNew').addEventListener('click', () => selectItem(''));
    $('tikCatalogSave').addEventListener('click', saveItem);
    $('tikCatalogRecipeRows').addEventListener('input', event => {
      const el = event.target.closest('[data-component-index]');
      if (!el) return;
      const row = state.components[Number(el.dataset.componentIndex)];
      if (row) row[el.dataset.componentField] = el.dataset.componentField === 'qty' ? el.value : el.value;
    });
    $('tikCatalogRecipeRows').addEventListener('click', event => {
      const button = event.target.closest('[data-component-remove]');
      if (!button) return;
      state.components.splice(Number(button.dataset.componentRemove), 1);
      renderComponents();
    });
    return panel;
  }

  function slugify(value) {
    return String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);
  }

  function setStatus(message, error) {
    const el = $('tikCatalogStatus');
    if (!el) return;
    el.textContent = message;
    el.style.background = error ? '#fff0ee' : '';
    el.style.color = error ? 'var(--red)' : '';
  }

  function renderComponents() {
    const el = $('tikCatalogRecipeRows');
    if (!el) return;
    if (!state.components.length) {
      el.innerHTML = '<div class="empty">Add at least one recipe component.</div>';
      return;
    }
    el.innerHTML = state.components.map((item, index) => `
      <div class="recipe-row">
        <input data-component-index="${index}" data-component-field="name" maxlength="100" placeholder="Ingredient / component" value="${escapeHtml(item.name)}">
        <input data-component-index="${index}" data-component-field="qty" type="number" min="0.0001" max="1000000" step="any" inputmode="decimal" placeholder="Qty" value="${escapeHtml(item.qty)}">
        <input data-component-index="${index}" data-component-field="unit" maxlength="32" placeholder="Unit (g/piece/ml)" value="${escapeHtml(item.unit)}">
        <button type="button" class="btn danger" data-component-remove="${index}" aria-label="Remove component ${index + 1}">×</button>
      </div>`).join('');
  }

  function renderExistingSelect(selectedSku) {
    const el = $('tikCatalogExisting');
    if (!el) return;
    const oldValue = selectedSku === undefined ? el.value : selectedSku;
    el.innerHTML = '<option value="">＋ Create a new menu item</option>' + state.catalog.map(row =>
      `<option value="${escapeHtml(row.sku)}">${escapeHtml(row.name)}${row.is_active ? '' : ' (archived)'} · ${escapeHtml(row.sku)}</option>`
    ).join('');
    el.value = state.catalog.some(row => row.sku === oldValue) ? oldValue : '';
  }

  function renderList() {
    const el = $('tikCatalogList');
    if (!el) return;
    if (!state.catalog.length) {
      el.innerHTML = '<div class="empty">No catalogue items found.</div>';
      return;
    }
    el.innerHTML = `<div style="overflow-x:auto"><table class="prep-table"><thead><tr><th>Item</th><th>Regular price</th><th>Status</th><th>Recipe</th></tr></thead><tbody>${state.catalog.map(row => {
      const recipe = state.recipes[row.sku];
      return `<tr><td><b>${escapeHtml(row.name)}</b><div class="sub">${escapeHtml(row.sku)}</div></td><td>₹${Number(row.base_price).toFixed(2)}</td><td>${row.is_active ? '<span class="pill">Active</span>' : '<span class="pill red">Archived</span>'}</td><td>${recipe && Array.isArray(recipe.components) && recipe.components.length ? '<span class="pill">Configured</span>' : '<span class="prep-bad">Needs recipe</span>'}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  }

  function refreshLegacyRecipeDropdown() {
    const select = $('recipeSkuSelect');
    if (!select) return;
    const previous = select.value;
    select.innerHTML = state.catalog.map(row => `<option value="${escapeHtml(row.sku)}">${escapeHtml(row.name)}${row.is_active ? '' : ' (archived)'}</option>`).join('');
    if (state.catalog.some(row => row.sku === previous)) select.value = previous;
    else if (state.catalog.length) select.value = state.catalog[0].sku;
    if (!select.value && state.catalog.length) select.value = state.catalog[0].sku;
    // Keep any existing unsaved legacy recipe draft intact unless its selected SKU disappeared.
    if (previous && previous !== select.value && typeof loadRecipeDraft === 'function') loadRecipeDraft();
  }

  async function loadCatalog(selectSku) {
    ensurePanel();
    const auth = admin();
    if (!auth) {
      setStatus('Sign in with a kitchen-admin account to load or change the catalogue.', true);
      return;
    }
    if (state.loading) return;
    state.loading = true;
    $('tikCatalogRefresh').disabled = true;
    setStatus('Loading catalogue and shared recipes…');
    try {
      const [catalogResult, recipeResult] = await Promise.all([
        auth.client.from('menu_catalog').select('sku,name,description,base_price,is_active').order('name', { ascending: true }),
        auth.client.from('kitchen_recipe_templates').select('sku,components')
      ]);
      if (catalogResult.error) throw catalogResult.error;
      if (recipeResult.error) throw recipeResult.error;
      state.catalog = catalogResult.data || [];
      state.recipes = Object.fromEntries((recipeResult.data || []).map(row => [row.sku, row]));
      // ORDER_MENU is an existing array used by the daily-menu editor and packing list. Mutate in place
      // so other scripts retain the same array reference without changing the customer page design.
      ORDER_MENU.splice(0, ORDER_MENU.length, ...state.catalog.map(row => ({
        sku: row.sku, name: row.name, description: row.description || '',
        basePrice: Number(row.base_price), isActive: row.is_active
      })));
      renderExistingSelect(selectSku === undefined ? state.selectedSku : selectSku);
      renderList();
      refreshLegacyRecipeDropdown();
      if (typeof renderPrep === 'function') renderPrep();
      if (typeof window.tikDailyMenuCatalogUpdated === 'function') window.tikDailyMenuCatalogUpdated();
      document.dispatchEvent(new Event('tik-menu-catalog-updated'));
      if (selectSku) selectItem(selectSku, false);
      else if (state.selectedSku && state.catalog.some(row => row.sku === state.selectedSku)) selectItem(state.selectedSku, false);
      else selectItem('', false);
      setStatus('Catalogue loaded: ' + state.catalog.length + ' items. Use the form to create or edit an item and its recipe.');
    } catch (error) {
      setStatus('Could not load the menu catalogue: ' + (error.message || 'Unknown error'), true);
    } finally {
      state.loading = false;
      $('tikCatalogRefresh').disabled = false;
    }
  }

  function selectItem(sku, updateSelect) {
    state.selectedSku = sku || '';
    if (updateSelect !== false) $('tikCatalogExisting').value = state.selectedSku;
    state.skuManuallyEdited = false;
    const existing = state.catalog.find(row => row.sku === state.selectedSku);
    if (!existing) {
      $('tikCatalogSku').disabled = false;
      $('tikCatalogSku').value = '';
      $('tikCatalogName').value = '';
      $('tikCatalogDescription').value = '';
      $('tikCatalogPrice').value = '';
      $('tikCatalogActive').checked = true;
      state.components = [{ name: '', qty: '', unit: 'g' }];
      setStatus('Creating a new item. Enter the name, regular price and recipe.');
    } else {
      $('tikCatalogSku').disabled = true;
      $('tikCatalogSku').value = existing.sku;
      $('tikCatalogName').value = existing.name;
      $('tikCatalogDescription').value = existing.description || '';
      $('tikCatalogPrice').value = existing.base_price;
      $('tikCatalogActive').checked = !!existing.is_active;
      const saved = state.recipes[existing.sku] && state.recipes[existing.sku].components;
      state.components = Array.isArray(saved) ? saved.map(item => ({ name: String(item.name || ''), qty: String(item.qty ?? ''), unit: String(item.unit || '') })) : [{ name: '', qty: '', unit: 'g' }];
      setStatus('Editing ' + existing.name + '. The SKU is locked so existing order references stay valid.');
    }
    renderComponents();
  }

  async function saveItem() {
    const auth = admin();
    if (!auth) { setStatus('Sign in with a kitchen-admin account first.', true); return; }
    const sku = String($('tikCatalogSku').value || '').trim().toLowerCase();
    const name = String($('tikCatalogName').value || '').trim();
    const description = String($('tikCatalogDescription').value || '').trim();
    const basePrice = Number($('tikCatalogPrice').value);
    const isActive = $('tikCatalogActive').checked;
    if (!/^[a-z0-9-]{1,100}$/.test(sku)) { setStatus('SKU must use lowercase letters, numbers and hyphens only.', true); $('tikCatalogSku').focus(); return; }
    if (name.length < 1 || name.length > 100) { setStatus('Item name must contain 1 to 100 characters.', true); $('tikCatalogName').focus(); return; }
    if (description.length > 500) { setStatus('Description must be 500 characters or fewer.', true); return; }
    if (!Number.isFinite(basePrice) || basePrice <= 0 || basePrice > 5000) { setStatus('Enter a regular price between ₹0.01 and ₹5000.', true); $('tikCatalogPrice').focus(); return; }
    if (!state.components.length || state.components.length > 50) { setStatus('A recipe must contain 1 to 50 components.', true); return; }
    const clean = [];
    for (const component of state.components) {
      const componentName = String(component.name || '').trim();
      const unit = String(component.unit || '').trim();
      const qty = Number(component.qty);
      if (!componentName || componentName.length > 100 || !unit || unit.length > 32 || !Number.isFinite(qty) || qty <= 0 || qty > 1000000) {
        setStatus('Every recipe row needs a component name, positive quantity and unit. Remove any unused blank row.', true);
        return;
      }
      clean.push({ name: componentName, qty, unit });
    }
    if (!state.selectedSku && state.catalog.some(row => row.sku === sku)) {
      setStatus('That SKU already exists. Choose it from the edit dropdown instead of creating a duplicate.', true);
      return;
    }
    state.saving = true;
    $('tikCatalogSave').disabled = true;
    $('tikCatalogRefresh').disabled = true;
    setStatus('Saving the menu item and recipe together…');
    try {
      const { data, error } = await auth.client.rpc('save_kitchen_menu_item_v1', {
        p_sku: sku,
        p_name: name,
        p_description: description,
        p_base_price: basePrice,
        p_is_active: isActive,
        p_components: clean
      });
      if (error) throw error;
      await loadCatalog(sku);
      setStatus('Saved “' + name + '”, its recipe and availability record. The customer page keeps the same design and reads this catalogue from Supabase.', false);
    } catch (error) {
      setStatus('Could not save item and recipe: ' + (error.message || 'Unknown error'), true);
    } finally {
      state.saving = false;
      $('tikCatalogSave').disabled = false;
      $('tikCatalogRefresh').disabled = false;
    }
  }

  function boot() {
    ensurePanel();
    const auth = admin();
    if (auth) loadCatalog();
    try {
      if (typeof sb !== 'undefined' && sb && sb.auth) {
        sb.auth.onAuthStateChange((event) => {
          // Do not reload/overwrite form fields on routine token refreshes while an admin is editing.
          if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'USER_UPDATED') {
            window.setTimeout(() => loadCatalog(state.selectedSku), 0);
          }
        });
      }
    } catch (_) {}
  }

  window.tikReloadMenuCatalog = loadCatalog;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
