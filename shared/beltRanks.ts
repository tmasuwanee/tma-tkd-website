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
