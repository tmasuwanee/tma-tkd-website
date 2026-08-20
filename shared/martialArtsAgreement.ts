// Single source of truth for the TMA Martial Arts Membership Agreement, shared by
// Taekwondo, Kickboxing, and Brazilian Jiu-Jitsu. Mirrors shared/afterschoolWaiver.ts
// so the client display and the server PDF can never drift.
//
// DELIBERATELY CONTAINS NO PRICES. Tuition, fees, and discounts change, so this
// document points at "the current fee schedule / the tuition in effect at signup"
// instead of dollar amounts. Terms are drawn from docs/OPERATIONS_SOPS.md (60-day
// cancellation, no pauses, roughly a 12 month term, sibling discount) and the topics
// covered in TMA's prior paper/ZenPlanner contracts.
//
// STYLE: no em dashes and no en dashes anywhere (owner rule). Break sentences with
// periods, commas, colons, or parentheses.
//
// NOTE: review with counsel before collecting real signatures. Cancellation and
// refund language is a legal term, not just an operational note.

export type WaiverSection = {
  key: string;
  title: string;
  // Each string is one paragraph. Rendered as wrapped body text in the PDF and as
  // <p> blocks on the page.
  body: string[];
};

// Bump when the wording changes so a signed record can be tied to the version agreed.
export const MARTIAL_ARTS_AGREEMENT_VERSION = "2026-08-17";

