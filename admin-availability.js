/* The Innocent Kitchen — shared menu availability controls.
   Load this script after the existing inline script in admin-v2.html. */
(function () {
  'use strict';

  const PANEL_ID = 'tikMenuAvailabilityPanel';
  let availability = {};
  let busySku = '';

  function byId(id) { return document.getElementById(id); }
  function safeText(value) {
    return String(value ?? '').replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function menuItems() {
    try { return Array.isArray(ORDER_MENU) ? ORDER_MENU : []; }
    catch (_) { return []; }
  }

  function ensurePanel() {
    const dashboard = byId('dashboard');
    if (!dashboard) return null;
    let panel = byId(PANEL_ID);
    if (panel) return panel;

    panel = document.createElement('div');
    panel.className = 'panel';
    panel.id = PANEL_ID;
    panel.innerHTML = '<div class="row"><div><h2>Menu availability</h2><div class="sub">Changes apply to customers on every device. Out-of-stock items are blocked by the database as well.</div></div><button id="tikRefreshAvailability" class="btn light fixed" type="button">Refresh</button></div><div id="tikAvailabilityFeedback" class="error" role="status" aria-live="polite">Loading menu availability…</div><div id="tikAvailabilityRows"></div>';

    const incomingPanel = Array.from(dashboard.children).find(function (child) {
      return child.querySelector && child.querySelector('#orders');
    });
    if (incomingPanel) dashboard.insertBefore(panel, incomingPanel);
    else dashboard.appendChild(panel);

    byId('tikRefreshAvailability').addEventListener('click', refreshAvailability);
    byId('tikAvailabilityRows').addEventListener('click', handleToggle);
    return panel;
  }

  function renderAvailability() {
    const rows = byId('tikAvailabilityRows');
    if (!rows) return;
    const items = menuItems();
    if (!items.length) {
      rows.innerHTML = '<div class="empty">Menu list could not be loaded.</div>';
      return;
    }
    rows.innerHTML = items.map(function (item) {
      const state = availability[item.sku];
      const known = !!state;
      const available = known ? state.is_available !== false : true;
      const status = !known ? 'Not configured' : (available ? 'Available' : 'OUT OF STOCK');
      const pill = !known ? 'pill warn' : (available ? 'pill' : 'pill red');
      const buttonText = available ? 'Mark out of stock' : 'Mark available';
      return '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid var(--line);flex-wrap:wrap">' +
        '<div style="flex:1;min-width:160px"><b>' + safeText(item.name) + '</b><div class="sub">' + safeText(item.sku) + '</div></div>' +
        '<span class="' + pill + '">' + safeText(status) + '</span>' +
        '<button type="button" class="btn ' + (available ? 'danger' : 'light') + '" data-tik-availability-sku="' + safeText(item.sku) + '" data-tik-availability-next="' + String(!available) + '" ' + (busySku === item.sku || !known ? 'disabled' : '') + '>' + (busySku === item.sku ? 'Saving…' : buttonText) + '</button></div>';
    }).join('');
  }

  async function refreshAvailability() {
    ensurePanel();
    let client, authSession;
    try { client = sb; authSession = session; } catch (_) { return; }
    if (!client || !authSession) return;
    const feedback = byId('tikAvailabilityFeedback');
    if (feedback) feedback.textContent = 'Refreshing menu availability…';
    try {
      const result = await client.from('menu_availability')
        .select('sku,is_available,out_of_stock_message,updated_at')
        .order('sku', { ascending: true });
      if (result.error) throw result.error;
      availability = Object.fromEntries((result.data || []).map(function (row) { return [row.sku, row]; }));
      renderAvailability();
      if (feedback) feedback.textContent = 'Shared availability loaded. The customer menu refreshes automatically.';
    } catch (error) {
      if (feedback) feedback.textContent = 'Could not load availability: ' + (error.message || 'Unknown error');
    }
  }

  async function handleToggle(event) {
    const button = event.target.closest('[data-tik-availability-sku]');
    if (!button) return;
    let client, authSession;
    try { client = sb; authSession = session; } catch (_) { client = null; authSession = null; }
    if (!client || !authSession) {
      const feedback = byId('tikAvailabilityFeedback');
      if (feedback) feedback.textContent = 'Sign in as a kitchen administrator first.';
      return;
    }
    const sku = button.dataset.tikAvailabilitySku;
    const next = button.dataset.tikAvailabilityNext === 'true';
    busySku = sku;
    renderAvailability();
    const feedback = byId('tikAvailabilityFeedback');
    if (feedback) feedback.textContent = 'Saving availability…';
    try {
      const result = await client.from('menu_availability').update({
        is_available: next,
        out_of_stock_message: next ? null : 'Temporarily out of stock',
        updated_at: new Date().toISOString(),
        updated_by: authSession.user.id
      }).eq('sku', sku).select('sku,is_available').maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) throw new Error('No row was updated. Check the kitchen-admin permission.');
      availability[sku] = Object.assign({}, availability[sku], { is_available: next, out_of_stock_message: next ? null : 'Temporarily out of stock' });
      if (feedback) feedback.textContent = (menuItems().find(function (item) { return item.sku === sku; }) || { name: sku }).name + (next ? ' is available again.' : ' is now out of stock.');
    } catch (error) {
      if (feedback) feedback.textContent = 'Could not save availability: ' + (error.message || 'Unknown error');
    } finally {
      busySku = '';
      renderAvailability();
    }
  }

  function boot() {
    ensurePanel();
    refreshAvailability();
    try {
      if (typeof sb !== 'undefined' && sb && sb.auth) {
        sb.auth.onAuthStateChange(function () { setTimeout(refreshAvailability, 0); });
      }
    } catch (_) { /* The polling fallback below covers a late admin sign-in. */ }
    window.setInterval(refreshAvailability, 20000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
