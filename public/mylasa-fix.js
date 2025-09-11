// ==== Mylasa Global FIX v2 ====
// Tek menü/panel kuralı + saat gizle, sadece tarih (gg.aa.yyyy)

(function () {
  /* -------- Seçiciler -------- */
  const MENU_SELECTORS = [
    '.clip-cmMenu', '.comment-menu', '.cm-menu',
    '.menu-popup', '.popover-menu',
    '.dropdown-menu', '.dropdown.show', '.dropdown-menu.show',
    '.ant-dropdown', '.ant-popover',
    '.MuiPopover-root',
    'div[role="menu"]','ul[role="menu"]'
  ];
  const STAR_SELECTORS = ['.sr2-panel', '.star-popover', '.rating-panel', '.stars-panel'];

  /* -------- Yardımcılar -------- */
  const isEl = n => n && n.nodeType === 1;
  function isVisible(el){
    if (!isEl(el)) return false;
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function qAllVisible(selectors){
    const out = [];
    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => { if (isVisible(el)) out.push(el); });
    });
    return Array.from(new Set(out));
  }
  function forceClose(el){
    try { el.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); } catch {}
    try { document.body.dispatchEvent(new MouseEvent('mousedown',{bubbles:true})); } catch {}
    el.setAttribute('data-global-closed','1');
    el.style.display = 'none';
  }
  function closeOthersExcept(selectors, exceptTarget){
    qAllVisible(selectors).forEach(el => { if (!exceptTarget || !el.contains(exceptTarget)) forceClose(el); });
  }

  /* -------- Tek menü/panel kuralı -------- */
  let lastClickTarget = null;
  window.addEventListener('pointerdown', e => { lastClickTarget = e.target; }, true);

  function hardPruneAfterClick(){
    setTimeout(() => {
      const clicked = lastClickTarget || document.body;
      // Aynı anda tek MENÜ
      closeOthersExcept(MENU_SELECTORS, clicked);
      // Yıldız açıldıysa tüm menüleri kapat
      if (qAllVisible(STAR_SELECTORS).length) closeOthersExcept(MENU_SELECTORS, null);
      // Hem menü hem yıldız görünürse menü öncelik: yıldızı kapat
      if (qAllVisible(MENU_SELECTORS).length && qAllVisible(STAR_SELECTORS).length) {
        qAllVisible(STAR_SELECTORS).forEach(forceClose);
      }
    }, 80);
  }

  document.addEventListener('click', hardPruneAfterClick, true);
  ['scroll','resize','keydown'].forEach(evt => {
    window.addEventListener(evt, (e) => {
      if (evt === 'keydown' && e && e.key !== 'Escape') return;
      closeOthersExcept(MENU_SELECTORS, null);
      closeOthersExcept(STAR_SELECTORS, null);
    }, true);
  });

  /* -------- Saat gizle, yalnız tarih -------- */
  const DATE_RE = /(\d{1,2}\.\d{1,2}\.\d{2,4})/; // 26.08.2025
  const onlyDate = t => (t && String(t).match(DATE_RE) ? String(t).match(DATE_RE)[1] : t);
  function normalizeTimes(){
    const sels = [
      '.clip-time', '.clipdesk__time',
      '.clip-comment-time', '.clipdesk__cmtTime', '.comment-time'
    ];
    document.querySelectorAll(sels.join(',')).forEach(n => { try { n.textContent = onlyDate(n.textContent); } catch {} });
  }
  const obs = new MutationObserver(() => normalizeTimes());
  obs.observe(document.documentElement, { childList:true, subtree:true, characterData:true });
  window.addEventListener('load', normalizeTimes);
})();
