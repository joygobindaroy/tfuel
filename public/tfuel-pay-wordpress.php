<?php
/**
 * Plugin Name: TFUEL Pay button
 * Description: Adds the TFUEL Bot pay button to your site. Use [tfuel_pay amount="5" title="Pro plan"].
 * Version: 1.0
 *
 * Setup: edit the two constants below (App address + public key from Admin → Shops → Copy-paste code), upload this file to wp-content/plugins/, activate.
 * The public key only works on your own domain. Always confirm payments via the webhook / Admin → Shops → Orders before delivering.
 */
if (!defined('ABSPATH')) exit;
const TFUEL_APP = 'https://YOUR-APP.vercel.app';
const TFUEL_KEY = 'pk_XXXXXXXXXXXXXXXXXXXX';

add_action('wp_footer', function () {
  echo '<script src="' . esc_url(TFUEL_APP . '/shop.js') . '" data-key="' . esc_attr(TFUEL_KEY) . '" async></script>';
});
add_shortcode('tfuel_pay', function ($a) {
  $a = shortcode_atts(['amount' => '1', 'title' => 'Payment', 'ref' => '', 'label' => 'Pay with TFUEL / USDT'], $a);
  return '<button type="button" class="button" data-tfuel-pay data-amount="' . esc_attr($a['amount']) . '" data-title="' . esc_attr($a['title']) . '" data-ref="' . esc_attr($a['ref']) . '">' . esc_html($a['label']) . '</button>';
});
