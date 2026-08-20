/**
 * Belt rank progression sequence for TMA Taekwondo.
 * This is the authoritative order — rank up/down buttons must follow this exact sequence.
 */

export const BELT_SEQUENCE = [
  "White",
  "Yellow",
  "Orange",
  "Green",
  "Purple",
  "Blue",
  "Brown",
  "Red",
  "High-Red",
  "Pre-Black",
  "1st Dan Black",
  "1st Dan Black Lv.1",
  "1st Dan Black Lv.2",
  "1st Dan Black Lv.3",
  "1st Dan Black Lv.4",
  "2nd Dan Black",
  "2nd Dan Black Lv.1",
  "2nd Dan Black Lv.2",
  "2nd Dan Black Lv.3",
  "2nd Dan Black Lv.4",
  "3rd Dan Black",
] as const;

export type BeltRank = (typeof BELT_SEQUENCE)[number];

/**
 * Get the next rank in the progression.
 * Returns undefined if already at the highest rank.
 */
export function getNextRank(currentRank: string | null | undefined): BeltRank | undefined {
  if (!currentRank) return BELT_SEQUENCE[0]; // Start at White if no rank
  const currentIndex = BELT_SEQUENCE.indexOf(currentRank as BeltRank);
  if (currentIndex === -1 || currentIndex === BELT_SEQUENCE.length - 1) return undefined;
  return BELT_SEQUENCE[currentIndex + 1];
}

/**
 * Get the previous rank in the progression.
 * Returns undefined if already at the lowest rank.
 */
export function getPreviousRank(currentRank: string | null | undefined): BeltRank | undefined {
  if (!currentRank) return undefined; // Can't demote from no rank
  const currentIndex = BELT_SEQUENCE.indexOf(currentRank as BeltRank);
  if (currentIndex <= 0) return undefined;
  return BELT_SEQUENCE[currentIndex - 1];
}

/**
 * Check if a rank is valid.
 */
export function isValidBeltRank(rank: string): rank is BeltRank {
  return BELT_SEQUENCE.includes(rank as BeltRank);
}

/**
 * Minimum attendance + time-at-rank to test OUT of a given belt, from TMA's
 * membership agreement, applied per step within each band:
 *   up to Orange (White, Yellow, Orange): 16 classes, 2 months at rank
 *   through Brown (Green, Purple, Blue, Brown): 36 classes, 4 months
 *   Red / High-Red: 49 classes, 6 months
 * Pre-Black and the Dan ranks are by invitation/testing only, so no auto threshold
 * (returns null). The auto check is a HINT only; staff can override readiness.
 */
export function promotionThreshold(currentRank: string | null | undefined): { classes: number; months: number } | null {
  const r = (currentRank ?? "White");
  if (r === "White" || r === "Yellow" || r === "Orange") return { classes: 16, months: 2 };
  if (r === "Green" || r === "Purple" || r === "Blue" || r === "Brown") return { classes: 36, months: 4 };
  if (r === "Red" || r === "High-Red") return { classes: 49, months: 6 };
  return null; // Pre-Black and Dan ranks: manual / by invitation
}
