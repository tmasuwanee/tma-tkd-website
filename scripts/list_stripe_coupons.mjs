// Run from project root: node scripts/list_stripe_coupons.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const key = process.env.TMA_STRIPE_SECRET_KEY;
if (!key) {
  console.error('TMA_STRIPE_SECRET_KEY not set in environment');
  process.exit(1);
}

const Stripe = require('stripe');
const stripe = new Stripe(key);

const coupons = await stripe.coupons.list({ limit: 100 });
console.log('=== STRIPE COUPONS ===');
for (const c of coupons.data) {
  const discount = c.percent_off ? `${c.percent_off}% off` : `$${(c.amount_off/100).toFixed(2)} off`;
  const exp = c.redeem_by ? new Date(c.redeem_by*1000).toISOString().split('T')[0] : 'no expiry';
  const status = c.valid ? 'ACTIVE' : 'INACTIVE';
  console.log(`[${status}] id=${c.id} | name="${c.name}" | ${discount} | expires: ${exp} | used: ${c.times_redeemed}`);
}

const promos = await stripe.promotionCodes.list({ limit: 100 });
console.log('\n=== PROMOTION CODES ===');
for (const p of promos.data) {
  const status = p.active ? 'ACTIVE' : 'INACTIVE';
  const exp = p.expires_at ? new Date(p.expires_at*1000).toISOString().split('T')[0] : 'no expiry';
  console.log(`[${status}] code="${p.code}" | coupon=${p.coupon.id} | expires: ${exp} | used: ${p.times_redeemed}`);
}
