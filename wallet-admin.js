/* The Innocent Kitchen — kitchen wallet management.
   Loaded after admin-sections.js and uses the signed-in, allow-listed kitchen admin session.
*/
(function () {
  'use strict';

  const $id = id => document.getElementById(id);
  const money = value => '₹' + Number(value || 0).toFixed(2);
  let currentCustomer = null;
  let pendingRequestKey = null;
  let busy = false;

  function uuid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    return [...bytes].map((b, i) => ([4, 6, 8, 10].includes(i) ? '-' : '') + b.toString(16).padStart(2, '0')).join('');
  }

  function mountPanel() {
    if ($id('tikWalletAdminPanel')) return;
    const dashboard = $id('dashboard');
    if (!dashboard) return;
    const panel = document.createElement('section');
    panel.id = 'tikWalletAdminPanel';
    panel.className = 'panel';
    panel.innerHTML = `
      <h2>Customer prepaid wallets</h2>
      <p class="sub">Find a registered customer by their sign-in email. Record a top-up only after the deposit has actually been received and verified by the kitchen. The system adds the 10% bonus automatically.</p>
      <div class="row" style="align-items:end;margin-top:12px">
        <div style="flex:2"><label for="tikWalletCustomerEmail">Customer account email</label><input id="tikWalletCustomerEmail" type="email" autocomplete="email" maxlength="254" placeholder="customer@example.com"></div>
        <button type="button" id="tikWalletFindCustomer" class="btn" style="flex:0 0 auto">Find customer</button>
      </div>
      <div id="tikWalletAdminFeedback" class="error" role="status" aria-live="polite"></div>
      <div id="tikWalletCustomerSummary" class="kv hidden" style="margin-top:12px">
        <b id="tikWalletCustomerName">Customer</b>
        <div class="sub" id="tikWalletCustomerMeta"></div>
        <div style="font-size:12px;color:#65736c;font-weight:750;margin-top:9px">CURRENT WALLET BALANCE</div>
        <div id="tikWalletAdminBalance" style="font-size:25px;font-weight:850;color:#173f35">₹0.00</div>
      </div>
      <div id="tikWalletTopupForm" class="recipe-editor hidden" style="margin-top:12px">
        <h3>Record a verified deposit</h3>
        <div class="row">
          <div><label for="tikWalletDepositAmount">Cash / UPI deposit received (₹)</label><input id="tikWalletDepositAmount" type="number" min="1" max="50000" step="0.01" inputmode="decimal" placeholder="1000"></div>
          <div><label for="tikWalletDepositNote">Payment reference / note (optional)</label><input id="tikWalletDepositNote" type="text" maxlength="300" placeholder="UPI reference or cash receipt"></div>
        </div>
        <div class="kv" style="margin-top:10px">
          <div class="sub">AUTOMATIC CREDIT CALCULATION</div>
          <div style="display:flex;justify-content:space-between;gap:8px;margin-top:5px"><span>Deposit received</span><b id="tikWalletDepositPreview">₹0.00</b></div>
          <div style="display:flex;justify-content:space-between;gap:8px"><span>10% bonus</span><b id="tikWalletBonusPreview">₹0.00</b></div>
          <div style="display:flex;justify-content:space-between;gap:8px;border-top:1px solid #d9e1db;padding-top:7px;margin-top:7px"><b>Total wallet credits</b><b id="tikWalletCreditPreview" style="color:#173f35">₹0.00</b></div>
        </div>
        <button type="button" id="tikWalletRecordTopup" class="btn" style="width:100%;margin-top:10px" disabled>Record deposit and add credits</button>
        <div class="tiny">This action changes the customer's spendable wallet balance. Confirm receipt in your bank / UPI app or cash register before recording it. Do not record a promised or pending payment.</div>
      </div>
      <div id="tikWalletTransactionsWrap" class="hidden" style="margin-top:14px">
        <h3>Wallet transaction history</h3>
        <div id="tikWalletAdminLedger" class="kv"><div class="sub">No transactions yet.</div></div>
      </div>`;
    const ordersPanel = $id('ordersPanel');
    dashboard.insertBefore(panel, ordersPanel || dashboard.firstChild);

    $id('tikWalletFindCustomer').addEventListener('click', findCustomer);
    $id('tikWalletDepositAmount').addEventListener('input', () => {
      pendingRequestKey = null;
      renderPreview();
    });
    $id('tikWalletCustomerEmail').addEventListener('input', () => {
      currentCustomer = null;
      pendingRequestKey = null;
      $id('tikWalletCustomerSummary').classList.add('hidden');
      $id('tikWalletTopupForm').classList.add('hidden');
      $id('tikWalletTransactionsWrap').classList.add('hidden');
      $id('tikWalletRecordTopup').disabled = true;
    });
    $id('tikWalletRecordTopup').addEventListener('click', recordTopup);
    renderPreview();
  }

  function renderPreview() {
    const amount = Number($id('tikWalletDepositAmount')?.value || 0);
    const valid = Number.isFinite(amount) && amount > 0 && amount <= 50000;
    const bonus = valid ? Math.round((amount * 0.10 + Number.EPSILON) * 100) / 100 : 0;
    if ($id('tikWalletDepositPreview')) $id('tikWalletDepositPreview').textContent = money(valid ? amount : 0);
    if ($id('tikWalletBonusPreview')) $id('tikWalletBonusPreview').textContent = money(bonus);
    if ($id('tikWalletCreditPreview')) $id('tikWalletCreditPreview').textContent = money(valid ? amount + bonus : 0);
    if ($id('tikWalletRecordTopup')) $id('tikWalletRecordTopup').disabled = !currentCustomer || !valid || busy;
  }

  function showMessage(message, isError) {
    const el = $id('tikWalletAdminFeedback');
    if (!el) return;
    el.textContent = message || '';
    el.style.color = isError ? '#8b3029' : '#24543a';
  }

  async function findCustomer() {
    if (typeof sb === 'undefined' || !sb || typeof session === 'undefined' || !session) {
      showMessage('Kitchen admin session is not ready. Sign in again and retry.', true);
      return;
    }
    const email = $id('tikWalletCustomerEmail').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showMessage("Enter the customer's registered sign-in email address.", true);
      $id('tikWalletCustomerEmail').focus();
      return;
    }
    const button = $id('tikWalletFindCustomer');
    button.disabled = true; button.textContent = 'Searching…';
    showMessage('');
    try {
      const { data, error } = await sb.rpc('admin_get_wallet_customer', { p_customer_email: email });
      if (error) throw error;
      if (!data || !data.success) throw new Error(data?.message || 'Customer account was not found.');
      currentCustomer = data;
      $id('tikWalletCustomerSummary').classList.remove('hidden');
      $id('tikWalletTopupForm').classList.remove('hidden');
      $id('tikWalletTransactionsWrap').classList.remove('hidden');
      $id('tikWalletCustomerName').textContent = data.customer_name || 'Registered customer';
      $id('tikWalletCustomerMeta').textContent = [data.email, data.phone].filter(Boolean).join(' · ');
      $id('tikWalletAdminBalance').textContent = money(data.balance);
      $id('tikWalletDepositAmount').value = '';
      $id('tikWalletDepositNote').value = '';
      pendingRequestKey = null;
      renderPreview();
      await loadLedger();
      showMessage('Customer wallet loaded. Confirm the deposit before recording any top-up.');
    } catch (error) {
      currentCustomer = null;
      renderPreview();
      showMessage(error.message || 'Could not find the customer.', true);
    } finally {
      button.disabled = false; button.textContent = 'Find customer';
    }
  }

  async function loadLedger() {
    if (!currentCustomer) return;
    const { data, error } = await sb.from('customer_wallet_transactions')
      .select('transaction_type,cash_received,bonus_credited,credit_change,note,order_id,created_at')
      .eq('customer_id', currentCustomer.customer_id)
      .order('created_at', { ascending: false }).limit(20);
    if (error) throw error;
    const el = $id('tikWalletAdminLedger');
    if (!data || !data.length) {
      el.innerHTML = '<div class="sub">No wallet transactions yet.</div>';
      return;
    }
    el.innerHTML = data.map(row => {
      let label = 'Wallet transaction';
      let description = row.note || '';
      if (row.transaction_type === 'topup') {
        label = 'Top-up';
        description = `Deposit ${money(row.cash_received)} + bonus ${money(row.bonus_credited)}${row.note ? ' · ' + row.note : ''}`;
      } else if (row.transaction_type === 'order_debit') label = 'Order payment';
      else if (row.transaction_type === 'order_refund') label = 'Order refund';
      const amount = Number(row.credit_change || 0);
      return `<div style="padding:8px 0;border-bottom:1px solid #e5ebe6;display:flex;justify-content:space-between;gap:10px">
        <div style="min-width:0"><b>${label}</b><div class="sub">${String(description || '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}</div><div class="sub">${new Date(row.created_at).toLocaleString()}</div></div>
        <b style="white-space:nowrap;color:${amount >= 0 ? '#24543a' : '#8b3029'}">${amount >= 0 ? '+' : '−'}${money(Math.abs(amount))}</b>
      </div>`;
    }).join('');
  }

  async function recordTopup() {
    if (busy || !currentCustomer) return;
    const amount = Number($id('tikWalletDepositAmount').value);
    const note = $id('tikWalletDepositNote').value.trim();
    if (!Number.isFinite(amount) || amount <= 0 || amount > 50000) {
      showMessage('Enter a valid deposit between ₹1 and ₹50,000.', true); return;
    }
    const bonus = Math.round((amount * 0.10 + Number.EPSILON) * 100) / 100;
    const total = amount + bonus;
    if (!window.confirm(`Confirm that ₹${amount.toFixed(2)} has actually been received from ${currentCustomer.email}?\n\nWallet credits to add: ₹${total.toFixed(2)} (includes ₹${bonus.toFixed(2)} bonus).`)) return;

    busy = true;
    const button = $id('tikWalletRecordTopup');
    button.disabled = true; button.textContent = 'Recording…';
    showMessage('');
    pendingRequestKey = pendingRequestKey || uuid();
    try {
      const { data, error } = await sb.rpc('admin_add_wallet_topup', {
        p_customer_email: currentCustomer.email,
        p_amount: amount,
        p_note: note || null,
        p_request_key: pendingRequestKey
      });
      if (error) throw error;
      if (!data || !data.success) throw new Error(data?.message || 'Top-up was not recorded.');
      currentCustomer.balance = Number(data.balance || 0);
      $id('tikWalletAdminBalance').textContent = money(data.balance);
      const added = money(data.credit_added);
      showMessage(`Deposit recorded: ${money(data.cash_received)} received + ${money(data.bonus_credited)} bonus = ${added} added. New balance: ${money(data.balance)}.`);
      pendingRequestKey = null;
      $id('tikWalletDepositAmount').value = '';
      $id('tikWalletDepositNote').value = '';
      renderPreview();
      await loadLedger();
    } catch (error) {
      // Keep the same request key on retry, so a network timeout cannot credit twice.
      showMessage(error.message || 'Top-up could not be recorded. Retry using the same details.', true);
    } finally {
      busy = false;
      button.textContent = 'Record deposit and add credits';
      renderPreview();
    }
  }

  mountPanel();
})();
