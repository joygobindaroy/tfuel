import { useEffect, useState } from "react";
import Head from "next/head";

/** Public setup guide for partner shops: /shop-docs */
function Code({ children, lang }: { children: string; lang?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div style={{ position: "relative", margin: "10px 0" }}>
      <button onClick={() => { try { navigator.clipboard.writeText(children); setOk(true); setTimeout(() => setOk(false), 1500); } catch {} }} style={{ position: "absolute", top: 8, right: 8, border: 0, borderRadius: 8, padding: "5px 10px", background: "#374151", color: "#fff", cursor: "pointer", fontSize: 12 }}>{ok ? "Copied ✓" : "Copy"}</button>
      <pre style={{ background: "#0f172a", color: "#e2e8f0", borderRadius: 12, padding: "14px 14px", overflowX: "auto", fontSize: 12.5, lineHeight: 1.55, margin: 0 }} data-lang={lang}><code>{children}</code></pre>
    </div>
  );
}
const H2 = ({ id, children }: { id: string; children: React.ReactNode }) => <h2 id={id} style={{ fontSize: 22, margin: "34px 0 8px", paddingTop: 8, borderTop: "1px solid #e5e7eb" }}>{children}</h2>;
const Note = ({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "warn" }) => <div style={{ background: tone === "warn" ? "#fef3c7" : "#e0f2fe", color: "#111", borderRadius: 10, padding: "10px 14px", margin: "12px 0", fontSize: 14 }}>{children}</div>;

