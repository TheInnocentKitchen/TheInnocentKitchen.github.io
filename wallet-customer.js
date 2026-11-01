/* The Innocent Kitchen — customer prepaid wallet.
   Load after the inline order.html app script and customer-order-reviews.js.
   The database remains the authority for wallet balance, affordability and checkout debit.
*/
(function () {
  'use strict';

  const client = () => customerSupabaseClient;
  const userId = () => customerAuthSession && customerAuthSession.user && customerAuthSession.user.id;
  let walletBalance = 0;
  let walletLoaded = false;
  let walletBusy = false;
  let lastLedger = [];

  const money = value => '₹' + Number(value || 0).toFixed(2);
  const escapeHtml = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));

  function ensureWalletUi() {
    if (document.getElementById('tikCustomerWallet')) return;
    const cartPanel = document.querySelector('#orderingApp aside .panel.sticky');
    if (!cartPanel) return;

    const panel = document.createElement('section');
    panel.id = 'tikCustomerWallet';
    panel.className = 'panel';
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
        <div><h2 style="margin-bottom:4px">Prepaid meal wallet</h2><div class="hint">Recharge your wallet and receive 10% extra credits.</div></div>
        <button type="button" id="tikWalletRefresh" class="btn light" style="white-space:nowrap">Refresh</button>
      </div>
      <div style="margin:12px 0 4px;font-size:12px;color:#65736c;font-weight:700">AVAILABLE CREDITS</div>
      <div id="tikWalletBalance" style="font-size:29px;font-weight:850;color:#173f35">₹0.00</div>
      <div id="tikWalletHint" class="hint" style="margin-top:5px">Your wallet balance will appear here after sign-in.</div>
      <details style="margin-top:12px">
        <summary style="cursor:pointer;font-weight:750;color:#173f35">Recent wallet activity</summary>
        <div id="tikWalletLedger" style="margin-top:8px"><div class="hint">No wallet activity yet.</div></div>
      </details>`;
    cartPanel.parentNode.insertBefore(panel, cartPanel);

    const upiInput = document.querySelector('input[name="payment"][value="upi"]');
    const radioList = upiInput && upiInput.closest('.radio-list');
    if (radioList && !document.querySelector('input[name="payment"][value="wallet"]')) {
      const option = document.createElement('label');
      option.className = 'radio-option';
      option.id = 'tikWalletPaymentOption';
      option.innerHTML = `
        <input type="radio" name="payment" value="wallet" id="tikWalletPayment" disabled>
        <span><b>Prepaid wallet</b><br><span class="hint" id="tikWalletPaymentHint">Checking wallet balance…</span></span>`;
      radioList.appendChild(option);
    }

    document.getElementById('tikWalletRefresh').addEventListener('click', () => refreshWallet(false));
    const paymentInput = document.getElementById('tikWalletPayment');
    if (paymentInput) paymentInput.addEventListener('change', updateWalletPaymentState);
  }

  function cartTotal() {
    try {
      return [...cart.entries()].reduce((sum, [id, quantity]) => {
        const item = byId(id);
        return sum + (item ? Number(item.price) * Number(quantity) : 0);
      }, 0);
    } catch (_) {
      const totalText = document.getElementById('total')?.textContent || '0';
      return Number(totalText.replace(/[^0-9.]/g, '')) || 0;
    }
  }

  function renderLedger() {
    const el = document.getElementById('tikWalletLedger');
    if (!el) return;
    if (!lastLedger.length) {
      el.innerHTML = '<div class="hint">No wallet activity yet. Your top-ups and wallet-paid orders will appear here.</div>';
      return;
    }
    el.innerHTML = lastLedger.map(row => {
      let title = 'Wallet transaction';
      let detail = '';
      let amount = Number(row.credit_change || 0);
      if (row.transaction_type === 'topup') {
        title = 'Wallet top-up';
        detail = `Deposit ${money(row.cash_received)} + bonus ${money(row.bonus_credited)}`;
      } else if (row.transaction_type === 'order_debit') {
        title = 'Order payment';
        detail = row.note || 'Credits used for an order';
      } else if (row.transaction_type === 'order_refund') {
        title = 'Order refund';
        detail = row.note || 'Credits returned to wallet';
      }
      const positive = amount > 0;
      return `<div style="padding:9px 0;border-bottom:1px solid #e5ebe6;display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
        <div style="min-width:0"><b>${escapeHtml(title)}</b><div class="hint">${escapeHtml(detail)}</div><div class="hint">${escapeHtml(new Date(row.created_at).toLocaleString())}</div></div>
        <b style="white-space:nowrap;color:${positive ? '#245c3d' : '#9b3c2b'}">${positive ? '+' : '−'}${money(Math.abs(amount))}</b>
      </div>`;
    }).join('');
  }

  function updateWalletPaymentState() {
    const input = document.getElementById('tikWalletPayment');
    const hint = document.getElementById('tikWalletPaymentHint');
    const option = document.getElementById('tikWalletPaymentOption');
    if (!input || !hint) return;
    const total = cartTotal();
    const hasEnough = walletLoaded && walletBalance > 0 && total > 0 && walletBalance + 0.0001 >= total;
    input.disabled = !hasEnough || walletBusy;
    if (!walletLoaded) hint.textContent = 'Checking wallet balance…';
    else if (walletBalance <= 0) hint.textContent = 'No credits yet. Ask the kitchen to record your prepaid top-up.';
    else if (total <= 0) hint.textContent = `Available: ${money(walletBalance)}. Add items to use wallet credits.`;
    else if (hasEnough) hint.textContent = `Available: ${money(walletBalance)} · Enough for this order.`;
    else hint.textContent = `Available: ${money(walletBalance)} · Need ${money(total - walletBalance)} more for this order.`;
    if (option) option.style.opacity = hasEnough ? '1' : '.62';
    if (input.checked && !hasEnough) {
      const fallback = document.querySelector('input[name="payment"][value="upi"]');
      if (fallback) fallback.checked = true;
    }
  }

  async function refreshWallet(silent) {
    if (walletBusy) return;
    ensureWalletUi();
    const balanceEl = document.getElementById('tikWalletBalance');
    const hintEl = document.getElementById('tikWalletHint');
    const ledgerEl = document.getElementById('tikWalletLedger');
    if (!client() || !userId()) {
      walletBalance = 0; walletLoaded = false; lastLedger = [];
      if (balanceEl) balanceEl.textContent = '₹0.00';
      if (hintEl) hintEl.textContent = 'Sign in to view your prepaid wallet.';
      renderLedger(); updateWalletPaymentState(); return;
    }
    walletBusy = true;
    updateWalletPaymentState();
    try {
      const [walletResult, ledgerResult] = await Promise.all([
        client().from('customer_wallets').select('balance').eq('customer_id', userId()).maybeSingle(),
        client().from('customer_wallet_transactions')
          .select('transaction_type,cash_received,bonus_credited,credit_change,note,order_id,created_at')
          .eq('customer_id', userId()).order('created_at', { ascending: false }).limit(8)
      ]);
      if (walletResult.error) throw walletResult.error;
      if (ledgerResult.error) throw ledgerResult.error;
      walletBalance = Number(walletResult.data?.balance || 0);
      lastLedger = ledgerResult.data || [];
      walletLoaded = true;
      if (balanceEl) balanceEl.textContent = money(walletBalance);
      if (hintEl) hintEl.textContent = 'Every verified top-up receives 10% extra credits. Wallet payments are deducted automatically at checkout.';
      renderLedger();
      updateWalletPaymentState();
    } catch (error) {
      walletLoaded = false;
      if (hintEl) hintEl.textContent = 'Wallet could not be refreshed: ' + (error.message || 'Please try again.');
      if (ledgerEl) ledgerEl.innerHTML = '<div class="hint">Wallet activity is temporarily unavailable.</div>';
      updateWalletPaymentState();
      if (!silent) console.error('Wallet refresh failed', error);
    } finally {
      walletBusy = false;
      updateWalletPaymentState();
    }
  }

  // Refresh the wallet whenever order history is refreshed (including after checkout/auth changes).
  if (typeof refreshAccountOrders === 'function') {
    const originalRefreshAccountOrders = refreshAccountOrders;
    refreshAccountOrders = async function (silent) {
      await originalRefreshAccountOrders(silent);
      await refreshWallet(true);
    };
  }

  // Re-evaluate affordability after any cart change.
  if (typeof renderCart === 'function') {
    const originalRenderCart = renderCart;
    renderCart = function () {
      originalRenderCart();
      updateWalletPaymentState();
    };
  }

  // Re-fetch after checkout so the displayed credit balance immediately reflects wallet spending.
  if (typeof submitOrder === 'function') {
    const originalSubmitOrder = submitOrder;
    submitOrder = async function () {
      await originalSubmitOrder();
      await refreshWallet(true);
    };
  }

  ensureWalletUi();
  refreshWallet(true);
})();
