// Day camp: morning care on digital-learning days / school-out holidays.
// $60 per day. Parents pick the day(s) they need; price is server-enforced.
export const DAY_CAMP_PRICE_CENTS = 60_00;
export const DAY_CAMP_PRICE_LABEL = "$60";
export const dayCampTotalCents = (numDays: number) => DAY_CAMP_PRICE_CENTS * Math.max(0, numDays);
