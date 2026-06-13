import { ENV } from './_core/env';
import { Lead } from '../drizzle/schema';

// Online summer camp waiver (Cloudflare Pages). Parents complete it before the
// first day: liability release, medical/allergy info, and authorized pickup.
const CAMP_WAIVER_URL = 'https://tma-camp-waiver.pages.dev/';

/**
 * Send lead data to Google Sheets
 */
export async function sendToGoogleSheets(lead: Lead) {
  try {
    if (!ENV.googleServiceAccountJson || !ENV.googleSheetsId) {
      console.warn('[Google Sheets] Missing credentials, skipping');
      return;
    }

    const serviceAccount = JSON.parse(ENV.googleServiceAccountJson);
    
    // Get access token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: serviceAccount.client_id,
        client_secret: serviceAccount.private_key,
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: createJWT(serviceAccount),
      }).toString(),
    });

    if (!tokenResponse.ok) {
      throw new Error(`Token request failed: ${tokenResponse.statusText}`);
    }

    const { access_token } = await tokenResponse.json();

    // Append row to sheet
    const sheetsResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${ENV.googleSheetsId}/values/Sheet1!A:I:append?valueInputOption=USER_ENTERED`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          values: [[
            new Date(lead.createdAt).toISOString(),
            lead.parentName,
            lead.kidName,
            lead.kidAge,
            lead.programInterest,
            lead.motivation || '',
            lead.email,
            lead.phone,
            lead.additionalNotes || '',
          ]],
        }),
      }
    );

    if (!sheetsResponse.ok) {
      throw new Error(`Sheets append failed: ${sheetsResponse.statusText}`);
    }

    console.log('[Google Sheets] Lead added successfully');
  } catch (error) {
    console.error('[Google Sheets] Error:', error);
    // Don't throw - we don't want to fail the lead submission if sheets fails
  }
}

/**
 * Send notification to Slack
 */
export async function sendToSlack(lead: Lead) {
  try {
    if (!ENV.slackWebhookUrl) {
      console.warn('[Slack] Missing webhook URL, skipping');
      return;
    }

    const message = {
      text: '🥋 New Free Class Inquiry',
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🥋 New Free Class Inquiry',
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Parent Name:*\n${lead.parentName}`,
            },
            {
              type: 'mrkdwn',
              text: `*Child Name:*\n${lead.kidName}`,
            },
            {
              type: 'mrkdwn',
              text: `*Child Age:*\n${lead.kidAge}`,
            },
            {
              type: 'mrkdwn',
              text: `*Program Interest:*\n${lead.programInterest}`,
            },
            {
              type: 'mrkdwn',
              text: `*Email:*\n${lead.email}`,
            },
            {
              type: 'mrkdwn',
              text: `*Phone:*\n${lead.phone}`,
            },
          ],
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Motivation:*\n${lead.motivation || 'Not specified'}`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Additional Notes:*\n${lead.additionalNotes || 'None'}`,
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Submitted: ${new Date(lead.createdAt).toLocaleString()}`,
            },
          ],
        },
      ],
    };

    const response = await fetch(ENV.slackWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      throw new Error(`Slack webhook failed: ${response.statusText}`);
    }

    console.log('[Slack] Notification sent successfully');
  } catch (error) {
    console.error('[Slack] Error:', error);
    // Don't throw - we don't want to fail the lead submission if Slack fails
  }
}

/**
 * Send email via Resend API
 */
async function sendEmail(to: string, subject: string, html: string) {
  if (!ENV.resendApiKey) {
    console.warn('[Email] Resend API key not configured, skipping');
    return;
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ENV.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'TMA Summer Camp <noreply@tmatkd.com>',
      to,
      subject,
      html,
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Resend error ${response.status}: ${text}`);
  }
  return response.json();
}

/**
 * Send admin notification email when a free class inquiry is submitted
 */
