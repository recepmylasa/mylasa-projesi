'use strict';

/**
 * Tek yerden ayar: zorluk, eşikler, vb.
 * NOT: Rakamlar placeholders. 3–4. adımda birlikte kalibre edeceğiz.
 */
module.exports = {
  // Bayes önceli (topluluk ortalaması ve gücü)
  BAYESIAN_PRIOR_MEAN: 3.5,         // μ
  BAYESIAN_PRIOR_STRENGTH: 100,     // K (büyürse yükselmek zorlaşır)

  // İçerik ağırlığı: çok oy almış içeriklerin etkisi (log tabanı)
  VOTE_COUNT_WEIGHT_LOG_BASE: 10,

  // Altın rozet koşulları (görünür puan ve örneklem eşiği)
  GOLD_TIER_MIN_SCORE: 4.5,
  GOLD_TIER_MIN_VOTES: 1000,        // ileride topluluk büyüklüğüne göre ayarlarız

  // Yeni kullanıcı oy etkisi (arka planda yumuşatma; UI’da görünmez)
  NEW_USER_TRUST_MULTIPLIER: 0.5,
  TRUST_SCORE_EXPIRATION_DAYS: 90,
};
