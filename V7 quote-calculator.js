/**
 * Quote Calculator — Core Calculation Module
 * Allied Trucking of Palm Beach
 *
 * This module contains all business logic for calculating
 * hauling and material sell rates, margins, and all-in quotes.
 * It has no UI dependencies and can be used in any JavaScript
 * environment (browser, Node.js) or ported to another language.
 *
 * --- BROKER FEE ---
 * A 10% broker fee is automatically deducted from haul cost.
 * The fee is kept as margin before any additional margin is applied.
 * Example: $100 haul cost → $10 broker kept → $90 net payout to truck.
 * At 10% additional margin, sell = $100 (broker fee covers the margin).
 *
 * --- MARGIN METHOD ---
 * All margins are calculated as a percentage of the SELL price,
 * not the cost. This is standard gross margin, not markup.
 * Formula: sell = cost / (1 - marginFraction)
 * Example: cost = $90, margin = 10% → sell = $90 / 0.90 = $100
 *
 * --- TAX ---
 * Tax applies to material cost only, never to hauling.
 * Tax is applied before margin: taxedCost = cost × (1 + taxRate)
 * Then margin is applied on top of the taxed cost.
 *
 * --- ROUNDING ---
 * Final all-in price can be rounded up or down to the nearest
 * $0.50 or $1.00 increment. Round up protects margin,
 * round down is used to hit a cleaner competitive number.
 */

const BROKER_FEE = 0.10; // 10% broker fee on all haul costs

// ─────────────────────────────────────────────
// HAULING
// ─────────────────────────────────────────────

/**
 * Calculate the haul sell rate.
 *
 * The broker fee is deducted from the raw haul cost first,
 * giving the net payout to the truck. Additional margin is
 * then applied on top of that net cost.
 *
 * At additionalMarginPct = 10 (matching broker fee),
 * sell price equals the raw haul cost entered.
 *
 * @param {number} haulCost - What you pay the truck (raw)
 * @param {number} additionalMarginPct - Extra margin % on top of broker fee (0–50)
 * @returns {object} { netPayout, brokerKept, sell, totalMarginPct }
 */
function calcHaul(haulCost, additionalMarginPct) {
  if (!haulCost || haulCost <= 0) {
    return { netPayout: 0, brokerKept: 0, sell: 0, totalMarginPct: 0 };
  }

  const brokerKept = haulCost * BROKER_FEE;
  const netPayout = haulCost * (1 - BROKER_FEE);
  const marginFraction = additionalMarginPct / 100;

  const sell = marginFraction >= 1
    ? netPayout * 1000          // safety cap — margin can't exceed 100%
    : netPayout / (1 - marginFraction);

  const totalMarginPct = sell > 0 ? ((sell - netPayout) / sell) * 100 : 0;

  return {
    netPayout: round2(netPayout),
    brokerKept: round2(brokerKept),
    sell: round2(sell),
    totalMarginPct: round2(totalMarginPct),
  };
}

// ─────────────────────────────────────────────
// MATERIAL
// ─────────────────────────────────────────────

/**
 * Calculate the material sell rate.
 *
 * Tax is applied to the raw cost first, then margin is
 * applied on top of the taxed cost.
 *
 * @param {number} matCost - Raw material cost (before tax)
 * @param {number} taxRatePct - Tax rate percentage (e.g. 6.5). Pass 0 for tax-exempt.
 * @param {number} marginPct - Target gross margin percentage (0–60)
 * @returns {object} { sell, customerPrice, marginDollar, marginPct }
 */
function calcMaterial(matCost, taxRatePct, marginPct) {
  if (!matCost || matCost <= 0) {
    return { sell: 0, customerPrice: 0, marginDollar: 0, marginPct: 0 };
  }

  const marginFraction = marginPct / 100;
  const sell = marginFraction >= 1 ? matCost * 1000 : matCost / (1 - marginFraction);

  // Tax is collected from the customer on top of the sell rate — not added to cost
  const customerPrice = sell * (1 + taxRatePct / 100);

  const marginDollar = sell - matCost;
  const actualMarginPct = sell > 0 ? (marginDollar / sell) * 100 : 0;

  return {
    sell: round2(sell),
    customerPrice: round2(customerPrice),
    marginDollar: round2(marginDollar),
    marginPct: round2(actualMarginPct),
  };
}

// ─────────────────────────────────────────────
// ALL-IN QUOTE
// ─────────────────────────────────────────────

