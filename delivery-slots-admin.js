/* The Innocent Kitchen — date-specific configurable delivery slots.
   Requires admin-v2.html globals sb/session and public RPCs get_delivery_slot_admin_summary/save_delivery_slots. */
(function () {
  'use strict';

  const PANEL_ID = 'tikDeliverySlotCapacityPanel';
  const MAX_SLOTS = 12;
  const DEFAULT_SLOTS = [
    { slot_label: '12:30 PM – 1:00 PM', start_time: '12:30', end_time: '13:00', capacity: 15, is_open: true, cutoff_time: '12:00', orders_reserved: 0, remaining: 15, cutoff_passed: false },
    { slot_label: '1:00 PM – 1:30 PM', start_time: '13:00', end_time: '13:30', capacity: 15, is_open: true, cutoff_time: '12:30', orders_reserved: 0, remaining: 15, cutoff_passed: false },
    { slot_label: '1:30 PM – 2:00 PM', start_time: '13:30', end_time: '14:00', capacity: 15, is_open: true, cutoff_time: '13:00', orders_reserved: 0, remaining: 15, cutoff_passed: false },
    { slot_label: '7:30 PM – 8:00 PM', start_time: '19:30', end_time: '20:00', capacity: 15, is_open: true, cutoff_time: '19:00', orders_reserved: 0, remaining: 15, cutoff_passed: false },
    { slot_label: '8:00 PM – 8:30 PM', start_time: '20:00', end_time: '20:30', capacity: 15, is_open: true, cutoff_time: '19:30', orders_reserved: 0, remaining: 15, cutoff_passed: false },
    { slot_label: '8:30 PM – 9:00 PM', start_time: '20:30', end_time: '21:00', capacity: 15, is_open: true, cutoff_time: '20:00', orders_reserved: 0, remaining: 15, cutoff_passed: false }
  ];

  let loading = false;
  let saving = false;
  let dirty = false;
  let loadedDate = '';
  let workingSlots = [];

  function $(id) { return document.getElementById(id); }
  function safeText(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }
  function todayIndia() {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}`;
  }
  function timeField(value) { return String(value || '').slice(0, 5); }
  function minutes(value) {
    if (!/^\d{2}:\d{2}$/.test(String(value || ''))) return NaN;
    const [h, m] = value.split(':').map(Number);
    return h * 60 + m;
  }
  function readableTime(value) {
    const total = minutes(timeField(value));
    if (!Number.isFinite(total)) return '';
    const h24 = Math.floor(total / 60), m = total % 60;
    const suffix = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
  }
  function makeLabel(start, end) {
    const a = readableTime(start), b = readableTime(end);
    return a && b ? `${a} – ${b}` : 'Choose slot times';
  }
  function normalizeSlot(row, isFromDatabase) {
    const label = String(row.slot_label || makeLabel(row.start_time, row.end_time));
    return {
      slot_label: label,
      original_slot_label: isFromDatabase ? label : (row.original_slot_label || label),
      start_time: timeField(row.start_time),
      end_time: timeField(row.end_time),
      cutoff_time: timeField(row.cutoff_time),
      capacity: Number(row.capacity || 15),
      is_open: row.is_open !== false,
      orders_reserved: Number(row.orders_reserved || 0),
      remaining: Number(row.remaining ?? Math.max(0, Number(row.capacity || 15) - Number(row.orders_reserved || 0))),
      cutoff_passed: !!row.cutoff_passed,
      fromDatabase: !!isFromDatabase
    };
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
        <div><h2 style="margin-bottom:4px">Delivery slot manager</h2><div class="sub">Create different delivery windows for each date, change capacity and cut-off times, or close a slot. Up to 12 non-overlapping slots per day.</div></div>
        <button type="button" id="tikSlotsLoad" class="btn light fixed">Load date</button>
      </div>
      <div class="row" style="margin-top:10px;align-items:flex-start">
        <div style="min-width:170px"><label for="tikSlotsDate">Slot date</label><input id="tikSlotsDate" type="date" /></div>
      </div>
      <div class="alert" style="margin-top:10px">Closing a slot prevents new bookings; it does not cancel orders already placed. Slot times cannot be changed after orders are associated with that slot. In that case, close it and add a new time window.</div>
      <div class="recipe-editor" style="margin-top:12px">
        <h3 style="margin-top:0">Add a slot to this date</h3>
        <div class="row" style="align-items:flex-end">
          <div style="min-width:125px"><label for="tikNewSlotStart">Start time</label><input id="tikNewSlotStart" type="time" /></div>
          <div style="min-width:125px"><label for="tikNewSlotEnd">End time</label><input id="tikNewSlotEnd" type="time" /></div>
          <div style="min-width:125px"><label for="tikNewSlotCutoff">Order cut-off</label><input id="tikNewSlotCutoff" type="time" /></div>
          <div style="min-width:105px"><label for="tikNewSlotCapacity">Max orders</label><input id="tikNewSlotCapacity" type="number" min="1" max="500" step="1" inputmode="numeric" value="15" /></div>
        </div>
        <div class="row" style="margin-top:8px"><button type="button" id="tikSlotsAdd" class="btn light">Add slot to schedule</button><span class="sub" id="tikSlotsAddPreview">Enter a start and end time. Changes are not saved until you tap Save slot settings.</span></div>
      </div>
      <div id="tikSlotsStatus" class="error" role="status" aria-live="polite" style="margin-top:12px">Loading slot settings…</div>
      <div id="tikSlotsRows"></div>
      <div class="row" style="margin-top:12px"><button type="button" id="tikSlotsSave" class="btn">Save slot settings</button><button type="button" id="tikSlotsRefresh" class="btn light">Refresh booking counts</button></div>
      <p class="tiny">Each date has its own saved schedule. A newly added slot applies to the selected date only. The customer page automatically hides closed, past-cut-off, and full slots.</p>
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
    $('tikSlotsAdd').addEventListener('click', addSlot);
    $('tikSlotsDate').addEventListener('change', () => {
      if (dirty && !window.confirm('Discard unsaved slot changes and load another date?')) {
        $('tikSlotsDate').value = loadedDate || todayIndia();
        return;
      }
      dirty = false;
      setStatus('Date changed. Tap “Load date” before editing or saving its settings.');
    });
    ['tikNewSlotStart', 'tikNewSlotEnd'].forEach(id => $(id).addEventListener('input', updateAddPreview));

    $('tikSlotsRows').addEventListener('input', handleRowEdit);
    $('tikSlotsRows').addEventListener('change', handleRowEdit);
    return panel;
  }

  function setStatus(message, isError) {
    const el = $('tikSlotsStatus');
    if (el) {
      el.textContent = message;
      el.style.color = isError ? 'var(--red)' : '';
      el.style.background = isError ? '#fff0ee' : '';
    }
  }
  function setDirty(message) {
    dirty = true;
    setStatus(message || 'Unsaved slot changes. Tap “Save slot settings” to apply them.');
  }
  function updateAddPreview() {
    const label = makeLabel($('tikNewSlotStart').value, $('tikNewSlotEnd').value);
    $('tikSlotsAddPreview').textContent = label === 'Choose slot times' ? 'Enter a start and end time.' : 'New slot: ' + label;
  }

  function renderRows() {
    const target = $('tikSlotsRows');
    if (!target) return;
    if (!workingSlots.length) {
      target.innerHTML = '<div class="empty">No slots are configured for this date. Add at least one slot before saving.</div>';
      return;
    }
    target.innerHTML = workingSlots.map((row, index) => {
      const reserved = Number(row.orders_reserved || 0);
      const capacity = Number(row.capacity || 15);
      const remaining = Math.max(0, capacity - reserved);
      const closedText = row.cutoff_passed ? ' · cut-off passed' : (row.is_open ? '' : ' · manually closed');
      const cannotRename = reserved > 0;
      return `<div class="tik-slot-row" data-slot-index="${index}" data-original-slot-label="${safeText(row.original_slot_label || '')}" style="padding:12px 0;border-bottom:1px solid var(--line)">
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <div style="flex:1;min-width:190px"><b data-slot-title>${safeText(makeLabel(row.start_time, row.end_time))}</b><div class="sub">Booked: ${reserved} / ${capacity} · ${remaining} remaining${safeText(closedText)}</div></div>
          <label style="display:flex;align-items:center;gap:7px;margin:0;color:var(--ink);font-size:13px"><input type="checkbox" data-slot-field="is_open" ${row.is_open ? 'checked' : ''} style="width:20px;height:20px"> Accept orders</label>
        </div>
        <div class="row" style="margin-top:8px;align-items:flex-end">
          <div style="min-width:125px"><label>Start time</label><input type="time" data-slot-field="start_time" value="${safeText(row.start_time)}" ${cannotRename ? 'disabled title="This slot has booked orders; add a new slot instead of changing its time."' : ''}></div>
          <div style="min-width:125px"><label>End time</label><input type="time" data-slot-field="end_time" value="${safeText(row.end_time)}" ${cannotRename ? 'disabled title="This slot has booked orders; add a new slot instead of changing its time."' : ''}></div>
          <div style="min-width:125px"><label>Order cut-off</label><input type="time" data-slot-field="cutoff_time" value="${safeText(row.cutoff_time)}"></div>
          <div style="min-width:105px"><label>Max orders</label><input type="number" min="1" max="500" step="1" inputmode="numeric" data-slot-field="capacity" value="${safeText(capacity)}"></div>
        </div>
        ${cannotRename ? '<div class="tiny">This slot already has booked orders. You can close it or adjust capacity/cut-off, but not change its time window.</div>' : ''}
      </div>`;
    }).join('');
    $('tikSlotsAdd').disabled = workingSlots.length >= MAX_SLOTS;
    $('tikSlotsAddPreview').textContent = workingSlots.length >= MAX_SLOTS
      ? 'Maximum of 12 slots reached for this date.'
      : 'Add slots for this selected date; save to publish the schedule.';
  }

  function handleRowEdit(event) {
    const field = event.target.closest('[data-slot-field]');
    const rowEl = event.target.closest('[data-slot-index]');
    if (!field || !rowEl) return;
    const index = Number(rowEl.dataset.slotIndex);
    const slot = workingSlots[index];
    if (!slot) return;
    const fieldName = field.dataset.slotField;
    if (fieldName === 'is_open') slot.is_open = field.checked;
    else if (fieldName === 'capacity') slot.capacity = field.value;
    else slot[fieldName] = field.value;
    if (fieldName === 'start_time' || fieldName === 'end_time') {
      slot.slot_label = makeLabel(slot.start_time, slot.end_time);
      const title = rowEl.querySelector('[data-slot-title]');
      if (title) title.textContent = slot.slot_label;
    }
    setDirty('Unsaved changes to ' + makeLabel(slot.start_time, slot.end_time) + '. Save to apply them.');
  }

  function validateSlot(slot) {
    const start = timeField(slot.start_time), end = timeField(slot.end_time), cutoff = timeField(slot.cutoff_time);
    const s = minutes(start), e = minutes(end), c = minutes(cutoff), cap = Number(slot.capacity);
    if (!Number.isFinite(s) || !Number.isFinite(e) || !Number.isFinite(c)) throw new Error('Choose start, end and cut-off times for every slot.');
    if (s >= e) throw new Error('The end time must be later than the start time for ' + makeLabel(start, end) + '. Overnight slots are not supported; split them across dates.');
    if (!Number.isInteger(cap) || cap < 1 || cap > 500) throw new Error('Maximum orders must be an integer from 1 to 500.');
    if (c > s || c < s - 240) throw new Error('Cut-off for ' + makeLabel(start, end) + ' must be no later than the start and no more than 4 hours earlier.');
    return { ...slot, slot_label: makeLabel(start, end), start_time: start, end_time: end, cutoff_time: cutoff, capacity: cap };
  }

  function validateSchedule(slots) {
    if (!slots.length || slots.length > MAX_SLOTS) throw new Error('Configure between 1 and ' + MAX_SLOTS + ' slots for this date.');
    const clean = slots.map(validateSlot).sort((a, b) => minutes(a.start_time) - minutes(b.start_time));
    const labels = new Set();
    for (let i = 0; i < clean.length; i++) {
      if (labels.has(clean[i].slot_label)) throw new Error('Duplicate slot: ' + clean[i].slot_label);
      labels.add(clean[i].slot_label);
      if (i > 0 && minutes(clean[i].start_time) < minutes(clean[i - 1].end_time)) {
        throw new Error('Delivery slots cannot overlap: ' + clean[i - 1].slot_label + ' and ' + clean[i].slot_label + '.');
      }
    }
    return clean;
  }

  function addSlot() {
    if (loading || saving) return;
    if (workingSlots.length >= MAX_SLOTS) { setStatus('Maximum of 12 slots reached for this date.', true); return; }
    const fresh = {
      slot_label: makeLabel($('tikNewSlotStart').value, $('tikNewSlotEnd').value),
      original_slot_label: null,
      start_time: $('tikNewSlotStart').value,
      end_time: $('tikNewSlotEnd').value,
      cutoff_time: $('tikNewSlotCutoff').value,
      capacity: $('tikNewSlotCapacity').value,
      is_open: true,
      orders_reserved: 0,
      remaining: Number($('tikNewSlotCapacity').value || 15),
      cutoff_passed: false,
      fromDatabase: false
    };
    try {
      const valid = validateSlot(fresh);
      const candidate = validateSchedule([...workingSlots, valid]);
      workingSlots = candidate;
      renderRows();
      setDirty('Added ' + valid.slot_label + ' to the unsaved schedule. Tap “Save slot settings” to make it live.');
      $('tikNewSlotStart').value = '';
      $('tikNewSlotEnd').value = '';
      $('tikNewSlotCutoff').value = '';
      $('tikNewSlotCapacity').value = '15';
      updateAddPreview();
    } catch (error) {
      setStatus(error.message || 'Check the new slot times and capacity.', true);
    }
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
    if (!auth) { setStatus('Sign in as a kitchen administrator to manage delivery slots.', true); return; }
    const date = $('tikSlotsDate').value;
    if (!date) { setStatus('Choose a slot date.'); return; }
    loading = true;
    $('tikSlotsLoad').disabled = true;
    $('tikSlotsRefresh').disabled = true;
    setStatus('Loading saved slots for ' + date + '…');
    try {
      const { data, error } = await auth.client.rpc('get_delivery_slot_admin_summary', { p_slot_date: date });
      if (error) throw error;
      const rows = data || [];
      if (rows.length) {
        workingSlots = rows.map(row => normalizeSlot(row, true));
        setStatus('Loaded ' + date + ' · ' + rows.length + ' slots · ' + rows.reduce((sum, row) => sum + Number(row.orders_reserved || 0), 0) + ' booked orders.');
      } else {
        workingSlots = DEFAULT_SLOTS.map(row => normalizeSlot(row, false));
        setStatus('No saved slots exist for this date. The six standard slots are shown as a starting template; save to create them.');
      }
      loadedDate = date;
      dirty = false;
      renderRows();
    } catch (error) {
      setStatus('Could not load saved booking counts: ' + (error.message || 'Unknown error') + '. No changes were saved.', true);
    } finally {
      loading = false;
      $('tikSlotsLoad').disabled = false;
      $('tikSlotsRefresh').disabled = false;
    }
  }

  async function saveSlots() {
    if (saving || loading) return;
    const auth = await clientAndSession();
    if (!auth) { setStatus('Sign in as a kitchen administrator first.', true); return; }
    const date = $('tikSlotsDate').value;
    if (!date || date !== loadedDate) { setStatus('Tap “Load date” after choosing the date, then save.', true); return; }
    let slots;
    try { slots = validateSchedule(workingSlots); }
    catch (error) { setStatus(error.message || 'Check the slot settings.', true); return; }

    saving = true;
    $('tikSlotsSave').disabled = true;
    $('tikSlotsLoad').disabled = true;
    $('tikSlotsRefresh').disabled = true;
    $('tikSlotsAdd').disabled = true;
    setStatus('Saving ' + slots.length + ' delivery slots for ' + date + '…');
    try {
      const payload = slots.map((slot, index) => ({
        original_slot_label: slot.original_slot_label || null,
        start_time: slot.start_time,
        end_time: slot.end_time,
        cutoff_time: slot.cutoff_time,
        capacity: slot.capacity,
        is_open: !!slot.is_open,
        sort_order: index + 1
      }));
      const { data, error } = await auth.client.rpc('save_delivery_slots', { p_slot_date: date, p_slots: payload });
      if (error) throw error;
      dirty = false;
      setStatus('Saved ' + Number(data && data.saved_slots || slots.length) + ' slot settings for ' + date + '. Refreshing booking counts…');
      saving = false;
      await loadSlots(true);
    } catch (error) {
      setStatus('Could not save slot settings: ' + (error.message || 'Unknown error'), true);
    } finally {
      saving = false;
      $('tikSlotsSave').disabled = false;
      $('tikSlotsLoad').disabled = false;
      $('tikSlotsRefresh').disabled = false;
      $('tikSlotsAdd').disabled = workingSlots.length >= MAX_SLOTS;
    }
  }

  function boot() {
    if (!ensurePanel()) return;
    loadSlots(true);
    try {
      if (typeof sb !== 'undefined' && sb && sb.auth) sb.auth.onAuthStateChange((event) => {
        if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') window.setTimeout(() => loadSlots(true), 0);
      });
    } catch (_) {}
    window.setInterval(() => loadSlots(false), 20000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
