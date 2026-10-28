/* The Innocent Kitchen — date-specific menu editor. Requires admin-v2.html globals sb, session, ORDER_MENU. */
(function () {
  'use strict';

  const PANEL_ID = 'tikDailyMenuPanel';
  const BASE_PRICES = {
    'chicken-power-wrap':119,
    'chicken-paratha':99,
    'chicken-keema-box':119,
    'chicken-paratha-box':119,
    'chilli-chicken-box':119,
    'chilli-chicken-roll':109,
    'paneer-power-wrap':109,
    'paneer-paratha':89,
    'paneer-bhurji-box':109,
    'paneer-masala-box':109,
    'chilli-paneer-box':119,
    'chilli-paneer-roll':109,
    'double-egg-roll':89,
    'egg-bhurji-box':99,
    'egg-masala-paratha':99,
    'rajma-power-box':89,
    'kala-chana-power-box':89,
    'mix-veg-roti':89,
    'mix-veg-paratha':99
  };

  function $(id) { return document.getElementById(id); }
  function safeText(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function getTodayIndia() {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}`;
  }
  function getMenu() {
    try { return Array.isArray(ORDER_MENU) ? ORDER_MENU : []; }
    catch (_) { return []; }
  }

  function ensurePanel() {
    const dashboard = $('dashboard');
    if (!dashboard) return null;
    let panel = $(PANEL_ID);
    if (panel) return panel;

    panel = document.createElement('section');
    panel.className = 'panel';
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="row" style="align-items:flex-start">
        <div><h2 style="margin-bottom:4px">Daily menu management</h2><div class="sub">Choose items and prices for a specific date. Only a published menu is shown to customers; order prices are checked by the database.</div></div>
        <button type="button" class="btn light fixed" id="tikDailyMenuLoad">Load date</button>
      </div>
      <div class="row" style="margin-top:10px;align-items:flex-start">
        <div style="min-width:150px"><label for="tikDailyMenuDate">Menu date</label><input id="tikDailyMenuDate" type="date" /></div>
        <div style="min-width:180px"><label for="tikDailyMenuTitle">Menu title</label><input id="tikDailyMenuTitle" maxlength="100" value="Daily Menu" placeholder="e.g. Wednesday Lunch" /></div>
      </div>
      <label for="tikDailyMenuNote">Customer note (optional)</label>
      <input id="tikDailyMenuNote" maxlength="300" placeholder="e.g. Delivery slots: 12:30, 1:00 and 1:30 pm" />
      <div id="tikDailyMenuStatus" class="alert" role="status" aria-live="polite" style="margin-top:12px">Loading menu date…</div>
      <div class="row" style="margin-bottom:10px">
        <button type="button" id="tikDailyMenuSelectAll" class="btn light">Select all</button>
        <button type="button" id="tikDailyMenuClearAll" class="btn light">Clear selection</button>
      </div>
      <div id="tikDailyMenuRows"></div>
      <div class="row" style="margin-top:14px">
        <button type="button" id="tikDailyMenuSaveDraft" class="btn light">Save draft (not visible)</button>
        <button type="button" id="tikDailyMenuPublish" class="btn">Save and publish</button>
      </div>
      <p class="tiny">Leave a price blank to use the regular menu price. A custom price applies only to the selected date. Saving a draft unpublishes that date; publishing makes the saved selection and prices live together.</p>`;

    const anchor = $('packingPrepPanel');
    if (anchor && anchor.parentElement === dashboard) dashboard.insertBefore(panel, anchor);
    else dashboard.prepend(panel);

    $('tikDailyMenuDate').value = getTodayIndia();
    $('tikDailyMenuLoad').addEventListener('click', () => loadMenu());
    $('tikDailyMenuSaveDraft').addEventListener('click', () => saveMenu(false));
    $('tikDailyMenuPublish').addEventListener('click', () => saveMenu(true));
    $('tikDailyMenuSelectAll').addEventListener('click', () => setAll(true));
    $('tikDailyMenuClearAll').addEventListener('click', () => setAll(false));
    $('tikDailyMenuRows').addEventListener('input', () => setStatus('Unsaved changes. Save as draft or publish to apply them.'));
    $('tikDailyMenuDate').addEventListener('change', () => setStatus('Date changed. Tap “Load date” to retrieve that date’s saved menu.'));
    return panel;
  }

  function setStatus(message) {
    const status = $('tikDailyMenuStatus');
    if (status) status.textContent = message;
  }

  function renderRows(savedRows) {
    const target = $('tikDailyMenuRows');
    if (!target) return;
    const saved = Object.fromEntries((savedRows || []).map(row => [row.sku, row]));
    const items = getMenu();
    if (!items.length) {
      target.innerHTML = '<div class="empty">The menu catalogue could not be loaded.</div>';
      return;
    }
    target.innerHTML = items.map(item => {
      const row = saved[item.sku] || {};
      const price = row.custom_price === null || row.custom_price === undefined ? '' : String(row.custom_price);
      const base = BASE_PRICES[item.sku];
      return `<div style="padding:11px 0;border-bottom:1px solid var(--line)">
        <div style="display:flex;align-items:center;gap:9px">
          <input type="checkbox" data-dm-include="${safeText(item.sku)}" ${row.is_included === true ? 'checked' : ''} style="width:20px;height:20px;flex:0 0 auto">
          <div style="flex:1;min-width:0"><b>${safeText(item.name)}</b><div class="sub">${safeText(item.sku)}</div></div>
          <span class="pill">Regular ${base ? '₹'+base : 'price'}</span>
        </div>
        <div style="margin:7px 0 0 29px;max-width:230px"><label style="margin:4px 0" for="tik-dm-price-${safeText(item.sku)}">Price for this date (₹; blank = regular)</label>
          <input id="tik-dm-price-${safeText(item.sku)}" type="number" min="0.01" max="5000" step="0.5" inputmode="decimal" placeholder="${base || 'Regular price'}" value="${safeText(price)}" data-dm-price="${safeText(item.sku)}"></div>
      </div>`;
    }).join('');
  }

  function setAll(checked) {
    document.querySelectorAll('#tikDailyMenuRows [data-dm-include]').forEach(el => { el.checked = checked; });
    setStatus('Unsaved changes. Save as draft or publish to apply them.');
  }

  async function loadMenu() {
    ensurePanel();
    let client, adminSession;
    try { client = sb; adminSession = session; } catch (_) { client = null; adminSession = null; }
    if (!client || !adminSession || !adminSession.user) {
      setStatus('Sign in as a kitchen administrator to manage the daily menu.');
      renderRows([]);
      return;
    }
    const date = $('tikDailyMenuDate').value;
    if (!date) { setStatus('Choose a menu date first.'); return; }
    setStatus('Loading saved menu for ' + date + '…');
    try {
      const dayResult = await client.from('daily_menu_days')
        .select('menu_date,title,note,is_published,published_at')
        .eq('menu_date', date).maybeSingle();
      if (dayResult.error) throw dayResult.error;
      const itemResult = await client.from('daily_menu_items')
        .select('sku,is_included,custom_price')
        .eq('menu_date', date);
      if (itemResult.error) throw itemResult.error;
      const day = dayResult.data;
      $('tikDailyMenuTitle').value = day && day.title ? day.title : 'Daily Menu';
      $('tikDailyMenuNote').value = day && day.note ? day.note : '';
      renderRows(itemResult.data || []);
      if (!day) setStatus('No saved menu for ' + date + '. Select the items you want, then save a draft or publish.');
      else setStatus((day.is_published ? 'PUBLISHED' : 'Draft / not visible') + ' · ' + date + ' · ' + (itemResult.data || []).filter(row => row.is_included).length + ' items selected.');
    } catch (error) {
      setStatus('Could not load the daily menu: ' + (error.message || 'Unknown error'));
    }
  }

  function collectItems() {
    const items = [];
    for (const item of getMenu()) {
      const checkbox = document.querySelector(`#tikDailyMenuRows [data-dm-include="${item.sku}"]`);
      const priceInput = document.querySelector(`#tikDailyMenuRows [data-dm-price="${item.sku}"]`);
      if (!checkbox || !priceInput) continue;
      const rawPrice = priceInput.value.trim();
      let customPrice = null;
      if (rawPrice !== '') {
        customPrice = Number(rawPrice);
        if (!Number.isFinite(customPrice) || customPrice <= 0 || customPrice > 5000) {
          throw new Error('Enter a valid price between ₹0.01 and ₹5000 for ' + item.name + ', or leave it blank.');
        }
        customPrice = Math.round(customPrice * 100) / 100;
      }
      items.push({ sku: item.sku, is_included: checkbox.checked, custom_price: customPrice });
    }
    return items;
  }

  async function saveMenu(publish) {
    let client, adminSession;
    try { client = sb; adminSession = session; } catch (_) { client = null; adminSession = null; }
    if (!client || !adminSession || !adminSession.user) {
      setStatus('Sign in as a kitchen administrator first.');
      return;
    }
    const date = $('tikDailyMenuDate').value;
    const title = $('tikDailyMenuTitle').value.trim();
    const note = $('tikDailyMenuNote').value.trim();
    if (!date) { setStatus('Choose a menu date first.'); return; }
    if (!title) { setStatus('Enter a menu title.'); $('tikDailyMenuTitle').focus(); return; }

    let items;
    try { items = collectItems(); }
    catch (error) { setStatus(error.message); return; }
    const selectedCount = items.filter(item => item.is_included).length;
    if (publish && selectedCount === 0) {
      setStatus('Select at least one item before publishing.');
      return;
    }

    const draftButton = $('tikDailyMenuSaveDraft');
    const publishButton = $('tikDailyMenuPublish');
    draftButton.disabled = true;
    publishButton.disabled = true;
    setStatus(publish ? 'Saving and publishing menu…' : 'Saving draft…');
    try {
      const { data, error } = await client.rpc('save_daily_menu', {
        p_menu_date: date,
        p_title: title,
        p_note: note || null,
        p_is_published: publish,
        p_items: items
      });
      if (error) throw error;
      setStatus((publish ? 'PUBLISHED successfully' : 'Draft saved; this date is not visible to customers') + ' · ' + date + ' · ' + selectedCount + ' items.');
      await loadMenu();
    } catch (error) {
      setStatus('Could not save the menu: ' + (error.message || 'Unknown error'));
    } finally {
      draftButton.disabled = false;
      publishButton.disabled = false;
    }
  }

  function boot() {
    if (!ensurePanel()) return;
    loadMenu();
    try {
      if (typeof sb !== 'undefined' && sb && sb.auth) {
        sb.auth.onAuthStateChange(() => { window.setTimeout(loadMenu, 0); });
      }
    } catch (_) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
