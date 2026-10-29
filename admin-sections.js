/* The Innocent Kitchen — one-section-at-a-time kitchen dashboard navigation. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const sections = [
    { id: 'ordersPanel', label: 'Incoming orders' },
    { id: 'packingPrepPanel', label: 'Packing & recipes' },
    { id: 'tikMenuCatalogPanel', label: 'Menu catalogue' },
    { id: 'tikDailyMenuPanel', label: 'Daily menu' },
    { id: 'tikMenuAvailabilityPanel', label: 'Availability' },
    { id: 'tikDeliverySlotCapacityPanel', label: 'Delivery slots' },
    { id: 'tikSlotProductionBoard', label: 'Production & dispatch' }
  ];
  const style = document.createElement('style');
  style.textContent = `
    #tikDashboardNavigation{position:sticky;top:0;z-index:40;background:var(--cream);padding:4px 0 12px;margin-bottom:4px}
    #tikDashboardNavigation .tik-nav-label{font-size:11px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin:0 0 7px 2px}
    #tikDashboardNavigation .tik-nav-scroll{display:flex;gap:7px;overflow-x:auto;padding:0 0 4px;scrollbar-width:thin}
    #tikDashboardNavigation button{flex:0 0 auto;border:1px solid var(--line);border-radius:10px;padding:10px 12px;background:#fff;color:var(--g);font:inherit;font-size:13px;font-weight:800;white-space:nowrap;cursor:pointer}
    #tikDashboardNavigation button[aria-selected="true"]{background:var(--g);border-color:var(--g);color:#fff}
    #tikDashboardNavigation button:focus-visible{outline:3px solid #c79b39;outline-offset:2px}
  `;
  document.head.appendChild(style);

  function boot() {
    const dashboard = $('dashboard');
    if (!dashboard) return;
    let nav = $('tikDashboardNavigation');
    if (!nav) {
      nav = document.createElement('nav');
      nav.id = 'tikDashboardNavigation';
      nav.setAttribute('aria-label', 'Kitchen dashboard sections');
      nav.innerHTML = '<div class="tik-nav-label">Dashboard sections</div><div class="tik-nav-scroll" role="tablist" aria-label="Choose a dashboard section"></div>';
      dashboard.insertBefore(nav, dashboard.firstChild);
    }
    const scroll = nav.querySelector('.tik-nav-scroll');
    const available = sections.filter(section => $(section.id));
    scroll.innerHTML = available.map(section => `<button type="button" role="tab" data-view="${section.id}" aria-selected="false" aria-controls="${section.id}">${section.label}</button>`).join('');

    function showSection(id) {
      const target = available.some(section => section.id === id) ? id : (available[0] && available[0].id);
      available.forEach(section => {
        const panel = $(section.id);
        if (panel) panel.classList.toggle('hidden', section.id !== target);
        const button = scroll.querySelector(`[data-view="${section.id}"]`);
        if (button) button.setAttribute('aria-selected', String(section.id === target));
      });
      if (target) {
        try { sessionStorage.setItem('tik-admin-current-view', target); } catch (_) {}
      }
    }
    scroll.addEventListener('click', event => {
      const button = event.target.closest('[data-view]');
      if (button) showSection(button.dataset.view);
    });
    let initial = 'ordersPanel';
    try { initial = sessionStorage.getItem('tik-admin-current-view') || initial; } catch (_) {}
    showSection(initial);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
