/* The Innocent Kitchen — published daily menu backed by the live Supabase catalogue. */
(function () {
  'use strict';

  let baseMenu = null;
  let loading = false;
  let lastSignature = '';

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
    // MENU is a constant array in order.html; mutate it in place so existing cart/render code keeps working.
    MENU.splice(0, MENU.length, ...menu.map(item => ({ ...item })));
    try { renderProducts(); } catch (_) {}
    try { renderCart(); } catch (_) {}
    const note = ensureNote();
    if (note) note.textContent = message;
    try { document.dispatchEvent(new Event('visibilitychange')); } catch (_) {}
  }

  function lockMenu(message, signature) {
    updateScreen([], signature, message);
    const note = ensureNote();
    if (note) note.style.color = '#8b3029';
  }

  async function fetchLiveCatalogue(client) {
    const { data, error } = await client.from('menu_catalog')
      .select('sku,name,description,base_price,is_active')
      .eq('is_active', true)
      .order('name', { ascending: true });
    if (error) throw error;
    const rows = (data || []).map(row => ({
      id: row.sku,
      name: row.name,
      description: row.description || '',
      price: Number(row.base_price)
    })).filter(row => row.id && row.name && Number.isFinite(row.price) && row.price > 0);
    if (!rows.length) throw new Error('No active menu items are available in the catalogue. Please contact the kitchen.');
    return rows;
  }

  async function refreshDailyMenu() {
    if (loading) return;
    let client;
    try { client = customerSupabaseClient; } catch (_) { client = null; }
    let signedIn = false;
    try { signedIn = !!(customerAuthSession && customerAuthSession.user); } catch (_) {}
    if (!client || !signedIn || !Array.isArray(MENU)) return;

    loading = true;
    const date = getTodayIndia();
    const note = ensureNote();
    if (note && !lastSignature) note.textContent = 'Checking today’s menu…';
    try {
      // Refresh the regular catalogue first so newly added/edited products appear without a code change.
      baseMenu = await fetchLiveCatalogue(client);
      const dayResult = await client.from('daily_menu_days')
        .select('menu_date,title,note,is_published')
        .eq('menu_date', date).eq('is_published', true).maybeSingle();
      if (dayResult.error) throw dayResult.error;
      const day = dayResult.data;

      if (!day) {
        const regularSignature = 'regular:' + date + ':' + JSON.stringify(baseMenu.map(item => [item.id, item.name, item.description, item.price]));
        updateScreen(baseMenu, regularSignature, 'Regular menu is active. Today’s daily menu has not been published yet.');
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
      if (!menu.length) throw new Error('The published menu has no active included items. Please contact the kitchen.');

      const signature = 'published:' + date + ':' + JSON.stringify({
        title: day.title, note: day.note || '', items: menu.map(item => [item.id, item.name, item.description, item.price])
      });
      const parts = [day.title || 'Today’s Menu', menu.length + ' items'];
      if (day.note) parts.push(day.note);
      updateScreen(menu, signature, parts.join(' · '));
      const target = ensureNote();
      if (target) target.style.color = '';
    } catch (error) {
      // Fail closed: never allow checkout against stale or unverifiable menu pricing.
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
    try {
      if (typeof customerSupabaseClient !== 'undefined' && customerSupabaseClient && customerSupabaseClient.auth) {
        customerSupabaseClient.auth.onAuthStateChange((_event, authSession) => {
          baseMenu = null;
          lastSignature = '';
          if (authSession) window.setTimeout(refreshDailyMenu, 0);
        });
      }
    } catch (_) {}
  }

  window.tikDailyMenuRefresh = refreshDailyMenu;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
