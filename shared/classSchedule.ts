/**
 * TMA Class Schedule — Trial Class Eligibility
 *
 * Rules:
 *  - Taekwondo kids (6–13): Mon 5:50–6:30 PM, Tue/Thu 4:40–5:20 PM, Wed/Fri 5:20–6:00 PM
 *  - Taekwondo teens/adults (14+): Mon/Thu All-Belts 7:10–7:50 PM
 *  - BJJ (9+): Mon 6:30–7:10 PM, Wed/Fri 6:00–6:40 PM
 *  - Kickboxing (ages 9+): Tue 7:10–8:10 PM, Wed 6:40–7:40 PM,
 *                                         Thu 6:30–7:10 PM, Fri 6:40–7:40 PM, Sat 12:00–1:00 PM
 */

export type DayOfWeek = "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday";

export interface ClassSlot {
  day: DayOfWeek;
  startTime: string; // e.g. "5:50 PM"
  endTime: string;   // e.g. "6:30 PM"
  label: string;     // e.g. "Monday 5:50–6:30 PM"
}

// Day-of-week index (0 = Sunday, 1 = Monday, …, 6 = Saturday)
const DAY_INDEX: Record<DayOfWeek, number> = {
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

function slot(day: DayOfWeek, startTime: string, endTime: string): ClassSlot {
  return { day, startTime, endTime, label: `${day} ${startTime}–${endTime}` };
}

// All class slots by program
export const CLASS_SCHEDULE: Record<string, ClassSlot[]> = {
  // Little Tigers Taekwondo — ages 4-5, 30-minute classes
  little_tigers: [
    slot("Monday",   "4:40 PM", "5:10 PM"),
    slot("Tuesday",  "5:20 PM", "5:50 PM"),
    slot("Thursday", "5:20 PM", "5:50 PM"),
  ],
  taekwondo_kids: [
    slot("Monday",    "5:50 PM", "6:30 PM"),
    slot("Tuesday",   "4:40 PM", "5:20 PM"),
    slot("Wednesday", "5:20 PM", "6:00 PM"),
    slot("Thursday",  "4:40 PM", "5:20 PM"),
    slot("Friday",    "5:20 PM", "6:00 PM"),
  ],
  taekwondo_adult: [
    slot("Monday",   "7:10 PM", "7:50 PM"),
    slot("Thursday", "7:10 PM", "7:50 PM"),
  ],
  bjj: [
    slot("Monday",    "6:30 PM", "7:10 PM"),
    slot("Wednesday", "6:00 PM", "6:40 PM"),
    slot("Friday",    "6:00 PM", "6:40 PM"),
  ],
  kickboxing: [
    slot("Tuesday",   "7:10 PM", "8:10 PM"),
    slot("Wednesday", "6:40 PM", "7:40 PM"),
    slot("Thursday",  "6:30 PM", "7:10 PM"),
    slot("Friday",    "6:40 PM", "7:40 PM"),
    slot("Saturday",  "12:00 PM", "1:00 PM"),
  ],
};

/**
 * Returns the eligible class slots for a given program and age.
 * Returns an empty array if the program doesn't offer trial classes
 * (e.g. afterschool, summer camp).
 */
export function getEligibleSlots(program: string, age: number): ClassSlot[] {
  switch (program) {
    case "little_tigers":
      // Little Tigers Taekwondo, ages 4-5 only
      if (age >= 4 && age <= 5) return CLASS_SCHEDULE.little_tigers;
      return [];
    case "taekwondo":
      // Route 4-5 year olds to Little Tigers automatically if they pick Taekwondo
      if (age >= 4 && age <= 5) return CLASS_SCHEDULE.little_tigers;
      if (age >= 6 && age <= 13) return CLASS_SCHEDULE.taekwondo_kids;
      if (age >= 14) return CLASS_SCHEDULE.taekwondo_adult;
      return []; // under 4 — contact school directly
    case "bjj":
      if (age >= 9) return CLASS_SCHEDULE.bjj;
      return []; // under 9 — not eligible
    case "kickboxing":
      if (age >= 9) return CLASS_SCHEDULE.kickboxing;
      return []; // under 9 not eligible
    default:
      return []; // afterschool, summer — no trial class calendar
  }
}

/**
 * Given a ClassSlot and a reference date (defaults to today),
 * returns the next calendar date (YYYY-MM-DD) on which that day falls,
 * starting from tomorrow to avoid booking same-day slots.
 */
export function getNextDateForSlot(slot: ClassSlot, from?: Date): string {
  return getUpcomingDates(slot, 1, from)[0];
}

/**
 * Returns the next 4 upcoming dates for a given slot (useful for showing
 * a calendar of available dates to pick from).
 */
export function getUpcomingDates(slot: ClassSlot, count = 4, from?: Date): string[] {
  const dates: string[] = [];
  const base = from ? new Date(from) : new Date();
  base.setHours(0, 0, 0, 0);
  const targetDay = DAY_INDEX[slot.day];
  // Find first occurrence starting from tomorrow
  const start = new Date(base);
  start.setDate(start.getDate() + 1); // start from tomorrow
  const startDay = start.getDay();
  let diff = (targetDay - startDay + 7) % 7;
  if (diff === 0) diff = 7; // same weekday → next week
  start.setDate(start.getDate() + diff); // move to the target weekday
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i * 7);
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

/** Format a YYYY-MM-DD string as a human-readable date like "Mon, Jun 2" */
export function formatDate(isoDate: string): string {
  const d = new Date(isoDate + "T12:00:00"); // noon to avoid timezone shifts
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
