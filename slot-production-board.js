/* The Innocent Kitchen — Phase 5: slot-wise production and dispatch board.
   Load after the existing admin scripts in admin-v2.html.
   Uses the existing admin order list and shared recipe templates; checklist state is saved in Supabase. */
(function () {
  'use strict';

  const PANEL_ID = 'tikSlotProductionBoard';
  const CHECK_TABLE = 'delivery_slot_batch_checks';
  let loading = false;
  let savingOrder = '';
  let savingTask = '';
  let slots = [];
  let checklist = {};
  let lastDate = '';
  let lastLoadMessage = '';

  function $(id) { return document.getElementById(id); }
  function safeText(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function todayIndia() {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}`;
  }
  function dateInIndia(value) {
    if (!value) return '';
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
    const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}`;
  }
  function adminClient() {
    try {
      if (typeof sb !== 'undefined' && sb && typeof session !== 'undefined' && session && session.user) return { client: sb, session };
    } catch (_) {}
    return null;
  }
  function orderList() {
    try { return Array.isArray(orders) ? orders : []; } catch (_) { return []; }
  }
  function recipes() {
    try { return prepRecipes && typeof prepRecipes === 'object' ? prepRecipes : {}; } catch (_) { return {}; }
  }
  function menuName(sku) {
    try { return ORDER_MENU.find(x => x.sku === sku)?.name || sku; } catch (_) { return sku; }
  }
  function rupees(n) {
    try { return typeof money === 'function' ? money(n) : '₹' + Number(n || 0).toFixed(0); }
    catch (_) { return '₹' + Number(n || 0).toFixed(0); }
  }
  function shortStatus(status) { return String(status || 'unknown').replaceAll('_', ' '); }

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
        <div><h2 style="margin-bottom:4px">Slot-wise Production &amp; Dispatch Board</h2>
          <div class="sub">Orders are grouped by delivery slot. Ingredient totals use the shared recipes for accepted and preparing orders. Stage changes update the existing order record.</div>
        </div>
        <button type="button" class="btn light fixed" id="tikBatchRefresh">Refresh board</button>
      </div>
      <div class="row" style="margin-top:10px;align-items:flex-end">
        <div style="min-width:150px"><label for="tikBatchDate">Delivery date</label><input id="tikBatchDate" type="date"></div>
        <div style="min-width:160px"><label for="tikBatchGroupFilter">Show batches</label><select id="tikBatchGroupFilter"><option value="all">All slots</option><option value="active">Slots with open orders</option><option value="risk">At-risk / overdue only</option></select></div>
      </div>
      <div id="tikBatchStatus" class="alert" role="status" aria-live="polite" style="margin-top:10px">Loading production board…</div>
      <div class="stats">
        <div class="stat"><b id="tikBatchOrders">0</b><span>Open orders</span></div>
        <div class="stat"><b id="tikBatchProduction">0</b><span>In production</span></div>
        <div class="stat"><b id="tikBatchDispatch">0</b><span>Packed / dispatched</span></div>
        <div class="stat"><b id="tikBatchRisk">0</b><span>At risk / overdue</span></div>
      </div>
      <div id="tikBatchGroups"><div class="empty">Select a date and refresh.</div></div>
      <p class="tiny">Orders are not auto-accepted. Recipe totals exclude orders that are still new, rejected, cancelled, already packed, or in delivery. Verify recipe quantities before production; an unconfigured recipe is flagged.</p>`;

    const anchor = $('packingPrepPanel');
    if (anchor && anchor.parentElement === dashboard) dashboard.insertBefore(panel, anchor);
    else dashboard.prepend(panel);

    $('tikBatchDate').value = todayIndia();
    $('tikBatchRefresh').addEventListener('click', () => loadBoard(true));
    $('tikBatchDate').addEventListener('change', () => setStatus('Date changed. Tap “Refresh board” to load orders and checklist for this date.'));
    $('tikBatchGroupFilter').addEventListener('change', () => renderBoard());
    panel.addEventListener('click', handleBoardClick);
    panel.addEventListener('change', handleBoardChange);
    return panel;
  }

  function setStatus(message, isError) {
    const el = $('tikBatchStatus');
    if (!el) return;
    el.textContent = message;
    el.style.color = isError ? '#8b3029' : '';
  }

  function dateTimeIndia(date, time) {
    if (!date || !time) return null;
    const t = String(time).slice(0, 8);
    const d = new Date(`${date}T${t}+05:30`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function slotForOrder(o) {
    if (o.fulfilment_type !== 'scheduled') return null;
    return slots.find(s => s.slot_label === o.delivery_slot) || null;
  }

  function riskForOrder(o) {
    const status = o.order_status;
    if (['delivered', 'cancelled', 'rejected'].includes(status)) return '';
    const slot = slotForOrder(o);
    const now = new Date();
    if (o.fulfilment_type === 'scheduled' && slot) {
      const date = o.delivery_date || dateInIndia(o.created_at);
      const start = dateTimeIndia(date, slot.start_time);
      const end = dateTimeIndia(date, slot.end_time);
      if (end && now > end) return 'overdue';
      if (start && now >= new Date(start.getTime() - 15 * 60 * 1000) && ['new', 'accepted', 'preparing', 'packed'].includes(status)) return 'at-risk';
      return '';
    }
    if (o.fulfilment_type !== 'scheduled' && ['new', 'accepted', 'preparing'].includes(status)) {
      const created = new Date(o.created_at).getTime();
      if (Number.isFinite(created) && now.getTime() - created >= 20 * 60 * 1000) return 'at-risk';
    }
    return '';
  }

  function orderDate(o) {
    return o.fulfilment_type === 'scheduled'
      ? (o.delivery_date || dateInIndia(o.created_at))
      : dateInIndia(o.created_at);
  }

  function isOpenOrder(o) { return !['cancelled', 'rejected'].includes(o.order_status); }
  function isProductionOrder(o) { return ['accepted', 'preparing'].includes(o.order_status); }
  function statusNext(status) {
    const map = { new: 'accepted', accepted: 'preparing', preparing: 'packed', packed: 'out_for_delivery', out_for_delivery: 'delivered' };
    return map[status] || '';
  }
  function nextAction(status) {
    const map = { new: 'Accept order', accepted: 'Start preparation', preparing: 'Mark packed', packed: 'Mark dispatched', out_for_delivery: 'Mark delivered' };
    return map[status] || '';
  }
  function riskLabel(risk) {
    if (risk === 'overdue') return '<span class="pill red">OVERDUE</span>';
    if (risk === 'at-risk') return '<span class="pill warn">AT RISK</span>';
    return '';
  }
  function checkKey(component) {
    return 'ingredient|' + String(component.name || '').trim().toLowerCase().replace(/\s+/g, ' ') + '|' + String(component.unit || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }
  function formatQty(qty) {
    const n = Number(qty || 0);
    return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3)));
  }

  function productionTotals(slotOrders) {
    const active = slotOrders.filter(isProductionOrder);
    const skuCounts = {};
    const components = {};
    const unmapped = new Set();
    let units = 0;
    active.forEach(o => (o.customer_order_items || []).forEach(item => {
      const sku = item.sku;
      const quantity = Number(item.quantity) || 0;
      if (quantity <= 0) return;
      units += quantity;
      skuCounts[sku] = (skuCounts[sku] || 0) + quantity;
      const recipe = recipes()[sku];
      if (!Array.isArray(recipe) || recipe.length === 0) { unmapped.add(sku); return; }
      recipe.forEach(c => {
        const name = String(c.name || '').trim();
        const unit = String(c.unit || '').trim();
        const amount = Number(c.qty);
        if (!name || !unit || !Number.isFinite(amount) || amount <= 0) return;
        const key = name.toLowerCase().replace(/\s+/g, ' ') + '|||' + unit.toLowerCase().replace(/\s+/g, ' ');
        if (!components[key]) components[key] = { name, unit, qty: 0, key: '' };
        components[key].qty += amount * quantity;
      });
    }));
    const list = Object.values(components).map(c => ({ ...c, qty: Number(c.qty.toFixed(3)) })).sort((a, b) => a.name.localeCompare(b.name));
    list.forEach(c => { c.key = checkKey(c); });
    return { active, skuCounts, components: list, unmapped: [...unmapped], units };
  }

  function groupTitle(slot) {
    if (slot.key === '__immediate__') return 'Immediate requests';
    if (slot.key === '__other__') return 'Other / unconfigured scheduled slots';
    return slot.slot_label;
  }

  function activeOrdersForDate(date) {
    return orderList().filter(o => orderDate(o) === date && isOpenOrder(o));
  }

  function buildGroups(date) {
    const forDate = activeOrdersForDate(date);
    const groups = slots.map(slot => ({ ...slot, key: slot.slot_label, orders: forDate.filter(o => o.fulfilment_type === 'scheduled' && o.delivery_slot === slot.slot_label) }));
    const knownLabels = new Set(slots.map(s => s.slot_label));
    const unknownScheduled = forDate.filter(o => o.fulfilment_type === 'scheduled' && (!o.delivery_slot || !knownLabels.has(o.delivery_slot)));
    if (unknownScheduled.length) groups.push({ key: '__other__', slot_label: '', orders: unknownScheduled });
    const immediate = forDate.filter(o => o.fulfilment_type !== 'scheduled');
    if (immediate.length) groups.push({ key: '__immediate__', slot_label: '', orders: immediate });
    return groups;
  }

  async function loadChecklist(date) {
    const auth = adminClient();
    if (!auth) return;
    const { data, error } = await auth.client.from(CHECK_TABLE)
      .select('slot_date,slot_label,task_key,task_label,expected_qty,is_done')
      .eq('slot_date', date);
    if (error) throw error;
    const map = {};
    (data || []).forEach(row => { map[row.slot_label + '|||' + row.task_key] = row; });

    // A change in the total quantity resets that ingredient's check, so a previously checked batch cannot hide a new requirement.
    const changed = [];
    // Include configured slots plus separate groups for immediate requests and any legacy/unconfigured slot labels.
    for (const group of buildGroups(date)) {
      const slotKey = group.key;
      const totals = productionTotals(group.orders);
      for (const component of totals.components) {
        const mapKey = slotKey + '|||' + component.key;
        const old = map[mapKey];
        if (!old || Math.abs(Number(old.expected_qty) - component.qty) > 0.0005) {
          changed.push({
            slot_date: date,
            slot_label: slotKey,
            task_key: component.key,
            task_label: component.name + ' — ' + formatQty(component.qty) + ' ' + component.unit,
            expected_qty: component.qty,
            is_done: false,
            updated_at: new Date().toISOString(),
            updated_by: auth.session.user.id
          });
        }
      }
    }
    if (changed.length) {
      const { error: writeError } = await auth.client.from(CHECK_TABLE).upsert(changed, { onConflict: 'slot_date,slot_label,task_key' });
      if (writeError) throw writeError;
      const { data: fresh, error: freshError } = await auth.client.from(CHECK_TABLE)
        .select('slot_date,slot_label,task_key,task_label,expected_qty,is_done').eq('slot_date', date);
      if (freshError) throw freshError;
      Object.keys(map).forEach(key => delete map[key]);
      (fresh || []).forEach(row => { map[row.slot_label + '|||' + row.task_key] = row; });
    }
    checklist = map;
  }

  async function loadBoard(force) {
    if (loading || savingTask || (savingOrder && !force)) return;
    const auth = adminClient();
    if (!auth) { setStatus('Sign in as a kitchen administrator to view production batches.'); return; }
    const date = $('tikBatchDate')?.value || todayIndia();
    if (!date) { setStatus('Choose a delivery date.'); return; }
    loading = true;
    $('tikBatchRefresh').disabled = true;
    setStatus('Refreshing slot batches for ' + date + '…');
    try {
      if (force && typeof loadOrders === 'function') await loadOrders();
      const { data, error } = await auth.client.from('daily_delivery_slots')
        .select('slot_date,slot_label,start_time,end_time,cutoff_time,capacity,is_open,sort_order')
        .eq('slot_date', date).order('sort_order', { ascending: true });
      if (error) throw error;
      slots = data || [];
      lastDate = date;
      await loadChecklist(date);
      renderBoard();
      lastLoadMessage = 'Loaded ' + date + ' · ' + slots.length + ' scheduled slots · ' + activeOrdersForDate(date).length + ' open orders. Ingredient totals include accepted and preparing orders only.';
      setStatus(lastLoadMessage, false);
    } catch (error) {
      setStatus('Could not load the production board: ' + (error.message || 'Unknown error') + '. Existing orders and status controls are still available below.', true);
    } finally {
      loading = false;
      if ($('tikBatchRefresh')) $('tikBatchRefresh').disabled = false;
    }
  }

  function renderIngredients(date, slotLabel, totals) {
    if (!totals.active.length) return '<div class="empty">No accepted or preparing orders in production for this batch.</div>';
    let html = '';
    const skuRows = Object.entries(totals.skuCounts).sort((a, b) => String(menuName(a[0])).localeCompare(String(menuName(b[0]))));
    html += '<h3 style="margin:14px 0 6px">Items to prepare</h3><table class="prep-table"><thead><tr><th>Menu item</th><th>Recipe</th><th style="text-align:right">Qty</th></tr></thead><tbody>' + skuRows.map(([sku, qty]) => {
      const configured = Array.isArray(recipes()[sku]) && recipes()[sku].length;
      return '<tr><td>' + safeText(menuName(sku)) + '</td><td>' + (configured ? '<span class="pill">Configured</span>' : '<span class="prep-bad">Recipe needed</span>') + '</td><td style="text-align:right"><b>' + qty + '</b></td></tr>';
    }).join('') + '</tbody></table>';
    if (totals.unmapped.length) html += '<div class="alert" style="margin-top:8px">Ingredient totals are incomplete. Add shared recipes for: ' + totals.unmapped.map(safeText).join(', ') + '.</div>';
    if (!totals.components.length) html += '<div class="empty">No ingredient quantities yet. Configure verified shared recipe templates.</div>';
    else {
      const checks = totals.components.map(c => checklist[slotLabel + '|||' + c.key]).filter(Boolean);
      const done = checks.filter(c => c.is_done).length;
      html += '<h3 style="margin:14px 0 6px">Ingredient / prep checklist</h3><div class="sub" style="margin-bottom:6px">' + done + '/' + totals.components.length + ' quantities checked. A quantity change resets that ingredient’s check.</div>';
      html += totals.components.map(c => {
        const state = checklist[slotLabel + '|||' + c.key];
        const checked = !!(state && state.is_done);
        return '<label class="component-check ' + (checked ? 'done' : '') + '"><input type="checkbox" data-batch-check="1" data-date="' + safeText(date) + '" data-slot="' + safeText(slotLabel) + '" data-task-key="' + safeText(c.key) + '" data-qty="' + safeText(String(c.qty)) + '" ' + (checked ? 'checked' : '') + (savingTask === slotLabel + '|||' + c.key ? ' disabled' : '') + '><span class="component-name">' + safeText(c.name) + '<div class="sub">' + safeText(c.unit) + '</div></span><span class="component-qty">' + formatQty(c.qty) + ' ' + safeText(c.unit) + '</span></label>';
      }).join('');
    }
    return html;
  }

  function renderOrderCard(o, date, slot) {
    const next = statusNext(o.order_status);
    const risk = riskForOrder(o);
    const itemText = (o.customer_order_items || []).map(i => safeText(i.item_name) + ' × ' + Number(i.quantity)).join(' · ');
    const statusClass = ['rejected','cancelled'].includes(o.order_status) ? 'pill red' : ['new','accepted'].includes(o.order_status) ? 'pill warn' : 'pill';
    const statusAction = next ? '<button type="button" class="btn light" data-board-next="' + safeText(o.id) + '" data-next-status="' + safeText(next) + '" ' + (savingOrder === o.id ? 'disabled' : '') + '>' + (savingOrder === o.id ? 'Saving…' : safeText(nextAction(o.order_status))) + '</button>' : '';
    return '<article class="order" style="margin:8px 0;padding:10px"><div class="order-top"><div style="min-width:0"><div class="order-number">' + safeText(o.order_number) + ' · ' + safeText(o.customer_name) + '</div><div class="sub">' + safeText(o.building || '') + (o.room ? ' · ' + safeText(o.room) : '') + '</div><div style="margin-top:6px"><span class="' + statusClass + '">' + safeText(shortStatus(o.order_status)) + '</span> ' + riskLabel(risk) + '</div></div><div class="fixed" style="font-weight:800">' + rupees(o.total_amount) + '</div></div><div style="margin-top:7px;font-size:13px">' + (itemText || 'No item details') + '</div>' + (o.delivery_address ? '<div class="sub" style="margin-top:5px">Delivery address: ' + safeText(o.delivery_address) + '</div>' : '') + (o.notes ? '<div class="sub" style="margin-top:5px">Kitchen note: ' + safeText(o.notes) + '</div>' : '') + '<div class="row" style="align-items:center;margin-top:8px"><div class="sub">' + (o.fulfilment_type === 'scheduled' ? safeText(o.delivery_slot || 'Slot unspecified') : 'Immediate request') + (o.phone ? ' · <a href="tel:' + safeText(o.phone) + '">' + safeText(o.phone) + '</a>' : '') + '</div>' + statusAction + '</div></article>';
  }

  function renderBoard() {
    const target = $('tikBatchGroups');
    if (!target) return;
    const date = $('tikBatchDate')?.value || todayIndia();
    const allGroups = buildGroups(date);
    const allOrders = allGroups.flatMap(g => g.orders);
    const riskOrders = allOrders.filter(o => riskForOrder(o));
    const productionOrders = allOrders.filter(isProductionOrder);
    const dispatchOrders = allOrders.filter(o => ['packed','out_for_delivery'].includes(o.order_status));
    $('tikBatchOrders').textContent = allOrders.filter(o => !['delivered','cancelled','rejected'].includes(o.order_status)).length;
    $('tikBatchProduction').textContent = productionOrders.length;
    $('tikBatchDispatch').textContent = dispatchOrders.length;
    $('tikBatchRisk').textContent = riskOrders.length;

    const filter = $('tikBatchGroupFilter')?.value || 'all';
    let groups = allGroups;
    if (filter === 'active') groups = groups.filter(g => g.orders.length);
    if (filter === 'risk') groups = groups.filter(g => g.orders.some(o => riskForOrder(o)));
    if (!groups.length) {
      target.innerHTML = '<div class="empty">No batches match this filter for ' + safeText(date) + '.</div>';
      return;
    }

    target.innerHTML = groups.map(group => {
      const groupOrders = group.orders.slice().sort((a, b) => {
        const rank = { new: 0, accepted: 1, preparing: 2, packed: 3, out_for_delivery: 4, delivered: 5 };
        return (rank[a.order_status] ?? 9) - (rank[b.order_status] ?? 9) || new Date(a.created_at) - new Date(b.created_at);
      });
      const live = groupOrders.filter(o => !['delivered','cancelled','rejected'].includes(o.order_status));
      const risks = groupOrders.filter(o => riskForOrder(o));
      const totals = productionTotals(groupOrders);
      const dispatchDone = groupOrders.filter(o => o.order_status === 'delivered').length;
      const meta = group.key === '__immediate__' || group.key === '__other__' ? '' : '<div class="sub">Cut-off ' + safeText(String(group.cutoff_time || '').slice(0,5)) + ' · Capacity ' + safeText(group.capacity ?? '—') + ' · ' + (group.is_open ? 'Slot open' : 'Slot closed') + '</div>';
      const orderListHtml = groupOrders.length ? groupOrders.map(o => renderOrderCard(o, date, group.slot_label)).join('') : '<div class="empty">No orders in this batch.</div>';
      return '<section class="panel" style="background:#fbfcfa;margin:10px 0;padding:12px"><div class="row" style="align-items:flex-start"><div><h3 style="margin:0 0 4px">' + safeText(groupTitle(group)) + '</h3>' + meta + '</div><div class="sub" style="text-align:right">' + live.length + ' open · ' + dispatchDone + ' delivered' + (risks.length ? ' · <span style="color:#8b3029;font-weight:800">' + risks.length + ' at risk</span>' : '') + '</div></div>' + renderIngredients(date, group.key, totals) + '<h3 style="margin:14px 0 6px">Orders in this batch</h3>' + orderListHtml + '</section>';
    }).join('');
  }

  async function handleBoardClick(event) {
    const button = event.target.closest('[data-board-next]');
    if (!button) return;
    const auth = adminClient();
    if (!auth) { setStatus('Sign in as a kitchen administrator before updating order stages.', true); return; }
    const id = button.dataset.boardNext;
    const next = button.dataset.nextStatus;
    const order = orderList().find(o => o.id === id);
    if (!order || statusNext(order.order_status) !== next) { setStatus('This order changed since the board loaded. Refresh before changing its status.', true); return; }
    if (!confirm('Update ' + order.order_number + ' to “' + shortStatus(next) + '”?')) return;
    savingOrder = id;
    renderBoard();
    try {
      const { data, error } = await auth.client.from('customer_orders')
        .update({ order_status: next, updated_at: new Date().toISOString() })
        .eq('id', id).select('id,order_status').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('No order was updated. Confirm that you are signed in as a kitchen administrator.');
      setStatus('Updated ' + order.order_number + ' to ' + shortStatus(data.order_status) + '. Refreshing board…');
      await loadBoard(true);
    } catch (error) {
      setStatus('Could not update order stage: ' + (error.message || 'Unknown error'), true);
      alert('Could not update order stage: ' + (error.message || 'Unknown error'));
    } finally {
      savingOrder = '';
      renderBoard();
    }
  }

  async function handleBoardChange(event) {
    const checkbox = event.target.closest('[data-batch-check]');
    if (!checkbox) return;
    const auth = adminClient();
    if (!auth) { checkbox.checked = !checkbox.checked; setStatus('Sign in as a kitchen administrator to save checklist ticks.', true); return; }
    const date = checkbox.dataset.date;
    const slotLabel = checkbox.dataset.slot;
    const taskKey = checkbox.dataset.taskKey;
    const qty = Number(checkbox.dataset.qty);
    const mapKey = slotLabel + '|||' + taskKey;
    savingTask = mapKey;
    checkbox.disabled = true;
    try {
      const { error } = await auth.client.from(CHECK_TABLE).upsert({
        slot_date: date, slot_label: slotLabel, task_key: taskKey,
        task_label: (checklist[mapKey]?.task_label) || taskKey,
        expected_qty: qty, is_done: checkbox.checked,
        updated_at: new Date().toISOString(), updated_by: auth.session.user.id
      }, { onConflict: 'slot_date,slot_label,task_key' });
      if (error) throw error;
      if (checklist[mapKey]) checklist[mapKey].is_done = checkbox.checked;
      setStatus('Saved shared batch checklist for ' + slotLabel + '.');
    } catch (error) {
      checkbox.checked = !checkbox.checked;
      setStatus('Could not save checklist: ' + (error.message || 'Unknown error'), true);
    } finally {
      savingTask = '';
      renderBoard();
    }
  }

  function boot() {
    if (!ensurePanel()) return;
    loadBoard(true);
    try {
      if (typeof sb !== 'undefined' && sb && sb.auth) sb.auth.onAuthStateChange(() => window.setTimeout(() => loadBoard(true), 0));
    } catch (_) {}
    window.setInterval(() => {
      if ($('dashboard') && !$('dashboard').classList.contains('hidden')) loadBoard(false);
    }, 20000);
  }

  window.tikSlotProductionBoardRefresh = () => loadBoard(true);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
