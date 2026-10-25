/*
 * TFUEL pay button — paste once on the shop website:
 *   <script src="https://YOUR-APP/shop.js" data-key="pk_xxx" async></script>
 * Then any element like this becomes a "Pay with TFUEL / USDT" button:
 *   <button data-tfuel-pay data-amount="5" data-title="Pro plan">Pay $5</button>
 * IMPORTANT: always confirm the payment on your server (webhook / status API) before delivering.
 */
(function () {
  var script = document.currentScript;
  if (!script || !script.src) return;
  var key = script.getAttribute('data-key');
  var API = script.src.replace(/shop\.js(\?.*)?$/, '') + 'api/shop/button';
  function go(el) {
    if (el.__busy) return;
    el.__busy = true;
    var old = el.textContent;
    el.textContent = 'Please wait…';
    fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pk: key,
        amount: Number(el.getAttribute('data-amount')),
        title: el.getAttribute('data-title') || '',
        ref: el.getAttribute('data-ref') || '',
        return_url: el.getAttribute('data-return') || ''
      })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.success && d.pay_url) { location.href = d.pay_url; return; }
      alert((d && d.error) || 'Payment could not be started');
    }).catch(function () { alert('Network error. Please try again.'); })
      .then(function () { el.__busy = false; el.textContent = old; });
  }
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-tfuel-pay]') : null;
    if (!t) return;
    e.preventDefault();
    go(t);
  });
})();