export async function sendEmailNotification(lead: Lead) {
  try {
    if (!ENV.leadNotificationEmail) {
      console.warn('[Email] Missing notification email, skipping');
      return;
    }

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a2d5a; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">🥋 New Free Class Inquiry</h1>
        </div>
        <div style="padding: 24px; background: #f9f9f9;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px; font-weight: bold;">Parent Name:</td><td style="padding: 8px;">${lead.parentName}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Child Name:</td><td style="padding: 8px;">${lead.kidName}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Child Age:</td><td style="padding: 8px;">${lead.kidAge}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Program Interest:</td><td style="padding: 8px;">${lead.programInterest}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Email:</td><td style="padding: 8px;"><a href="mailto:${lead.email}">${lead.email}</a></td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Phone:</td><td style="padding: 8px;"><a href="tel:${lead.phone}">${lead.phone}</a></td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Motivation:</td><td style="padding: 8px;">${lead.motivation || 'Not specified'}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Additional Notes:</td><td style="padding: 8px;">${lead.additionalNotes || 'None'}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Submitted:</td><td style="padding: 8px;">${new Date(lead.createdAt).toLocaleString()}</td></tr>
          </table>
        </div>
        <div style="background: #1a2d5a; padding: 16px; text-align: center;">
          <p style="color: white; margin: 0; font-size: 12px;">Top Martial Arts Suwanee &bull; (770) 277-3009</p>
        </div>
      </div>
    `;

    await sendEmail(ENV.leadNotificationEmail, `New Free Class Inquiry - ${lead.kidName}`, html);
    console.log('[Email] Admin notification sent to:', ENV.leadNotificationEmail);
  } catch (error) {
    console.error('[Email] Error sending admin notification:', error);
  }
}

/**
 * Send confirmation email to parent after camp registration payment
 */
export async function sendCampRegistrationConfirmation(params: {
  parentFirstName: string;
  parentLastName: string;
  parentEmail: string;
  camper1Name: string;
  programType: string;
  selectedWeeks: string[];
  amountPaid: number;
  addExtendedCare: boolean;
}) {
  try {
    const programLabel = params.programType === '5day' ? '5-Day Program' : params.programType === '3day' ? '3-Day Program' : 'Daily Drop-In';
    const weeksText = params.selectedWeeks.length > 0 ? params.selectedWeeks.join(', ') : 'Daily drop-in (no specific weeks selected)';
    const amountFormatted = `$${(params.amountPaid / 100).toFixed(2)}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a2d5a; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">🥋 Registration Confirmed!</h1>
          <p style="color: #a0b4d6; margin: 8px 0 0;">TMA Summer Camp 2026</p>
        </div>
        <div style="padding: 24px; background: #ffffff;">
          <p style="font-size: 16px;">Hi ${params.parentFirstName},</p>
          <p>Thank you for registering <strong>${params.camper1Name}</strong> for TMA Summer Camp 2026! We're excited to have them join us.</p>
          <div style="background: #f0f4ff; border-left: 4px solid #1a2d5a; padding: 16px; margin: 20px 0; border-radius: 4px;">
            <h3 style="margin: 0 0 12px; color: #1a2d5a;">Registration Summary</h3>
            <p style="margin: 4px 0;"><strong>Camper:</strong> ${params.camper1Name}</p>
            <p style="margin: 4px 0;"><strong>Program:</strong> ${programLabel}</p>
            <p style="margin: 4px 0;"><strong>Weeks:</strong> ${weeksText}</p>
            ${params.addExtendedCare ? '<p style="margin: 4px 0;"><strong>Add-on:</strong> Early Drop-Off &amp; Late Pick-Up</p>' : ''}
            <p style="margin: 4px 0;"><strong>Amount Paid:</strong> ${amountFormatted}</p>
          </div>
          <div style="background: #fff8e1; border: 1px solid #ffe082; border-radius: 8px; padding: 16px; margin: 20px 0; text-align: center;">
            <p style="margin: 0 0 12px; font-weight: bold; color: #1a2d5a;">One required step: please complete your camp waiver before the first day.</p>
            <a href="${CAMP_WAIVER_URL}" style="display: inline-block; background: #c41e3a; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold;">Complete the camp waiver</a>
            <p style="margin: 12px 0 0; font-size: 12px; color: #777;">We also sent this in a separate email so it is easy to find later.</p>
          </div>
          <h3 style="color: #1a2d5a;">What's Next?</h3>
          <ul style="line-height: 1.8;">
            <li>Camp runs <strong>Monday to Friday, 9am to 4pm</strong> (Extended care: 7am to 6pm)</li>
            <li>Drop-off at <strong>Top Martial Arts, 2005 Lawrenceville Suwanee Rd, Suwanee, GA 30024</strong></li>
            <li>Wear comfortable athletic clothing and bring a water bottle and lunch</li>
          </ul>
          <p>Questions? Call us at <strong>(770) 277-3009</strong> or email <a href="mailto:tmasuwanee@gmail.com">tmasuwanee@gmail.com</a></p>
        </div>
        <div style="background: #1a2d5a; padding: 16px; text-align: center;">
          <p style="color: white; margin: 0; font-size: 12px;">Top Martial Arts Suwanee &bull; 2005 Lawrenceville Suwanee Rd, Suwanee, GA 30024 &bull; (770) 277-3009</p>
        </div>
      </div>
    `;

    await sendEmail(params.parentEmail, 'Your TMA Summer Camp 2026 Registration is Confirmed!', html);
    console.log('[Email] Confirmation sent to parent:', params.parentEmail);
  } catch (error) {
    console.error('[Email] Error sending camp confirmation:', error);
  }
}

/**
 * Send a dedicated waiver email to the parent right after camp registration.
 * Separate from the confirmation so the required action does not get lost.
 */
export async function sendCampWaiverEmail(params: {
  parentFirstName: string;
  parentEmail: string;
  camper1Name: string;
}) {
  try {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a2d5a; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 22px;">One Quick Step Before Camp</h1>
          <p style="color: #a0b4d6; margin: 8px 0 0;">TMA Summer Camp 2026 Waiver</p>
        </div>
        <div style="padding: 24px; background: #ffffff;">
          <p style="font-size: 16px;">Hi ${params.parentFirstName},</p>
          <p>${params.camper1Name} is all set for camp. Before their first day, please complete the camp waiver. It covers the liability release, medical and allergy info, and authorized pickup, and it takes about 3 minutes.</p>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${CAMP_WAIVER_URL}" style="display: inline-block; background: #c41e3a; color: white; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: bold; font-size: 16px;">Complete the camp waiver</a>
          </div>
          <p style="font-size: 13px; color: #777;">If the button does not work, copy and paste this link into your browser:<br><a href="${CAMP_WAIVER_URL}">${CAMP_WAIVER_URL}</a></p>
          <p>Questions? Call or text us at <strong>(770) 277-3009</strong>.</p>
        </div>
        <div style="background: #1a2d5a; padding: 16px; text-align: center;">
          <p style="color: white; margin: 0; font-size: 12px;">Top Martial Arts Suwanee &bull; 2005 Lawrenceville Suwanee Rd, Suwanee, GA 30024 &bull; (770) 277-3009</p>
        </div>
      </div>
    `;
    await sendEmail(params.parentEmail, 'Action needed: complete your TMA Summer Camp waiver', html);
    console.log('[Email] Waiver email sent to parent:', params.parentEmail);
  } catch (error) {
    console.error('[Email] Error sending waiver email:', error);
  }
}

/**
 * Create JWT for Google Service Account
 */
function createJWT(serviceAccount: any): string {
  const header = Buffer.from(JSON.stringify({
    alg: 'RS256',
    typ: 'JWT',
  })).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  })).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  // Note: In production, you'd need to sign this with the private key
  // For now, this is a placeholder
  return `${header}.${payload}.signature`;
}
