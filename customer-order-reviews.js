/* The Innocent Kitchen — customer order ratings and optional reviews.
   Loaded after the main order.html inline script. Uses the signed-in customer Supabase client.
*/
(function () {
  'use strict';

  const host = document.getElementById('customerAccountOrders');
  if (!host || typeof renderAccountOrders !== 'function' || typeof refreshAccountOrders !== 'function') return;

  const STYLE_ID = 'tik-order-review-styles';
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .tik-order-review{margin-top:14px;padding:13px;border:1px solid #dce6df;border-radius:12px;background:#f8fbf8}
      .tik-order-review-title{display:block;margin-bottom:7px;font-weight:800;color:#173c2c}
      .tik-review-stars{display:flex;gap:7px;align-items:center;margin:6px 0 4px}
      .tik-review-star{width:42px;height:42px;border:1px solid #cbd8cf;border-radius:9px;background:#fff;color:#aab3ad;font-size:25px;line-height:1;cursor:pointer}
      .tik-review-star.is-selected{color:#d69b16;border-color:#d69b16;background:#fffaf0}
      .tik-review-help{font-size:12px;color:#68766d;margin:3px 0 10px}
      .tik-review-text{width:100%;min-height:72px;box-sizing:border-box;margin-top:5px;padding:10px;border:1px solid #ccd7cf;border-radius:9px;font:inherit;background:#fff}
      .tik-review-submit{margin-top:9px;width:100%}
      .tik-review-saved{font-size:14px;color:#24543a;margin-top:6px}
      .tik-review-saved-stars{font-size:22px;letter-spacing:2px;color:#d69b16;margin:5px 0}
      .tik-review-comment{margin:7px 0 0;color:#34453b;white-space:pre-wrap;overflow-wrap:anywhere}
      .tik-review-message{display:block;min-height:18px;margin-top:7px;font-size:13px;color:#9b3c2b}
      @media(max-width:420px){.tik-review-star{width:38px;height:40px}}
    `;
    document.head.appendChild(style);
  }

  function safe(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  function reviewMarkup(order) {
    if (!order || order.order_status !== 'delivered') return '';
    const review = order.customer_order_review;
    if (review) {
      const stars = '★'.repeat(Number(review.rating)) + '☆'.repeat(5 - Number(review.rating));
      return `<section class="tik-order-review" aria-label="Your order review">
        <strong class="tik-order-review-title">Thank you for your feedback</strong>
        <div class="tik-review-saved-stars" aria-label="Rated ${Number(review.rating)} out of 5">${stars}</div>
        ${review.review_text ? `<p class="tik-review-comment">${safe(review.review_text)}</p>` : '<div class="tik-review-help">No written comment added.</div>'}
      </section>`;
    }

    return `<section class="tik-order-review" data-review-card data-review-order-id="${safe(order.id)}">
      <strong class="tik-order-review-title">How was your order?</strong>
      <div class="tik-review-help">Select a rating from 1 to 5 stars. Your written review is optional.</div>
      <div class="tik-review-stars" role="radiogroup" aria-label="Rate this order from one to five stars">
        ${[1, 2, 3, 4, 5].map(n => `<button type="button" class="tik-review-star" data-review-star="${n}" aria-label="${n} star${n === 1 ? '' : 's'}" aria-pressed="false">★</button>`).join('')}
      </div>
      <div class="tik-review-help" data-review-rating-label>Choose your rating</div>
      <label class="tik-order-review-title" for="tik-review-text-${safe(order.id)}">Short review <span style="font-weight:400">(optional)</span></label>
      <textarea class="tik-review-text" id="tik-review-text-${safe(order.id)}" maxlength="400" placeholder="Tell us what went well or what we can improve."></textarea>
      <button type="button" class="btn tik-review-submit" data-submit-order-review>Submit rating</button>
      <span class="tik-review-message" role="status" aria-live="polite"></span>
    </section>`;
  }

  const originalRender = renderAccountOrders;
  renderAccountOrders = function () {
    originalRender();
    const cards = host.querySelectorAll('.account-order');
    cards.forEach((card, index) => {
      const order = accountOrders[index];
      if (!order || order.order_status !== 'delivered') return;
      const existing = card.querySelector('[data-review-card], .tik-order-review[aria-label="Your order review"]');
      if (existing) existing.remove();
      const wrapper = document.createElement('div');
      wrapper.innerHTML = reviewMarkup(order);
      if (wrapper.firstElementChild) card.appendChild(wrapper.firstElementChild);
    });
  };

  const originalRefresh = refreshAccountOrders;
  refreshAccountOrders = async function (silent) {
    await originalRefresh(silent);
    if (!customerSupabaseClient || !customerAuthSession || !Array.isArray(accountOrders) || !accountOrders.length) return;
    const ids = accountOrders.map(order => order.id).filter(Boolean);
    if (!ids.length) return;
    try {
      const { data, error } = await customerSupabaseClient
        .from('customer_order_reviews')
        .select('order_id,rating,review_text,created_at')
        .in('order_id', ids);
      if (error) throw error;
      const byOrder = new Map((data || []).map(row => [row.order_id, row]));
      accountOrders.forEach(order => { order.customer_order_review = byOrder.get(order.id) || null; });
      renderAccountOrders();
    } catch (error) {
      const feedback = document.getElementById('customerOrdersFeedback');
      if (feedback) feedback.textContent = 'Orders loaded, but feedback status could not be checked: ' + (error.message || 'Please refresh.');
    }
  };

  host.addEventListener('click', async event => {
    const starButton = event.target.closest('[data-review-star]');
    if (starButton) {
      const card = starButton.closest('[data-review-card]');
      if (!card) return;
      const rating = Number(starButton.dataset.reviewStar);
      card.dataset.selectedRating = String(rating);
      card.querySelectorAll('[data-review-star]').forEach(button => {
        const selected = Number(button.dataset.reviewStar) <= rating;
        button.classList.toggle('is-selected', selected);
        button.setAttribute('aria-pressed', String(Number(button.dataset.reviewStar) === rating));
      });
      const label = card.querySelector('[data-review-rating-label]');
      if (label) label.textContent = rating + ' out of 5 stars';
      return;
    }

    const submitButton = event.target.closest('[data-submit-order-review]');
    if (!submitButton) return;
    const card = submitButton.closest('[data-review-card]');
    if (!card) return;
    const orderId = card.dataset.reviewOrderId;
    const rating = Number(card.dataset.selectedRating || 0);
    const reviewText = (card.querySelector('.tik-review-text')?.value || '').trim();
    const message = card.querySelector('.tik-review-message');

    if (!rating || rating < 1 || rating > 5) {
      if (message) message.textContent = 'Please select a star rating first.';
      return;
    }
    if (reviewText.length > 400) {
      if (message) message.textContent = 'Please keep your review within 400 characters.';
      return;
    }
    if (!customerSupabaseClient || !customerAuthSession?.user?.id) {
      if (message) message.textContent = 'Please sign in again to submit your review.';
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = 'Submitting…';
    if (message) message.textContent = '';
    try {
      const { error } = await customerSupabaseClient.from('customer_order_reviews').insert({
        order_id: orderId,
        rating,
        review_text: reviewText || null
      });
      if (error) throw error;
      const order = accountOrders.find(item => item.id === orderId);
      if (order) order.customer_order_review = { order_id: orderId, rating, review_text: reviewText || null, created_at: new Date().toISOString() };
      renderAccountOrders();
      const feedback = document.getElementById('customerOrdersFeedback');
      if (feedback) feedback.textContent = 'Thank you. Your rating has been saved.';
    } catch (error) {
      if (message) {
        message.textContent = error.code === '23505'
          ? 'A review has already been submitted for this order. Refresh your orders to see it.'
          : (error.message || 'Your review could not be submitted. Please try again.');
      }
      submitButton.disabled = false;
      submitButton.textContent = 'Submit rating';
    }
  });
})();
