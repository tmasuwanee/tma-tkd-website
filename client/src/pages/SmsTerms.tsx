export default function SmsTerms() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <h1 className="text-3xl font-bold mb-2">SMS Terms &amp; Conditions</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: June 8, 2026</p>

        <div className="prose prose-sm max-w-none space-y-6 text-foreground">

          <section>
            <h2 className="text-xl font-semibold mb-2">1. Program description</h2>
            <p>Top Martial Arts Suwanee ("TMA," "we," "us") operates an SMS messaging program to communicate with parents, guardians, and prospective students about inquiries, trial classes, registrations, schedule changes, camp updates, and program announcements.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">2. How you opt in</h2>
            <p>You opt in by submitting a form on <strong>tmatkd.com</strong> (Free Class inquiry, Summer Camp registration, or Spring Break Camp registration) AND checking the SMS consent box located next to your phone number. The checkbox is not pre-checked.</p>
            <p className="mt-2">By checking the consent box and submitting the form, you agree to receive recurring SMS text messages from Top Martial Arts Suwanee at the phone number you provided.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">3. Types of messages you will receive</h2>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Replies to inquiries you submit via our website forms</li>
              <li>Trial class confirmations and reminders</li>
              <li>Camp and class registration confirmations and reminders</li>
              <li>Schedule changes, closures, and weather-related notices</li>
              <li>Program updates and important operational announcements</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">4. Message frequency</h2>
            <p>Message frequency varies based on your activity. Most parents receive <strong>up to 10 messages per month</strong>. We do not send promotional broadcasts to the SMS list.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">5. Message and data rates</h2>
            <p>Message and data rates may apply, depending on your wireless plan. Top Martial Arts Suwanee does not charge you for SMS messages. Check with your wireless carrier for details about your plan.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">6. How to opt out (STOP)</h2>
            <p>You can opt out at any time by replying <strong>STOP</strong> to any message we send. After we receive your STOP message, we will send you a single confirmation message acknowledging the opt-out, and you will not receive any additional messages.</p>
            <p className="mt-2">Replies accepted: STOP, END, CANCEL, UNSUBSCRIBE, QUIT.</p>
            <p className="mt-2">If you opt out, you can opt back in at any time by texting <strong>START</strong> or by submitting a new form on tmatkd.com with the SMS consent box checked.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">7. How to get help (HELP)</h2>
            <p>Reply <strong>HELP</strong> to any message and you will receive instructions on how to contact us. You can also reach us directly at:</p>
            <div className="mt-2 pl-4 border-l-2 border-muted">
              <p><strong>Top Martial Arts Suwanee</strong></p>
              <p>Phone: (770) 277-3009</p>
              <p>Email: tmasuwanee@gmail.com</p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">8. Supported carriers</h2>
            <p>Our SMS program is supported on major US carriers including AT&amp;T, Verizon, T-Mobile, Sprint, US Cellular, Boost, Cricket, MetroPCS, and others. Carriers are not liable for delayed or undelivered messages.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">9. Privacy</h2>
            <p>We do not share, sell, or rent your phone number or SMS opt-in data to third parties for their own marketing purposes. Phone numbers are shared only with our SMS delivery provider (Twilio) and only for the purpose of sending the messages described above.</p>
            <p className="mt-2">For full details on how we handle your data, see our <a href="/privacy-policy" className="underline">Privacy Policy</a>.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">10. Consent is not a condition of purchase</h2>
            <p>You are not required to consent to SMS messages in order to purchase services from Top Martial Arts Suwanee. If you wish to register for camps or classes without receiving SMS messages, please contact us directly by phone or email.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">11. Changes to these terms</h2>
            <p>We may update these SMS Terms from time to time. Material changes will be posted on this page with an updated effective date. Continued use of the SMS program after changes constitutes acceptance of the revised terms.</p>
          </section>

        </div>
      </div>
    </div>
  );
}
