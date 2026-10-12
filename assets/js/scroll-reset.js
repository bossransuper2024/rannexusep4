(function () {
  function keepHomeAtTop() {
    if (!window.location.hash || window.location.hash === "#home") {
      window.scrollTo(0, 0);
    }
  }

  if ("scrollRestoration" in window.history) {
    window.history.scrollRestoration = "manual";
  }

  keepHomeAtTop();
  window.addEventListener("pageshow", keepHomeAtTop);
  window.addEventListener("DOMContentLoaded", keepHomeAtTop);
  window.addEventListener("load", function () {
    keepHomeAtTop();
    window.setTimeout(keepHomeAtTop, 250);
    window.setTimeout(keepHomeAtTop, 800);
  });
})();
