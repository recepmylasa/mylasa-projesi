'use strict';

/**
 * Oy doğrulama ve suistimal kontrollerinin iskeleti.
 * Kurallar Firestore tarafında zaten var; burada ek savunma katmanı olur.
 * Detayları 3. adımda tamamlayacağız.
 */

function isRatingValueValid(value) {
  return Number.isInteger(value) && value >= 1 && value <= 5;
}

function validateNewRating({ raterId, authorId, value }) {
  if (!raterId || !authorId) return { ok: false, reason: 'missing_ids' };
  if (raterId === authorId) return { ok: false, reason: 'self_vote_denied' };
  if (!isRatingValueValid(value)) return { ok: false, reason: 'invalid_value' };
  return { ok: true };
}

module.exports = {
  isRatingValueValid,
  validateNewRating,
};