export const MARTIAL_ARTS_AGREEMENT_SECTIONS: WaiverSection[] = [
  {
    key: "programs",
    title: "Program This Agreement Covers",
    body: [
      "This agreement applies to enrollment in Top Martial Arts (TMA) programs including Taekwondo, Kickboxing, and Brazilian Jiu-Jitsu. The program, weekly class count, and tuition are the ones selected at signup and reflected in the current fee schedule in effect at that time.",
    ],
  },
  {
    key: "liability",
    title: "Waiver and Release From Liability",
    body: [
      "I (We) agree that the student(s) is engaging in physical exercise, the use of equipment, the use of the school's facilities, and training and instruction, which can be dangerous to the student and could cause injury. The student is voluntarily participating in these activities, and the buyer and student assume all risks of injury that may result. The buyer and student hereby waive and release any claim or right to sue the school, its employees, or its agents for injury to the student. The buyer and student have carefully read this waiver and release and fully understand that it is a release of all liability and damages of the school for any injury. The school will make no evaluation or recommendation as to whether the student or guests are sufficiently physically fit for any exercise activity. It is always advisable to consult your physician before undertaking a physical activity.",
    ],
  },
  {
    key: "assumptionOfRisk",
    title: "Assumption of Risk in Martial Arts Training",
    body: [
      "I (We) understand that Taekwondo, Kickboxing, and Brazilian Jiu-Jitsu are contact martial arts that involve striking, grappling, sparring, falls, and the use of training equipment, and that these activities carry an inherent risk of injury. The student assumes these risks voluntarily. The student is physically and mentally fit and able to participate in all class activities, and will inform an instructor of any condition, injury, or limitation that affects safe participation.",
    ],
  },
  {
    key: "facility",
    title: "Facility",
    body: [
      "I will provide full responsibility for and supervise my child, and any other child under my care, while on or around the facility, bathrooms, and lobby.",
      "TMA is a non-smoking facility, and I understand that smoking within 25 feet of a school such as TMA is unlawful.",
      "I will help TMA continue to provide a safe and clean environment by informing staff of any disorder in the facility.",
    ],
  },
  {
    key: "term",
    title: "Membership Term and Renewal",
    body: [
      "The membership term is the term selected at signup (typically about 12 months unless a different term is agreed in writing). The membership renews automatically at the end of the term unless I give written notice to discontinue as described under Cancellation.",
      "Tuition rates and fees may increase at the beginning of each year.",
    ],
  },
  {
    key: "billing",
    title: "Billing",
    body: [
      "Tuition is billed on a recurring basis to the payment method kept on file, unless the tuition is paid in full. Payments are processed through a third-party payment processor.",
      "If I need to make any change to the account (a change of card, a payoff, or similar), I will inform TMA at least 5 business days in advance so the change can be handled by TMA and not the billing company.",
      "Payments are drafted on schedule regardless of attendance. In special circumstances (for example, a documented medical reason), TMA may credit tuition toward future months at its discretion.",
      "If a payment passes its due date, a late fee may apply per the fee schedule in effect. All amounts are the tuition, fees, and discounts (including any sibling or family discount) in effect at signup or as later updated per this agreement.",
    ],
  },
  {
    key: "cancellation",
    title: "Cancellation",
    body: [
      "If I wish to cancel the membership for any reason, I must provide written notice to the TMA office. Cancellation takes effect after a 60-day notice period. I remain responsible for tuition during that 60-day period, and the student may continue to attend during it. After the notice period ends, the membership cancels.",
      "There are no membership pauses or freezes. If I wish to prepay, I may pay ahead, and those prepaid months become free classes when the student returns.",
      "If I cancel and later re-enroll, the registration fee in effect at that time applies again.",
    ],
  },
  {
    key: "conduct",
    title: "Class Time: Parents and Students",
    body: [
      "Only enter the classroom to support family and friends.",
      "Do not use a cellphone or other electronic device in the training room, as it can be a distraction.",
      "Show respect to the TMA facility and members by following the rules of its culture. This includes removing shoes before entering the training floor and bowing to TMA masters, instructors, and members.",
      "Attend only the number of classes per week allowed by the selected membership.",
    ],
  },
  {
    key: "beltPromotions",
    title: "Belt Promotions (Taekwondo)",
    body: [
      "Belt promotion eligibility is based on attendance and time at the current rank, per TMA's current promotion requirements. Higher ranks require more classes and more time at rank than lower ranks.",
      "Students participating in any TMA belt promotion must wear the full traditional uniform.",
      "Belt promotions carry a testing fee per the current fee schedule. Each rank earned receives a certificate of accomplishment.",
    ],
  },
  {
    key: "fees",
    title: "Additional Fees",
    body: [
      "Additional items and events are charged per the current fee schedule, including belt promotions, equipment and training gear (uniforms, sparring gear, BJJ gi, weapons such as bo staff or nunchucks, and similar), and special events (tournaments, school olympics, movie nights or sleepovers, and summer, spring, winter, and day camps).",
    ],
  },
  {
    key: "media",
    title: "Photo and Media Release",
    body: [
      "TMA staff may take photographs or video of students during classes, events, and activities, and may post them on social media or use them in other advertising materials for promotional purposes. Students will not be compensated for such use. If you do not consent to this use, tell the front desk in writing and it will be noted on the account.",
    ],
  },
  {
    key: "acknowledgement",
    title: "Acknowledgement",
    body: [
      "The student, buyer, and financial contact acknowledge that there are no refunds. It is also agreed and fully understood that the instructors and Top Martial Arts will not be liable for any damages arising from personal injury or loss sustained by the student or persons in or about the premises of the school. The student is physically and mentally fit and able to participate in all class activities.",
      "I am over 18 years of age. If the participant is not over 18 years of age, a parent or legal guardian must sign.",
    ],
  },
];

// Flattened plain-text version, stored on the waiver record as the disclaimer text
// (the exact wording the signer agreed to). Includes the version for the record.
export function martialArtsAgreementPlainText(): string {
  const header = `TOP MARTIAL ARTS MEMBERSHIP AGREEMENT (v${MARTIAL_ARTS_AGREEMENT_VERSION})\nTaekwondo, Kickboxing, and Brazilian Jiu-Jitsu`;
  const body = MARTIAL_ARTS_AGREEMENT_SECTIONS
    .map((s) => `${s.title.toUpperCase()}\n${s.body.join("\n")}`)
    .join("\n\n");
  return `${header}\n\n${body}`;
}