/**
 * Calculate the combined all-in quoted price.
 *
 * Adds material sell and haul sell, then applies rounding.
 * If no material is provided, returns haul-only pricing.
 *
 * @param {object} haulResult - Output of calcHaul()
 * @param {object|null} matResult - Output of calcMaterial(), or null for haul-only
 * @param {object} roundingOptions - { increment: 0.5|1, direction: 'up'|'down' }
 * @returns {object} { rawTotal, allIn, combinedCost, marginDollar, marginPct }
 */
function calcAllIn(haulResult, matResult, roundingOptions) {
  const { increment = 1, direction = 'up' } = roundingOptions || {};

  const haulSell = haulResult ? haulResult.sell : 0;
  const matSell = matResult ? matResult.sell : 0;
  const rawTotal = haulSell + matSell;

  const allIn = applyRounding(rawTotal, increment, direction);

  // True cost basis: net haul payout + taxed material cost
  const haulCost = haulResult ? haulResult.netPayout : 0;
  const matCost = matResult ? matResult.taxedCost : 0;
  const combinedCost = haulCost + matCost;

  const marginDollar = allIn - combinedCost;
  const marginPct = allIn > 0 ? (marginDollar / allIn) * 100 : 0;

  return {
    rawTotal: round2(rawTotal),
    allIn: round2(allIn),
    combinedCost: round2(combinedCost),
    marginDollar: round2(marginDollar),
    marginPct: round2(marginPct),
  };
}

// ─────────────────────────────────────────────
// TARGET PRICE MODE
// ─────────────────────────────────────────────

/**
 * Given a target all-in price the customer should see,
 * calculate the implied overall margin.
 *
 * Used when working backwards from a desired quote price
 * rather than building up from cost + margin.
 *
 * @param {number} targetPrice - Desired all-in customer price
 * @param {object} haulResult - Output of calcHaul()
 * @param {object|null} matResult - Output of calcMaterial(), or null
 * @returns {object} { targetPrice, combinedCost, marginDollar, marginPct, isBelowCost }
 */
function calcTargetPrice(targetPrice, haulResult, matResult) {
  const haulCost = haulResult ? haulResult.netPayout : 0;
  const matCost = matResult ? matResult.taxedCost : 0;
  const combinedCost = haulCost + matCost;

  const marginDollar = targetPrice - combinedCost;
  const marginPct = targetPrice > 0 ? (marginDollar / targetPrice) * 100 : 0;
  const isBelowCost = targetPrice < combinedCost;

  return {
    targetPrice: round2(targetPrice),
    combinedCost: round2(combinedCost),
    marginDollar: round2(marginDollar),
    marginPct: round2(marginPct),
    isBelowCost,
  };
}

// ─────────────────────────────────────────────
// MARGIN TABLE
// ─────────────────────────────────────────────

/**
 * Build a full margin summary table — mirrors the
 * Cost / Sell / Margin $ / Margin % grid in the UI.
 *
 * @param {object} haulResult - Output of calcHaul(), or null
 * @param {object} matResult - Output of calcMaterial(), or null
 * @param {number} allInPrice - Final quoted or target price
 * @returns {object} { haul, material, combined }
 */
function buildMarginTable(haulResult, matResult, allInPrice) {
  const haulNetCost = haulResult ? haulResult.netPayout : 0;
  const haulSell = haulResult ? haulResult.sell : 0;
  const matCost = matResult ? matResult.taxedCost : 0;
  const matSell = matResult ? matResult.sell : 0;
  const combinedCost = haulNetCost + matCost;

  const row = (cost, sell) => ({
    cost: round2(cost),
    sell: round2(sell),
    marginDollar: round2(sell - cost),
    marginPct: round2(sell > 0 ? ((sell - cost) / sell) * 100 : 0),
  });

  return {
    haul: haulResult ? row(haulNetCost, haulSell) : null,
    material: matResult ? row(matCost, matSell) : null,
    combined: row(combinedCost, allInPrice),
  };
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

/**
 * Apply rounding to a price.
 * @param {number} value
 * @param {number} increment - 0.5 or 1
 * @param {string} direction - 'up' or 'down'
 * @returns {number}
 */
function applyRounding(value, increment, direction) {
  if (direction === 'up') return Math.ceil(value / increment) * increment;
  return Math.floor(value / increment) * increment;
}

/** Round to 2 decimal places */
function round2(n) {
  return Math.round(n * 100) / 100;
}

// ─────────────────────────────────────────────
// EXPORTS (Node / ES module environments)
// ─────────────────────────────────────────────

// Uncomment the export style that matches your environment:

// ES Modules (React, Vue, modern bundlers):
// export { calcHaul, calcMaterial, calcAllIn, calcTargetPrice, buildMarginTable, applyRounding };

// CommonJS (Node.js):
// module.exports = { calcHaul, calcMaterial, calcAllIn, calcTargetPrice, buildMarginTable, applyRounding };