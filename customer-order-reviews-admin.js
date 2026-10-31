/* The Innocent Kitchen — show customer ratings/reviews in the kitchen order cards.
   Loaded after the main admin-v2.html inline script.
*/
(function () {
  'use strict';

  const ordersHost = document.getElementById('orders');
  if (!ordersHost || typeof loadOrders !== 'function' || typeof renderOrders !== 'function') return;

  function filteredOrders() {
    return orders.filter(order =>
      (document.getElementById('statusFilter').value === 'all' || order.order_status === document.getElementById('statusFilter').value) &&
      (document.getElementById('fulfilmentFilter').value === 'all' || order.fulfilment_type === document.getElementById('fulfilmentFilter').value)
    );
  }

  function renderFeedbackCards() {
    const visibleOrders = filteredOrders();
    const cards = ordersHost.querySelectorAll('article.order');
    cards.forEach((card, index) => {
      const order = visibleOrders[index];
      if (!order || order.order_status !== 'delivered') return;
      const old = card.querySelector('.tik-admin-review');
      if (old) old.remove();

      const panel = document.createElement('div');
      panel.className = 'kv tik-admin-review';
      panel.style.marginTop = '10px';
      panel.style.padding = '10px';
      panel.style.border = '1px solid #d9e4dc';
      panel.style.borderRadius = '10px';
      panel.style.background = '#f8fbf8';

      const title = document.createElement('b');
      title.textContent = 'Customer feedback';
      panel.appendChild(title);

      const review = order.customer_order_review;
      if (review) {
        const rating = Number(review.rating);
        const stars = document.createElement('div');
        stars.style.marginTop = '5px';
        stars.style.color = '#b57b09';
        stars.style.fontSize = '20px';
        stars.textContent = '★'.repeat(rating) + '☆'.repeat(5 - rating) + '  (' + rating + '/5)';
        panel.appendChild(stars);

        if (review.review_text) {
          const comment = document.createElement('p');
          comment.style.margin = '6px 0 0';
          comment.style.whiteSpace = 'pre-wrap';
          comment.style.overflowWrap = 'anywhere';
          comment.textContent = review.review_text;
          panel.appendChild(comment);
        } else {
          const noComment = document.createElement('div');
          noComment.className = 'sub';
          noComment.textContent = 'No written comment provided.';
          panel.appendChild(noComment);
        }
        const date = document.createElement('div');
        date.className = 'sub';
        date.style.marginTop = '5px';
        date.textContent = review.created_at ? 'Submitted ' + new Date(review.created_at).toLocaleString() : '';
        panel.appendChild(date);
      } else {
        const waiting = document.createElement('div');
        waiting.className = 'sub';
        waiting.style.marginTop = '5px';
        waiting.textContent = 'Awaiting customer rating.';
        panel.appendChild(waiting);
      }
      card.appendChild(panel);
    });
  }

  const originalRenderOrders = renderOrders;
  renderOrders = function () {
    originalRenderOrders();
    renderFeedbackCards();
  };

  const originalLoadOrders = loadOrders;
  loadOrders = async function () {
    await originalLoadOrders();
    if (!sb || !session || !Array.isArray(orders) || !orders.length) return;
    const ids = orders.map(order => order.id).filter(Boolean);
    if (!ids.length) return;
    try {
      const { data, error } = await sb.from('customer_order_reviews')
        .select('order_id,rating,review_text,created_at')
        .in('order_id', ids);
      if (error) throw error;
      const byOrder = new Map((data || []).map(row => [row.order_id, row]));
      orders.forEach(order => { order.customer_order_review = byOrder.get(order.id) || null; });
      renderOrders();
    } catch (error) {
      const feedback = document.getElementById('loadFeedback');
      if (feedback) feedback.textContent = 'Orders loaded, but customer feedback could not be loaded: ' + (error.message || 'Please refresh.');
    }
  };
})();
