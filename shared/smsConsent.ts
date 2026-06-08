/**
 * Canonical SMS consent language (CTIA-compliant for Twilio toll-free verification).
 *
 * Shared between client (form checkbox label) and server (snapshot stored on
 * the lead/registration row at consent time). Single source of truth so that
 * what the user sees AND what we store as proof are byte-identical.
 *
 * IMPORTANT: do not change this without re-submitting Twilio verification.
 * Any wording change must be reflected in:
 *   1. This file
 *   2. /privacy-policy SMS section
 *   3. /sms-terms page
 *   4. Twilio toll-free verification opt-in description
 *
 * Frequency disclosure (up to 10 msgs/month) reflects realistic upper bound
 * including: lead intake follow-up, trial reminders, missed-call recovery,
 * sequence touches, and class schedule updates per parent per month.
 */
export const SMS_CONSENT_TEXT =
  "I agree to receive recurring SMS text messages from Top Martial Arts " +
  "Suwanee (TMA) at the phone number above, including inquiry replies, trial " +
  "confirmations, class reminders, and program updates. Frequency: up to 10 " +
  "messages per month. Message and data rates may apply. Reply STOP to " +
  "unsubscribe or HELP for help. Consent is not a condition of purchase. " +
  "See SMS Terms and Privacy Policy.";

export const SMS_CONSENT_VERSION = "2026-06-08-v1";
