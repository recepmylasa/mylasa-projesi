'use strict';

/**
 * Motorun dışa açılan tek kapısı: burada calculator + data-access + validators bir araya gelir.
 * 3. ve 4. adımda gerçek iş mantığını dolduracağız.
 */

const cfg = require('./config');
const calc = require('./calculator');
const dao = require('./data-access');
const val = require('./validators');

module.exports = {
  cfg,
  calc,
  dao,
  val,
};
