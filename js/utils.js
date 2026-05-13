import { state } from './state.js';

export function getVal(id) {
  const el = document.getElementById(id);
  if (!el) return 0;
  return parseFloat(el.value.replace(/,/g, '')) || 0;
}

export function fmt(n) {
  return Math.round(n).toLocaleString('ja-JP');
}

export function fmtD(n) {
  return n.toFixed(2);
}

const SAVE_KEY = 'ebayCalcState';
const SAVE_FIELDS = [
  'purchasePrice', 'sellingPrice', 'compShipping', 'weight', 'length', 'width', 'height',
  'categoryNo', 'exchangeRate', 'fuelSurcharge', 'usShippingPct',
  'ebayFeeRate', 'feeThreshold', 'ebayFeeRate2', 'perOrderFee',
  'promotedRate', 'intlFeeRate', 'payoneerRate', 'taxRate'
];

export function saveState(stateObj) {
  const s = {};
  SAVE_FIELDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) s[id] = el.value;
  });
  s._country = stateObj.currentCountry;
  s._pricingMode = stateObj.currentPricingMode;
  s._storePlan = stateObj.currentStorePlan;
  s._compCurrency = stateObj.compShippingCurrency;
  localStorage.setItem(SAVE_KEY, JSON.stringify(s));
}

export function restoreState(stateObj) {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!s) return false;
    SAVE_FIELDS.forEach(id => {
      const el = document.getElementById(id);
      if (el && s[id] !== undefined) el.value = s[id];
    });
    if (s._country) stateObj.currentCountry = s._country;
    if (s._pricingMode) stateObj.currentPricingMode = s._pricingMode;
    if (s._storePlan) stateObj.currentStorePlan = s._storePlan;
    if (s._compCurrency) stateObj.compShippingCurrency = s._compCurrency;
    return true;
  } catch (e) {
    return false;
  }
}