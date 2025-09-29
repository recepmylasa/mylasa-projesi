/* ==== Mylasa Layout Engine v2 ===========================================
   Görünür viewport değerlerini CSS değişkenlerine atar. Global padding yok.
=========================================================================== */
(function () {
  function apply() {
    try {
      const vv = window.visualViewport;
      const vw = vv ? vv.width : window.innerWidth;
      const left = vv ? vv.offsetLeft : 0;
      const right = vv ? (window.innerWidth - (vv.offsetLeft + vv.width)) : 0;
      const r = document.documentElement;
      r.style.setProperty("--vv-left", left + "px");
      r.style.setProperty("--vv-right", right + "px");
      r.style.setProperty("--vv-width", vw + "px");
      if (document.body) document.body.style.overflowX = "hidden";
    } catch (e) {}
  }
  apply();
  window.addEventListener("resize", apply, { passive: true });
  window.addEventListener("orientationchange", apply, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", apply, { passive: true });
    window.visualViewport.addEventListener("scroll", apply, { passive: true });
  }
})();
