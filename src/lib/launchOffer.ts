// Clip Engine launch week: $20 instead of $30, with the one time setup waived.
// Vienna runs on CEST (UTC+2) through August, so noon local is 10:00 UTC.
// Both the landing page and the in-app Clip Engine tab read this, so the promo
// switches on and expires on its own without anyone editing prices by hand.
const OFFER_START = Date.parse('2026-08-04T10:00:00Z');
const OFFER_END = Date.parse('2026-08-11T10:00:00Z');

export const CLIP_FULL_PRICE = '$30';
export const CLIP_OFFER_PRICE = '$20';

export function isClipOfferActive(now: number = Date.now()): boolean {
  return now >= OFFER_START && now < OFFER_END;
}
