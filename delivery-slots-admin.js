/* The Innocent Kitchen — Phase 4: delivery-slot capacity controls.
   Load after admin-availability.js and daily-menu-admin.js in admin-v2.html. */
(function () {
  'use strict';

  const PANEL_ID = 'tikDeliverySlotCapacityPanel';
  const SLOT_DEFAULTS = [
    { slot_label: '12:30 PM – 1:00 PM', capacity: 15, is_open: true, cutoff_time: '12:00', orders_reserved: 0, remaining: 15, cutoff_passed: false },
    { slot_label: '1:00 PM – 1:30 PM', capacity: 15, is_open: true, cutoff_time: '12:30', orders_reserved: 0, remaining: 15, cutoff_passed: false },
    { slot_label: '1:30 PM – 2:00 PM', capacity: 15, is_open: true, cutoff_time: '13:00', orders_reserved: 0, remaining: 15, cutoff_passed: false },
    { slot_label: '7:30 PM – 8:00 PM', capacity: 15, is_open: true, cutoff_time: '19:00', orders_reserved: 0, remaining: 15, cutoff_passed: false },
    { slot_label: '8:00 PM – 8:30 PM', capacity: 15, is_open: true, cutoff_time: '19:30', orders_reserved: 0, remaining: 15, cutoff_passed: false },
    { slot_label: '8:30 PM – 9:00 PM', capacity: 15, is_open: true, cutoff_time: '20:00', orders_reserved: 0, remaining: 15, cutoff_passed: false }
  ];

  let loading = false;
  let saving = false;
  let dirty = false;
  let loadedDate = '';

  function $(id) { return document.getElementById(id); }
  function safeText(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function todayIndia() {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}`;
  }
  function timeField(value) { return String(value || '').slice(0, 5); }
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
        <div><h2 style="margin-bottom:4px">Delivery slot capacity</h2><div class="sub">Control how many scheduled orders each 30-minute slot can accept. Cut-off times use India time.</div></div>
        <button type="button" id="tikSlotsLoad" class="btn light fixed">Load date</button>
      </div>
      <div class="row" style="margin-top:10px;align-items:flex-start">
        <div style="min-width:170px"><label for="tikSlotsDate">Slot date</label><input id="tikSlotsDate" type="date" /></div>
      </div>
      <div class="alert" style="margin-top:10px">A slot closes automatically at its cut-off time or when its order capacity is reached. New bookings are checked again in the database at checkout. Changing capacity does not cancel existing orders.</div>
      <div id="tikSlotsStatus" class="error" role="status" aria-live="polite">Loading slot settings…</div>
      <div id="tikSlotsRows"></div>
      <div class="row" style="margin-top:12px"><button type="button" id="tikSlotsSave" class="btn">Save slot settings</button><button type="button" id="tikSlotsRefresh" class="btn light">Refresh booking counts</button></div>
    `;
    const dailyMenuPanel = $('tikDailyMenuPanel');
    const prepPanel = $('packingPrepPanel');
    if (dailyMenuPanel && dailyMenuPanel.parentElement === dashboard) dashboard.insertBefore(panel, dailyMenuPanel);
    else if (prepPanel && prepPanel.parentElement === dashboard) dashboard.insertBefore(panel, prepPanel);
    else dashboard.prepend(panel);

    $('tikSlotsDate').value = todayIndia();
    $('tikSlotsLoad').addEventListener('click', () => loadSlots(true));
    $('tikSlotsRefresh').addEventListener('click', () => loadSlots(true));
    $('tikSlotsSave').addEventListener('click', saveSlots);
    $('tikSlotsDate').addEventListener('change', () => {
      dirty = false;
      setStatus('Date changed. Tap “Load date” before editing or saving its settings.');
    });
    $('tikSlotsRows').addEventListener('input', () => {
      dirty = true;
      setStatus('Unsaved slot settings. Save to apply them.');
    });
    $('tikSlotsRows').addEventListener('change', () => {
      dirty = true;
      setStatus('Unsaved slot settings. Save to apply them.');
    });
    return panel;
  }

  function setStatus(message) {
    const el = $('tikSlotsStatus');
    if (el) el.textContent = message;
  }

  function renderRows(rows) {
    const target = $('tikSlotsRows');
    if (!target) return;
    const data = rows && rows.length ? rows : SLOT_DEFAULTS;
    target.innerHTML = data.map(row => {
      const reserved = Number(row.orders_reserved || 0);
      const capacity = Number(row.capacity || 15);
      const remaining = Math.max(0, capacity - reserved);
      const closedText = row.cutoff_passed ? ' · cut-off passed' : (row.is_open ? '' : ' · manually closed');
      return `<div style="padding:12px 0;border-bottom:1px solid var(--line)">
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <div style="flex:1;min-width:190px"><b>${safeText(row.slot_label)}</b><div class="sub">Booked: ${reserved} / ${capacity} · ${remaining} remaining${safeText(closedText)}</div></div>
          <label style="display:flex;align-items:center;gap:7px;margin:0;color:var(--ink);font-size:13px"><input type="checkbox" data-slot-open="${safeText(row.slot_label)}" ${row.is_open ? 'checked' : ''} style="width:20px;height:20px"> Accept orders</label>
        </div>
        <div class="row" style="margin-top:8px;align-items:flex-end">
          <div style="min-width:125px"><label>Maximum orders</label><input type="number" min="1" max="500" step="1" inputmode="numeric" data-slot-capacity="${safeText(row.slot_label)}" value="${safeText(capacity)}"></div>
          <div style="min-width:145px"><label>Last order cut-off</label><input type="time" data-slot-cutoff="${safeText(row.slot_label)}" value="${safeText(timeField(row.cutoff_time))}"></div>
        </div>
      </div>`;
    }).join('');
  }

  async function clientAndSession() {
    try {
      if (typeof sb !== 'undefined' && sb && typeof session !== 'undefined' && session && session.user) return { client: sb, session };
    } catch (_) {}
    return null;
  }

  async function loadSlots(force) {
    if (loading || saving) return;
    if (dirty && !force) return;
    const auth = await clientAndSession();
    if (!auth) { setStatus('Sign in as a kitchen administrator to manage delivery slots.'); return; }
    const date = $('tikSlotsDate').value;
    if (!date) { setStatus('Choose a slot date.'); return; }
    loading = true;
    $('tikSlotsLoad').disabled = true;
    $('tikSlotsRefresh').disabled = true;
    setStatus('Loading booking counts for ' + date + '…');
    try {
      const { data, error } = await auth.client.rpc('get_delivery_slot_admin_summary', { p_slot_date: date });
      if (error) throw error;
      const rows = data || [];
      renderRows(rows);
      loadedDate = date;
      dirty = false;
      if (!rows.length) setStatus('No saved slot rows for this date. Default settings are shown; save to create them.');
      else {
        const reserved = rows.reduce((sum, row) => sum + Number(row.orders_reserved || 0), 0);
        setStatus('Loaded ' + date + ' · ' + rows.length + ' slots · ' + reserved + ' scheduled orders currently reserved.');
      }
    } catch (error) {
      renderRows(SLOT_DEFAULTS);
      loadedDate = date;
      dirty = false;
      setStatus('Could not load saved booking counts: ' + (error.message || 'Unknown error') + '. Defaults are shown; confirm access before saving.');
    } finally {
      loading = false;
      $('tikSlotsLoad').disabled = false;
      $('tikSlotsRefresh').disabled = false;
    }
  }

  function collectSlots() {
    return SLOT_DEFAULTS.map(slot => {
      const label = slot.slot_label;
      const open = document.querySelector(`#tikSlotsRows [data-slot-open="${label}"]`);
      const cap = document.querySelector(`#tikSlotsRows [data-slot-capacity="${label}"]`);
      const cut = document.querySelector(`#tikSlotsRows [data-slot-cutoff="${label}"]`);
      if (!open || !cap || !cut) throw new Error('The slot editor is incomplete. Tap Load date and try again.');
      const capacity = Number(cap.value);
      if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500) throw new Error('Capacity for ' + label + ' must be an integer from 1 to 500.');
      if (!/^\d{2}:\d{2}$/.test(cut.value)) throw new Error('Choose a valid cut-off time for ' + label + '.');
      return { slot_label: label, is_open: open.checked, capacity, cutoff_time: cut.value };
    });
  }

  async function saveSlots() {
    if (saving || loading) return;
    const auth = await clientAndSession();
    if (!auth) { setStatus('Sign in as a kitchen administrator first.'); return; }
    const date = $('tikSlotsDate').value;
    if (!date || date !== loadedDate) { setStatus('Tap “Load date” after choosing the date, then save.'); return; }
    let slots;
    try { slots = collectSlots(); }
    catch (error) { setStatus(error.message || 'Check the slot settings.'); return; }
    saving = true;
    $('tikSlotsSave').disabled = true;
    $('tikSlotsLoad').disabled = true;
    $('tikSlotsRefresh').disabled = true;
    setStatus('Saving slot capacity and cut-off times…');
    try {
      const { data, error } = await auth.client.rpc('save_delivery_slots', { p_slot_date: date, p_slots: slots });
      if (error) throw error;
      dirty = false;
      setStatus('Saved ' + (data && data.saved_slots ? data.saved_slots : slots.length) + ' slot settings for ' + date + '. Refreshing booking counts…');
      saving = false;
      await loadSlots(true);
    } catch (error) {
      setStatus('Could not save slot settings: ' + (error.message || 'Unknown error'));
    } finally {
      saving = false;
      $('tikSlotsSave').disabled = false;
      $('tikSlotsLoad').disabled = false;
      $('tikSlotsRefresh').disabled = false;
    }
  }

  function boot() {
    if (!ensurePanel()) return;
    loadSlots(true);
    try {
      if (typeof sb !== 'undefined' && sb && sb.auth) sb.auth.onAuthStateChange(() => window.setTimeout(() => loadSlots(true), 0));
    } catch (_) {}
    window.setInterval(() => loadSlots(false), 20000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