export default function ShopDocs() {
  const [base, setBase] = useState("https://YOUR-APP.vercel.app");
  useEffect(() => { setBase(window.location.origin); }, []);
  const nav: [string, string][] = [["how", "How it works"], ["setup", "1. Admin setup"], ["button", "2. Quick start: Pay button"], ["server", "3. Secure server integration"], ["login", "4. Login with Telegram"], ["webhook", "5. Webhooks"], ["wp", "6. WordPress / WooCommerce"], ["other", "7. Blogger & plain HTML"], ["test", "8. Test & go live"], ["errors", "9. Error codes"], ["faq", "10. FAQ & security"]];

  const nodeCode = `const crypto = require("crypto");
const BASE = "${base}";
const SHOP_ID = "YOUR_SHOP_ID";
const SECRET = process.env.TFUEL_SECRET;  // keep on the server only

async function tfuel(path, body) {
  const raw = JSON.stringify(body), ts = Date.now().toString();
  const sig = crypto.createHmac("sha256", SECRET).update(ts + "." + raw).digest("hex");
  const r = await fetch(BASE + "/api/shop/" + path, {
    method: "POST",
    headers: { "content-type": "application/json", "x-shop-id": SHOP_ID, "x-timestamp": ts, "x-signature": sig },
    body: raw,
  });
  return r.json();
}`;
  const phpCode = `<?php
const BASE = "${base}";
const SHOP_ID = "YOUR_SHOP_ID";
$SECRET = getenv("TFUEL_SECRET");   // keep on the server only

function tfuel($path, $body) {
  global $SECRET;
  $raw = json_encode($body); $ts = (string) round(microtime(true) * 1000);
  $sig = hash_hmac("sha256", $ts . "." . $raw, $SECRET);
  $ch = curl_init(BASE . "/api/shop/" . $path);
  curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $raw, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15,
    CURLOPT_HTTPHEADER => ["content-type: application/json", "x-shop-id: " . SHOP_ID, "x-timestamp: " . $ts, "x-signature: " . $sig]]);
  return json_decode(curl_exec($ch), true);
}`;
  const pyCode = `import hashlib, hmac, json, os, time, requests

BASE = "${base}"
SHOP_ID = "YOUR_SHOP_ID"
SECRET = os.environ["TFUEL_SECRET"].encode()   # keep on the server only

def tfuel(path, body):
    raw = json.dumps(body, separators=(",", ":"))
    ts = str(int(time.time() * 1000))
    sig = hmac.new(SECRET, f"{ts}.{raw}".encode(), hashlib.sha256).hexdigest()
    r = requests.post(f"{BASE}/api/shop/{path}", data=raw, timeout=15,
        headers={"content-type": "application/json", "x-shop-id": SHOP_ID, "x-timestamp": ts, "x-signature": sig})
    return r.json()`;

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "26px 16px 80px", fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif", color: "#111", lineHeight: 1.6 }}>
      <Head><title>Shop setup guide</title><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="robots" content="noindex" /></Head>
      <h1 style={{ fontSize: 30, margin: "0 0 6px" }}>Accept TFUEL &amp; USDT on your website</h1>
      <p style={{ color: "#4b5563", marginTop: 0 }}>Complete guide for partner shops. Your customers sign in with Telegram and pay from their wallet — no card forms, no chargebacks. Takes about 10 minutes.</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "14px 0" }}>
        {nav.map(([id, t]) => <a key={id} href={`#${id}`} style={{ background: "#f3f4f6", borderRadius: 999, padding: "6px 12px", fontSize: 13, color: "#111", textDecoration: "none" }}>{t}</a>)}
      </div>

      <H2 id="how">How it works</H2>
      <ol>
        <li><b>You add a pay button</b> (or call our API from your server). We create an <b>order</b> with your price in USD.</li>
        <li><b>The customer opens the order</b> in the TFUEL Mini App inside Telegram, picks <b>TFUEL</b> or <b>USDT</b>, enters their PIN if set, and confirms.</li>
        <li><b>You are notified</b> by a signed <b>webhook</b> (and you can always ask the <b>status</b> API). Deliver the product only after you see <code>paid</code>.</li>
        <li><b>Settlement:</b> the platform keeps its fee (set per shop by the admin). The rest is owed to you and paid out by the admin (USDT) as agreed.</li>
      </ol>
      <Note>Prices are set by you in <b>USD</b>. TFUEL customers pay the live TFUEL equivalent at the moment they confirm; USDT customers pay the same number of USDT.</Note>

      <H2 id="setup">1. Admin setup (the platform owner does this once)</H2>
      <ol>
        <li>Open the Admin panel → <b>Settings → Referral link</b> and enter your bot&apos;s Mini App link, e.g. <code>https://t.me/YourBot/app</code>. Payment links open the app through it. <i>If this is empty, orders fail with <code>app_link_not_set</code>.</i></li>
        <li>Admin → <b>Shops</b> → switch on <b>Enable shop payments</b> (master switch).</li>
        <li>Tap <b>Add shop</b> and fill in:
          <ul>
            <li><b>Name</b> — shown to customers.</li>
            <li><b>Domain</b> — the shop&apos;s website, full <code>https://</code> address, e.g. <code>https://myshop.com</code>. The Pay button only works on this domain.</li>
            <li><b>Login URL</b> — where customers land after tapping the shop in the app (default <code>/auth/tfuel</code> on the domain). Only needed if you want &quot;Login with Telegram&quot;.</li>
            <li><b>Webhook URL</b> — your endpoint that receives payment notifications (optional but recommended).</li>
            <li><b>Fee %</b>, <b>max order (USD)</b> and which coins are allowed (TFUEL / USDT).</li>
          </ul>
        </li>
        <li>After saving, a <b>Shop ID</b> and <b>secret</b> (<code>tfs_…</code>) are shown <b>once</b>. Send them to the shop developer privately. Lost it? Use <b>New secret</b> — the old one stops immediately.</li>
        <li>Press <b>Test connection</b> on the shop card. Fix every ❌ before going live (see <a href="#test">Test &amp; go live</a>).</li>
        <li>On each shop card, open <b>Copy-paste code</b> to get the exact script tag and button for that shop.</li>
      </ol>

      <H2 id="button">2. Quick start: the Pay button (no server code)</H2>
      <p>Best for simple sites, blogs, donation pages, digital downloads sold through your own delivery process. Two steps:</p>
      <p><b>Step 1.</b> Paste once before <code>&lt;/body&gt;</code> on every page that has a button (use the <code>data-key</code> from Admin → Shops → your shop → Copy-paste code):</p>
      <Code lang="html">{`<script src="${base}/shop.js" data-key="pk_XXXXXXXXXXXXXXXXXXXX" async></script>`}</Code>
      <p><b>Step 2.</b> Any element with <code>data-tfuel-pay</code> becomes a payment button:</p>
      <Code lang="html">{`<button data-tfuel-pay data-amount="5" data-title="Pro plan">Pay $5 with TFUEL / USDT</button>

<!-- all options -->
<a href="#" data-tfuel-pay
   data-amount="12.5"            <!-- price in USD (required) -->
   data-title="Ebook bundle"     <!-- shown to the customer -->
   data-ref="ORDER-1001"         <!-- your own order number (optional) -->
   data-return="https://myshop.com/thanks"   <!-- where the customer returns after paying (optional) -->
>Buy now</a>`}</Code>
      <p>What happens on click: the script asks <code>{base}/api/shop/button</code> to create an order and sends the customer to the payment screen in Telegram.</p>
      <Note tone="warn"><b>Important:</b> with the button, the amount is written in your page&apos;s HTML, so a technical visitor could change it. <b>Always check the paid amount</b> in the webhook (<code>usd</code> field) or in Admin → Shops → Orders before delivering anything. For fixed-price products use the <a href="#server">server integration</a> instead.</Note>
      <p>Tip: give each button a unique <code>data-ref</code>. If the same <code>ref</code> is used again with the same amount, the same order is returned (no duplicate); with a different amount you get <code>ref_conflict</code>.</p>

      <H2 id="server">3. Secure server integration (recommended)</H2>
      <p>Your server talks to ours. Every request is signed with your secret, so nobody can forge it. <b>Never put the secret in website JavaScript.</b></p>
      <h3>Signing rule</h3>
      <ul>
        <li>Method: <code>POST</code>, body: JSON. Base URL: <code>{base}/api/shop/&lt;endpoint&gt;</code></li>
        <li>Headers: <code>x-shop-id</code> = your Shop ID · <code>x-timestamp</code> = current time in <b>milliseconds</b> (must be within 5 minutes of our clock) · <code>x-signature</code> = <code>hex( HMAC-SHA256( secret, timestamp + &quot;.&quot; + rawBody ) )</code></li>
        <li>Sign the <b>exact</b> body string you send. Rate limit: 120 requests per minute per shop.</li>
      </ul>
      <p>Helper functions — pick your language:</p>
      <h4>Node.js</h4><Code lang="js">{nodeCode}</Code>
      <h4>PHP</h4><Code lang="php">{phpCode}</Code>
      <h4>Python</h4><Code lang="py">{pyCode}</Code>

      <h3>Endpoints</h3>
      <h4>POST /api/shop/order — create a payment</h4>
      <Code lang="json">{`// request
{ "ref": "ORDER-1001", "amount": 12.5, "title": "Pro plan",
  "user_id": "123456789",                         // optional: only this Telegram user may pay
  "return_url": "https://myshop.com/thanks" }      // optional: must be on your shop domain

// response
{ "success": true, "order_id": "…", "status": "open",
  "pay_url": "https://t.me/YourBot/app?startapp=pay_…", "expires_at": 1767225600000, "usd": 12.5 }`}</Code>
      <ul>
        <li><code>ref</code>: your unique order number (letters, digits, <code>. _ -</code>, max 64). Same <code>ref</code> + same amount = same order returned.</li>
        <li><code>amount</code>: USD between 0.01 and your shop&apos;s max order.</li>
        <li>An order is valid for <b>30 minutes</b>. Redirect the customer to <code>pay_url</code> right away.</li>
      </ul>
      <h4>POST /api/shop/status — ask about an order</h4>
      <Code lang="json">{`// request: { "order_id": "…" }  or  { "ref": "ORDER-1001" }
// response
{ "success": true, "order_id": "…", "ref": "ORDER-1001", "status": "paid",   // open | paid | expired | refunded
  "usd": 12.5, "currency": "usdt", "paid_usdt": 12.5, "paid_coins": null, "user_id": "123456789", "paid_at": 1767225000000 }`}</Code>
      <h4>POST /api/shop/refund — refund a paid order</h4>
      <Code lang="json">{`// request: { "order_id": "…" }   (full refund, once; the customer gets the same coin back)
// response: { "success": true, "status": "refunded" }`}</Code>
      <h4>POST /api/shop/exchange — turn a login code into a user</h4>
      <Code lang="json">{`// request: { "code": "<32 hex chars from ?code=>" }
// response: { "success": true, "user": { "id": "123456789", "name": "Alex", "username": "alex" } }`}</Code>

      <h3>Full checkout example (Node / Express)</h3>
      <Code lang="js">{`app.post("/checkout", async (req, res) => {
  const order = await db.createOrder(req.session.user.id, req.body.items); // your own order row, price from YOUR database
  const o = await tfuel("order", {
    ref: "ORDER-" + order.id,
    amount: order.totalUsd,
    title: "Order #" + order.id,
    user_id: req.session.user?.id,            // when logged in with Telegram
    return_url: "https://myshop.com/orders/" + order.id,
  });
  if (!o.success) return res.status(400).send(o.error);
  res.redirect(o.pay_url);
});`}</Code>
      <h3>Full checkout example (PHP)</h3>
      <Code lang="php">{`$o = tfuel("order", ["ref" => "ORDER-" . $orderId, "amount" => $totalUsd, "title" => "Order #" . $orderId,
                    "return_url" => "https://myshop.com/orders/" . $orderId]);
if (!empty($o["success"])) { header("Location: " . $o["pay_url"]); exit; }
echo "Payment error: " . ($o["error"] ?? "unknown");`}</Code>

      <H2 id="login">4. Login with Telegram (optional)</H2>
      <p>Customers can open your shop from inside the TFUEL app; they are signed in automatically — no passwords.</p>
      <ol>
        <li>The customer taps your shop in the app and approves the one-time connection.</li>
        <li>The app opens <b>Login URL</b> with <code>?code=&lt;32 hex&gt;</code> (valid 60 seconds, usable once).</li>
        <li>Your page calls <code>exchange</code> from the <b>server</b> with that code and gets <code>user.id / name / username</code>.</li>
        <li>Create your own session for that user. The Telegram <code>id</code> is stable — use it as the account key.</li>
      </ol>
      <Code lang="js">{`app.get("/auth/tfuel", async (req, res) => {
  const r = await tfuel("exchange", { code: String(req.query.code || "") });
  if (!r.success) return res.status(401).send("Login failed, please open the shop from the app again.");
  req.session.user = r.user;
  res.redirect("/");
});`}</Code>
      <Code lang="php">{`// /auth/tfuel
$r = tfuel("exchange", ["code" => $_GET["code"] ?? ""]);
if (!empty($r["success"])) { $_SESSION["user"] = $r["user"]; header("Location: /"); exit; }
http_response_code(401); echo "Login failed";`}</Code>

      <H2 id="webhook">5. Webhooks</H2>
      <p>When an order is paid or refunded we <code>POST</code> JSON to your Webhook URL with the same three headers (<code>x-shop-id</code>, <code>x-timestamp</code>, <code>x-signature</code>). <b>Verify the signature first.</b></p>
      <Code lang="json">{`{ "event": "order.paid",          // or "order.refunded", or "ping" (sent by Test connection)
  "order_id": "…", "ref": "ORDER-1001", "status": "paid",
  "usd": 12.5, "currency": "tfuel",   // or "usdt"
  "paid_usdt": null, "paid_coins": 8200, "user_id": "123456789" }`}</Code>
      <h4>Node.js (Express)</h4>
      <Code lang="js">{`app.post("/tfuel/webhook", express.raw({ type: "*/*" }), (req, res) => {
  const ts = req.headers["x-timestamp"], raw = req.body.toString();
  const sig = crypto.createHmac("sha256", SECRET).update(ts + "." + raw).digest("hex");
  const ok = sig.length === String(req.headers["x-signature"]).length &&
             crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(String(req.headers["x-signature"])));
  if (!ok || Math.abs(Date.now() - Number(ts)) > 5 * 60000) return res.sendStatus(401);
  const e = JSON.parse(raw);
  if (e.event === "order.paid") markPaid(e.ref, e.usd);       // check e.usd equals what you expected!
  if (e.event === "order.refunded") markRefunded(e.ref);
  res.sendStatus(200);                                          // reply 2xx quickly
});`}</Code>
      <h4>PHP</h4>
      <Code lang="php">{`$raw = file_get_contents("php://input");
$ts  = $_SERVER["HTTP_X_TIMESTAMP"] ?? "";
$ok  = hash_equals(hash_hmac("sha256", $ts . "." . $raw, $SECRET), $_SERVER["HTTP_X_SIGNATURE"] ?? "")
       && abs(round(microtime(true) * 1000) - (int) $ts) < 300000;
if (!$ok) { http_response_code(401); exit; }
$e = json_decode($raw, true);
if ($e["event"] === "order.paid") { /* mark $e["ref"] paid after checking $e["usd"] */ }
http_response_code(200);`}</Code>
      <h4>Python (Flask)</h4>
      <Code lang="py">{`@app.post("/tfuel/webhook")
def hook():
    raw = request.get_data(as_text=True); ts = request.headers.get("x-timestamp", "")
    mine = hmac.new(SECRET, f"{ts}.{raw}".encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(mine, request.headers.get("x-signature", "")) or abs(time.time() * 1000 - int(ts)) > 300000:
        return "", 401
    e = json.loads(raw)
    if e["event"] == "order.paid": mark_paid(e["ref"], e["usd"])
    return "", 200`}</Code>
      <Note><b>Failed deliveries are retried automatically</b> (up to 6 times over several hours) and the admin has a <b>Retry webhook</b> button on every order. Make your handler <b>idempotent</b> — the same event can arrive more than once. If you cannot receive webhooks, poll <code>/api/shop/status</code> every few seconds after the customer returns.</Note>

      <H2 id="wp">6. WordPress / WooCommerce</H2>
      <h3>A) Simple pay buttons anywhere (shortcode)</h3>
      <p>Add this to <b>Appearance → Theme file editor → functions.php</b> (or a &quot;Code Snippets&quot; plugin). Replace the key and the app address:</p>
      <Code lang="php">{`add_action('wp_footer', function () {
  echo '<script src="${base}/shop.js" data-key="pk_XXXXXXXXXXXXXXXXXXXX" async></script>';
});

// usage in any post/page:  [tfuel_pay amount="5" title="Pro plan" label="Pay $5"]
add_shortcode('tfuel_pay', function ($a) {
  $a = shortcode_atts(['amount' => '1', 'title' => '', 'label' => 'Pay with TFUEL / USDT', 'ref' => ''], $a);
  return '<button class="button" data-tfuel-pay data-amount="' . esc_attr($a['amount']) . '" data-title="' . esc_attr($a['title']) . '" data-ref="' . esc_attr($a['ref']) . '">' . esc_html($a['label']) . '</button>';
});`}</Code>
      <h3>B) WooCommerce payment gateway (server-side, secure)</h3>
      <p>This minimal gateway creates a signed order from the real cart total and marks the WooCommerce order paid from the webhook. Save as <code>wp-content/plugins/tfuel-gateway/tfuel-gateway.php</code> and activate it, then set the three constants in <code>wp-config.php</code>:</p>
      <Code lang="php">{`// wp-config.php
define('TFUEL_BASE',   '${base}');
define('TFUEL_SHOP_ID','YOUR_SHOP_ID');
define('TFUEL_SECRET', 'tfs_xxxxxxxx');`}</Code>
      <Code lang="php">{`<?php
/* Plugin Name: TFUEL Gateway */
add_action('plugins_loaded', function () {
  if (!class_exists('WC_Payment_Gateway')) return;

  function tfuel_call($path, $body) {
    $raw = wp_json_encode($body); $ts = (string) round(microtime(true) * 1000);
    $sig = hash_hmac('sha256', $ts . '.' . $raw, TFUEL_SECRET);
    $r = wp_remote_post(TFUEL_BASE . '/api/shop/' . $path, ['timeout' => 15, 'body' => $raw,
      'headers' => ['content-type' => 'application/json', 'x-shop-id' => TFUEL_SHOP_ID, 'x-timestamp' => $ts, 'x-signature' => $sig]]);
    return is_wp_error($r) ? null : json_decode(wp_remote_retrieve_body($r), true);
  }

  class WC_Gateway_TFUEL extends WC_Payment_Gateway {
    function __construct() {
      $this->id = 'tfuel'; $this->method_title = 'TFUEL / USDT'; $this->has_fields = false;
      $this->title = 'Pay with TFUEL or USDT (Telegram)'; $this->enabled = 'yes';
    }
    function process_payment($order_id) {
      $order = wc_get_order($order_id);
      $o = tfuel_call('order', ['ref' => 'WC-' . $order_id, 'amount' => (float) $order->get_total(),
        'title' => 'Order #' . $order_id, 'return_url' => $this->get_return_url($order)]);
      if (empty($o['success'])) { wc_add_notice('Payment error: ' . ($o['error'] ?? 'try again'), 'error'); return; }
      $order->update_status('pending', 'Waiting for TFUEL payment');
      return ['result' => 'success', 'redirect' => $o['pay_url']];
    }
  }
  add_filter('woocommerce_payment_gateways', function ($g) { $g[] = 'WC_Gateway_TFUEL'; return $g; });
});

// Webhook: set the shop's Webhook URL to  https://YOURSITE.com/wp-json/tfuel/v1/webhook
add_action('rest_api_init', function () {
  register_rest_route('tfuel/v1', '/webhook', ['methods' => 'POST', 'permission_callback' => '__return_true', 'callback' => function ($req) {
    $raw = $req->get_body(); $ts = $req->get_header('x-timestamp');
    if (!hash_equals(hash_hmac('sha256', $ts . '.' . $raw, TFUEL_SECRET), (string) $req->get_header('x-signature'))) return new WP_REST_Response('bad signature', 401);
    $e = json_decode($raw, true);
    if (($e['event'] ?? '') === 'order.paid' && strpos($e['ref'], 'WC-') === 0) {
      $order = wc_get_order((int) substr($e['ref'], 3));
      if ($order && abs((float) $order->get_total() - (float) $e['usd']) < 0.01) $order->payment_complete();
    }
    return new WP_REST_Response('ok', 200);
  }]);
});`}</Code>
      <Note tone="warn">Use a staging site first. WooCommerce stores prices in your shop currency — if it is not USD, convert before sending <code>amount</code>.</Note>

      <H2 id="other">7. Blogger, Wix, Shopify pages &amp; plain HTML</H2>
      <p>Anywhere you can paste HTML/JavaScript, use the <a href="#button">Pay button</a>:</p>
      <ul>
        <li><b>Blogger:</b> Theme → Edit HTML → paste the <code>&lt;script&gt;</code> before <code>&lt;/body&gt;</code>; then add buttons in posts (HTML view).</li>
        <li><b>Wix / Squarespace:</b> Settings → Custom code → add the script to &quot;Body - end&quot;; use an HTML embed element for each button.</li>
        <li><b>Shopify:</b> theme.liquid before <code>&lt;/body&gt;</code> for the script; for real checkout totals use a small server app with the <a href="#server">API</a>.</li>
        <li><b>Static / GitHub Pages / Netlify:</b> script + buttons are enough for fixed-price items; use a serverless function for the webhook.</li>
      </ul>

      <H2 id="test">8. Test &amp; go live</H2>
      <ol>
        <li>Admin → Shops → <b>Test connection</b>. It checks: payments switched on · bot link set · currencies · your website reachable · login page reachable · webhook answers a signed <code>ping</code>.</li>
        <li>Create a <b>$0.01</b> order (button or API). Open <code>pay_url</code> in Telegram and pay with USDT.</li>
        <li>Check: webhook received (<code>order.paid</code>), <code>status</code> says <code>paid</code>, Admin → Orders shows it with webhook ✓.</li>
        <li>Refund it (<code>refund</code> API or Admin → Orders → Refund) and confirm you get <code>order.refunded</code>.</li>
        <li>Go live: raise the <b>max order</b>, keep the secret in an environment variable, and set up an alert if your webhook returns errors.</li>
      </ol>

      <H2 id="errors">9. Error codes</H2>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
          <tbody>
            {[
              ["bad_signature", "Signature wrong. Sign the exact raw body: timestamp + \".\" + body, HMAC-SHA256, hex, with the current secret."],
              ["timestamp_skew", "Your server clock differs by more than 5 minutes, or timestamp is in seconds (use milliseconds)."],
              ["shop_unavailable", "Shop switched off, deleted, or the master switch (Enable shop payments) is off."],
              ["app_link_not_set", "Admin has not set Settings → Referral link."],
              ["bad_amount", "Amount must be between 0.01 and the shop's max order (USD)."],
              ["bad_ref", "ref may only contain letters, digits and . _ - (max 64)."],
              ["ref_conflict", "That ref already exists with a different amount. Use a new ref."],
              ["bad_return_url", "return_url must start with your shop's domain."],
              ["not_connected", "user_id was given but that user has not opened your shop from the app yet."],
              ["bad_user", "user_id must be the numeric Telegram id."],
              ["order_not_found", "Unknown order_id / ref for this shop."],
              ["order_expired / 410", "The order is older than 30 minutes or not open. Create a new one."],
              ["order_paid", "Already paid."],
              ["currency_off", "The customer chose a coin your shop does not accept."],
              ["not_refundable", "Only paid orders can be refunded, once."],
              ["bad_code", "Login code is wrong, already used or older than 60 seconds."],
              ["This key works only on …", "Pay button used on a different website than the Domain saved for the shop (check https vs http and www)."],
            ].map(([c, t]) => <tr key={c}><td style={{ padding: "8px 10px", borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" }}><code>{c}</code></td><td style={{ padding: "8px 10px", borderBottom: "1px solid #e5e7eb" }}>{t}</td></tr>)}
          </tbody>
        </table>
      </div>

      <H2 id="faq">10. FAQ &amp; security</H2>
      <ul>
        <li><b>Where do I keep the secret?</b> Only on your server, in an environment variable. If it leaks, press <b>New secret</b> in Admin.</li>
        <li><b>The customer paid but my site shows nothing.</b> Never rely on the browser redirect. Wait for the webhook or call <code>status</code>.</li>
        <li><b>Can customers pay twice?</b> No. An order can be paid once; the same <code>ref</code> returns the same order.</li>
        <li><b>Who pays the network/transaction fees?</b> There are none for the customer; the platform fee is deducted from your sales and shown in the settlement table.</li>
        <li><b>How do I get my money?</b> Admin → Shops → Settlement shows sales, fees and the amount owed. Payout is by USDT as agreed with the admin.</li>
        <li><b>Is the Pay button safe?</b> The key (<code>pk_…</code>) is public by design and can only create orders from your own domain. It cannot read orders or refund.</li>
        <li><b>Check the amount.</b> Always compare <code>usd</code> in the webhook with what you expected before delivering.</li>
      </ul>
      <p style={{ color: "#6b7280", fontSize: 13, marginTop: 30 }}>Need help? Contact the platform admin with your Shop ID and the order <code>ref</code>.</p>
    </div>
  );
}
