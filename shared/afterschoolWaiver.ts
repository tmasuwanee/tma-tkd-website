// Single source of truth for the After School enrollment waiver + policies.
// Imported by the client (to display + collect an initial per section) AND by
// the server PDF generator (to render the exact same text into the signed PDF),
// so the two can never drift apart. Verbatim from TMA's paper enrollment form.

export type WaiverSection = {
  key: string;
  title: string;
  // Each string is one paragraph. Rendered as wrapped body text in the PDF and
  // as <p> blocks on the page.
  body: string[];
};

export const AFTERSCHOOL_WAIVER_SECTIONS: WaiverSection[] = [
  {
    key: "liability",
    title: "Waiver and Release from Liability",
    body: [
      "I (We) agree that the student(s) is engaging in physical exercise, and the use of equipment, use of the school's facilities, training and instruction, which can be dangerous to the student and could cause injury to the student. Student is voluntarily participating in these activities and buyer and student assume all risks of injury to student which may result. Buyer and student hereby waive and release any claim or right to sue the school, employees or agents for injury to student. Buyer and student have carefully read this waiver and release, and fully understand it is a release of all liability and damage of the school for any injury. The school will make no evaluation or recommendation whether student of guests are sufficiently physically fit for any exercise activities. It is always advisable to consult your physician before undertaking a physical activity.",
    ],
  },
  {
    key: "martialArts",
    title: "Acknowledgement That We Are a Martial Arts School",
    body: [
      "I (We) understand that TMA is not a daycare but rather a martial arts school and that its intent is to teach martial arts physical skills as well as philosophical character building skills. I further acknowledge that because the school is not a daycare, the school is not responsible for the supervision and care of my child(ren) except while engaged in martial arts or martial arts related activities.",
    ],
  },
  {
    key: "pickup",
    title: "Student Pick Up Policy",
    body: [
      "I agree to pick up my child(ren) no later than 6:30 PM each day. A late fee of $5 for every 5 minute period will be assessed if I am late.",
      "I agree that for the safety of my child(ren) he/she is instructed to stay inside the school until I arrive and that I (or other designated guardian) will come into the school to pick up and sign him (them) out.",
    ],
  },
  {
    key: "absentee",
    title: "Student Absentee Policy",
    body: [
      "I agree to contact TMA prior to my child's dismissal time if for any reason my child(ren) is not in school and will not need to be picked up for the after school program.",
      "Tuition will not be pro-rated for Federal Holidays or absent, vacation days and TMA winter break.",
    ],
  },
  {
    key: "fees",
    title: "Additional Fees",
    body: [
      "Belt Promotion for color belts: $50. Supply Fee (per school year): $65. No-School Day Camp: $50. Equipment: Sparring Gear, Bo-staff, nunchucks. Special Events and Camps: Spring / Fall / Winter / Summer Camps, Movie Nights / Sleepovers, etc.",
    ],
  },
  {
    key: "billing",
    title: "Billing",
    body: [
      "I (We) understand that payments are processed by a third-party merchant, unless my tuition is paid in full, and if any changes need to be made to the account (draft changes, pay-off, etc.) I will inform TMA at least 5 business days in advance to take care of my needs and not the billing company.",
      "Payments will be drafted regularly despite the circumstances; only in special circumstances (ex. Doctor's Note) will we credit tuition toward the future.",
      "If I wish to terminate the membership for any reason, I must come to the TMA office to give a cancellation written notice 30 days prior to the cancellation date.",
      "Rates and Tuition fees may increase at the beginning of each new school year. If payments pass the due date, there will be a $25 late fee of the monthly tuition.",
      "I understand that I may not terminate my membership within the first 6 months upon registration. The contract will be automatically renewed unless I give a minimum of 30-day written notice to discontinue. The 10 Month Plan excludes June and July. Monthly Tuition is due on the 1st of each month.",
    ],
  },
];

// Flattened plain-text version, stored on the waiver record as the disclaimer text.
export function afterschoolWaiverPlainText(): string {
  return AFTERSCHOOL_WAIVER_SECTIONS
    .map((s) => `${s.title.toUpperCase()}\n${s.body.join("\n")}`)
    .join("\n\n");
}
