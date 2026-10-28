/* The Innocent Kitchen — customer-side live menu availability.
   Load this script after the existing inline script in order.html. */
(function () {
  'use strict';

  let availability = {};
  let loaded = false;
  let loading = false;

  function byId(id) { return document.getElementById(id); }
  function safeText(value) {
    return String(value ?? '').replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function items() {
    try { return Array.isArray(MENU) ? MENU : []; }
    catch (_) { return []; }
  }

  function ensureFeedback() {
    let el = byId('tikMenuAvailabilityFeedback');
    if (el) return el;
    const products = byId('products');
    if (!products) return null;
    el = document.createElement('p');
    el.id = 'tikMenuAvailabilityFeedback';
    el.className = 'section-note';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.textContent = 'Checking today’s menu availability…';
    products.insertAdjacentElement('afterend', el);
    return el;
  }

  function renderAvailableProducts() {
    const products = byId('products');
    if (!products) return;
    products.innerHTML = items().map(function (item) {
      const state = availability[item.id];
      const available = loaded && (!state || state.is_available !== false);
      const buttonLabel = !loaded ? 'Checking…' : (available ? 'Add +' : 'Out of stock');
      const outage = loaded && state && state.is_available === false
        ? '<div style="font-size:12px;color:#8b3029;font-weight:800;margin:6px 0">' + safeText(state.out_of_stock_message || 'Temporarily out of stock') + '</div>'
        : '';
      return '<article class="product"><h3>' + safeText(item.name) + '</h3><p>' + safeText(item.description) + '</p>' + outage +
        '<div class="price-row"><span class="price">' + rupees(item.price) + '</span><button class="btn add" data-add="' + safeText(item.id) + '" ' + (available ? '' : 'disabled') + '>' + buttonLabel + '</button></div></article>';
    }).join('');
  }

  async function refreshAvailability() {
    if (loading) return;
    let client;
    try { client = customerSupabaseClient; } catch (_) { client = null; }
    if (!client) return;
    loading = true;
    const feedback = ensureFeedback();
    try {
      const result = await client.from('menu_availability').select('sku,is_available,out_of_stock_message').order('sku', { ascending: true });
      if (result.error) throw result.error;
      const next = Object.fromEntries((result.data || []).map(function (row) { return [row.sku, { is_available: row.is_available, out_of_stock_message: row.out_of_stock_message }]; }));
      const removed = [];
      try {
        for (const sku of Array.from(cart.keys())) {
          if (next[sku] && next[sku].is_available === false) {
            cart.delete(sku);
            const product = items().find(function (item) { return item.id === sku; });
            removed.push(product ? product.name : sku);
          }
        }
      } catch (_) { /* Cart may not have been initialized yet. */ }
      availability = next;
      loaded = true;
      renderAvailableProducts();
      try { renderCart(); } catch (_) { /* First render may still be finishing. */ }
      const unavailableCount = items().filter(function (item) { return availability[item.id] && availability[item.id].is_available === false; }).length;
      if (feedback) {
        if (removed.length) feedback.textContent = 'Removed from your cart because they are out of stock: ' + removed.join(', ') + '.';
        else if (unavailableCount) feedback.textContent = unavailableCount + ' menu item(s) currently out of stock. Availability refreshes automatically.';
        else feedback.textContent = 'All listed menu items are currently available.';
      }
    } catch (error) {
      loaded = false;
      renderAvailableProducts();
      if (feedback) feedback.textContent = 'Could not check menu availability. Please refresh before ordering. ' + (error.message || '');
    } finally {
      loading = false;
    }
  }

  function boot() {
    ensureFeedback();
    renderAvailableProducts();
    refreshAvailability();
    try {
      if (typeof customerSupabaseClient !== 'undefined' && customerSupabaseClient && customerSupabaseClient.auth) {
        customerSupabaseClient.auth.onAuthStateChange(function () { setTimeout(refreshAvailability, 0); });
      }
    } catch (_) { /* The polling fallback covers a delayed client initialization. */ }
    window.setInterval(refreshAvailability, 30000);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') refreshAvailability();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
