'use strict';

const cfg = require('./config');

/**
 * Bu dosya SADECE matematik içerir.
 * Firestore/Admin gibi dış bağımlılık YOK.
 */

/** Bayes içerik skoru: (μ*K + sum) / (K + count) */
function bayesianContentScore(voteSum, voteCount) {
  const sum = Number(voteSum || 0);
  const cnt = Number(voteCount || 0);
  const num = (cfg.BAYESIAN_PRIOR_STRENGTH * cfg.BAYESIAN_PRIOR_MEAN) + sum;
  const den = cfg.BAYESIAN_PRIOR_STRENGTH + cnt;
  return den > 0 ? (num / den) : cfg.BAYESIAN_PRIOR_MEAN;
}

/** İçerik ağırlığı: çok oy alan içerik daha etkili, ama log ile azalan getirili. */
function contentWeight(voteCount) {
  const base = Number(cfg.VOTE_COUNT_WEIGHT_LOG_BASE || 10);
  const c = Number(voteCount || 0);
  return base > 1 ? (Math.log(1 + c) / Math.log(base)) : c;
}

/**
 * Kullanıcı itibarı: içerik skorlarının ağırlıklı ortalaması
 * contents: [{ voteSum, voteCount }, ...]
 * dönüş: { raw, visible, progress, sample, weightTotal }
 */
function userReputationFromContents(contents) {
  if (!Array.isArray(contents) || contents.length === 0) {
    return { raw: 0, visible: 0, progress: 0, sample: 0, weightTotal: 0 };
  }

  let weightedSum = 0;
  let weightTotal = 0;
  let sample = 0;

  for (const c of contents) {
    const count = Number(c?.voteCount || 0);
    const sum = Number(c?.voteSum || 0);
    const score = bayesianContentScore(sum, count);
    const w = contentWeight(count);

    weightedSum += score * w;
    weightTotal += w;
    sample += count;
  }

  const raw = weightTotal > 0 ? (weightedSum / weightTotal) : 0;
  const visible = Math.floor(raw * 10) / 10;             // 4.73 → 4.7
  const progress = (raw * 10) - Math.floor(raw * 10);    // 0..1

  return { raw, visible, progress, sample, weightTotal };
}

/**
 * Kullanıcı itibarı: userStats (weightedSum / weightTotal) üzerinden hızlı hesap
 * stats: { weightedSum:number, weightTotal:number, sample:number }
 */
function userReputationFromStats(stats) {
  const weightedSum = Number(stats?.weightedSum || 0);
  const weightTotal = Number(stats?.weightTotal || 0);
  const sample = Number(stats?.sample || 0);

  const raw = weightTotal > 0 ? (weightedSum / weightTotal) : 0;
  const visible = Math.floor(raw * 10) / 10;
  const progress = (raw * 10) - Math.floor(raw * 10);

  return { raw, visible, progress, sample, weightTotal };
}

module.exports = {
  bayesianContentScore,
  contentWeight,
  userReputationFromContents,
  userReputationFromStats,
};
