/* The Innocent Kitchen — Phase 4: only show scheduled slots that remain open, before cut-off, and under capacity.
   Load after daily-menu-customer.js and customer-availability.js in order.html. */
(function () {
  'use strict';
  let loading = false;
  let lastAvailable = [];
  let lastError = false;

  function $(id) { return document.getElementById(id); }
  function todayIndia() {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}`;
  }
  function slotSelect() { return $('slot'); }
  function scheduledRadio() { return document.querySelector('input[name="fulfilment"][value="scheduled"]'); }
  function immediateRadio() { return document.querySelector('input[name="fulfilment"][value="immediate"]'); }

  function ensureStatus() {
    let el = $('tikDeliverySlotStatus');
    if (el) return el;
    const select = slotSelect();
    if (!select) return null;
    const note = select.parentElement && select.parentElement.querySelector('.slot-note');
    el = document.createElement('p');
    el.id = 'tikDeliverySlotStatus';
    el.className = 'slot-note';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.style.marginTop = '6px';
    el.textContent = 'Checking live slot capacity…';
    if (note) note.insertAdjacentElement('afterend', el);
    else select.insertAdjacentElement('afterend', el);
    return el;
  }

  function chooseImmediateIfNeeded() {
    const scheduled = scheduledRadio();
    const immediate = immediateRadio();
    if (scheduled && scheduled.checked && immediate) {
      immediate.checked = true;
      immediate.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function setSlotOptions(rows, message, failed, checking) {
    const select = slotSelect();
    if (!select) return;
    const oldValue = select.value;
    const availableRows = Array.isArray(rows) ? rows : [];
    select.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = availableRows.length ? 'Choose an available slot' : (failed ? 'Scheduled slots could not be verified' : 'No delivery slots available');
    select.appendChild(placeholder);
    availableRows.forEach(row => {
      const option = document.createElement('option');
      option.value = row.slot_label;
      const remaining = Number(row.remaining || 0);
      const cutoff = String(row.cutoff_time || '').slice(0,5);
      option.textContent = `${row.slot_label} · ${remaining} spot${remaining === 1 ? '' : 's'} left · order by ${cutoff}`;
      select.appendChild(option);
    });
    select.disabled = availableRows.length === 0;
    select.value = availableRows.some(row => row.slot_label === oldValue) ? oldValue : '';

    const scheduled = scheduledRadio();
    if (scheduled) scheduled.disabled = availableRows.length === 0 && !checking;
    if (!availableRows.length && !checking) chooseImmediateIfNeeded();

    const status = ensureStatus();
    if (status) status.textContent = message;
    lastAvailable = availableRows;
    lastError = !!failed;
  }

  async function refreshSlots() {
    if (loading) return;
    let client;
    try { client = customerSupabaseClient; } catch (_) { client = null; }
    if (!client) return;
    loading = true;
    try {
      const date = todayIndia();
      const { data, error } = await client.rpc('get_available_delivery_slots', { p_slot_date: date });
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      if (!rows.length) {
        setSlotOptions([], 'No scheduled slots have remaining capacity before their cut-off. Choose “As soon as possible” or contact the kitchen.', false);
      } else {
        const wasSelected = slotSelect() && slotSelect().value;
        const stillAvailable = rows.some(row => row.slot_label === wasSelected);
        const message = stillAvailable || !wasSelected
          ? 'Showing only slots that are open, before cut-off, and not full. Availability refreshes automatically.'
          : 'Your previous slot is no longer available. Please select another slot.';
        setSlotOptions(rows, message, false);
      }
    } catch (error) {
      setSlotOptions([], 'Could not verify scheduled slot capacity. Scheduled delivery is paused for safety; immediate requests remain available. ' + (error.message || ''), true);
    } finally {
      loading = false;
    }
  }

  function boot() {
    const select = slotSelect();
    if (!select) return;
    // Remove the old hard-coded choices immediately so stale slots cannot be submitted.
    setSlotOptions([], 'Checking live slot capacity…', false, true);
    refreshSlots();
    window.setInterval(refreshSlots, 30000);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') refreshSlots();
    });
    window.addEventListener('focus', refreshSlots);
    try {
      if (typeof customerSupabaseClient !== 'undefined' && customerSupabaseClient && customerSupabaseClient.auth) {
        customerSupabaseClient.auth.onAuthStateChange(() => window.setTimeout(refreshSlots, 0));
      }
    } catch (_) {}
  }

  window.tikDeliverySlotsRefresh = refreshSlots;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
