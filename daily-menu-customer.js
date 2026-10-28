/* The Innocent Kitchen — show the published menu for today's date in Asia/Kolkata. */
(function () {
  'use strict';

  let baseMenu = null;
  let loading = false;
  let lastSignature = '';
  let lastMenuDate = '';

  function getTodayIndia() {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}`;
  }

  function ensureNote() {
    let note = document.getElementById('tikDailyMenuCustomerNote');
    if (note) return note;
    const products = document.getElementById('products');
    if (!products) return null;
    note = document.createElement('div');
    note.id = 'tikDailyMenuCustomerNote';
    note.className = 'section-note';
    note.setAttribute('role', 'status');
    note.setAttribute('aria-live', 'polite');
    note.style.margin = '10px 0';
    products.insertAdjacentElement('beforebegin', note);
    return note;
  }

  function updateScreen(menu, signature, message) {
    if (signature === lastSignature) {
      const note = ensureNote();
      if (note && message) note.textContent = message;
      return;
    }
    lastSignature = signature;
    const nextIds = new Set(menu.map(item => item.id));
    try {
      for (const sku of Array.from(cart.keys())) {
        if (!nextIds.has(sku)) cart.delete(sku);
      }
    } catch (_) {}
    MENU.splice(0, MENU.length, ...menu.map(item => ({ ...item })));
    try { renderProducts(); } catch (_) {}
    try { renderCart(); } catch (_) {}
    const note = ensureNote();
    if (note) note.textContent = message;
    // Ask the existing out-of-stock script to rerender against the newly applied daily SKU list.
    try { document.dispatchEvent(new Event('visibilitychange')); } catch (_) {}
  }

  function lockMenu(message, signature) {
    updateScreen([], signature, message);
    const note = ensureNote();
    if (note) note.style.color = '#8b3029';
  }

  async function refreshDailyMenu() {
    if (loading) return;
    let client;
    try { client = customerSupabaseClient; } catch (_) { client = null; }
    if (!client) return;
    if (!Array.isArray(MENU)) return;
    if (baseMenu === null) baseMenu = MENU.map(item => ({ ...item }));

    loading = true;
    const date = getTodayIndia();
    const note = ensureNote();
    if (note && !lastSignature) note.textContent = 'Checking today’s menu…';
    try {
      const dayResult = await client.from('daily_menu_days')
        .select('menu_date,title,note,is_published')
        .eq('menu_date', date).eq('is_published', true).maybeSingle();
      if (dayResult.error) throw dayResult.error;
      const day = dayResult.data;

      if (!day) {
        lastMenuDate = date;
        updateScreen(baseMenu, 'regular:' + date, 'Regular menu is active. Today’s daily menu has not been published yet.');
        const target = ensureNote();
        if (target) target.style.color = '';
        return;
      }

      const itemsResult = await client.from('daily_menu_items')
        .select('sku,is_included,custom_price')
        .eq('menu_date', date).eq('is_included', true);
      if (itemsResult.error) throw itemsResult.error;
      const records = Object.fromEntries((itemsResult.data || []).map(row => [row.sku, row]));
      const menu = baseMenu.filter(item => records[item.id]).map(item => ({
        ...item,
        price: records[item.id].custom_price === null || records[item.id].custom_price === undefined
          ? item.price : Number(records[item.id].custom_price)
      }));
      if (!menu.length) throw new Error('The published menu has no included items. Please contact the kitchen.');

      const signature = 'published:' + date + ':' + JSON.stringify({
        title: day.title, note: day.note || '', items: menu.map(item => [item.id, item.price])
      });
      lastMenuDate = date;
      const parts = [day.title || 'Today’s Menu', menu.length + ' items'];
      if (day.note) parts.push(day.note);
      updateScreen(menu, signature, parts.join(' · '));
      const target = ensureNote();
      if (target) target.style.color = '';
    } catch (error) {
      // Fail closed: do not let a customer order with stale prices if today's published menu could not be checked.
      lockMenu('Could not verify today’s menu. Ordering is paused; refresh the page and try again. ' + (error.message || ''), 'error:' + date + ':' + String(error.message || 'unknown'));
    } finally {
      loading = false;
    }
  }

  function boot() {
    ensureNote();
    refreshDailyMenu();
    window.setInterval(refreshDailyMenu, 60000);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') refreshDailyMenu();
    });
    window.addEventListener('focus', refreshDailyMenu);
  }

  window.tikDailyMenuRefresh = refreshDailyMenu;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
