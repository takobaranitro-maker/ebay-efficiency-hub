import { state } from './state.js';
import { getVal } from './utils.js';
import { COUNTRIES } from './config.js';

const RATE_CACHE_KEY = 'exchange_rate_jpy';
const RATE_CACHE_TIME_KEY = 'exchange_rate_time';
const RATE_CACHE_TTL = 6 * 60 * 60 * 1000;

// Vercelから応答があったかを厳密に判定
let isVercelResponding = false; 

export async function fetchRate(silent, onComplete) {
  const statusEl = document.getElementById('rateStatus');
  if (statusEl) statusEl.textContent = '取得中...';
  try {
    const r = await fetch('https://api.exchangerate-api.com/v4/latest/USD', { signal: AbortSignal.timeout(10000) });
    const d = await r.json();
    if (d.rates && d.rates.JPY) {
      const rate = d.rates.JPY.toFixed(4);
      document.getElementById('exchangeRate').value = rate;
      localStorage.setItem(RATE_CACHE_KEY, rate);
      localStorage.setItem(RATE_CACHE_TIME_KEY, Date.now());
      if (statusEl) statusEl.textContent = '✓ ¥' + rate + '/$ (自動取得)';
      if (onComplete) onComplete();
    } else {
      throw new Error('データなし');
    }
  } catch(e) {
    const cached = localStorage.getItem(RATE_CACHE_KEY);
    if (cached) {
      const age = Date.now() - (parseInt(localStorage.getItem(RATE_CACHE_TIME_KEY)) || 0);
      const hours = Math.floor(age / (60*60*1000));
      if (statusEl) statusEl.textContent = '⚠ ¥' + cached + ' (' + hours + '時間前)';
    } else {
      if (statusEl) statusEl.textContent = '⚠ 取得失敗';
    }
  }
}

export function initExchangeRate(onComplete) {
  const cached = localStorage.getItem(RATE_CACHE_KEY);
  const cachedTime = parseInt(localStorage.getItem(RATE_CACHE_TIME_KEY)) || 0;
  const age = Date.now() - cachedTime;
  if (cached && age < RATE_CACHE_TTL) {
    document.getElementById('exchangeRate').value = cached;
    const statusEl = document.getElementById('rateStatus');
    if (statusEl) statusEl.textContent = '✓ ¥' + cached + '/$ (キャッシュ)';
  }
  fetchRate(true, onComplete);
}

const FUEL_TABLE = [
  [1.36, 23.0],[1.41, 23.5],[1.46, 24.0],[1.51, 24.5],[1.56, 25.0],
  [1.61, 25.5],[1.66, 26.0],[1.71, 26.5],[1.76, 27.0],[1.81, 27.5],
  [1.86, 28.0],[1.91, 28.5],[1.96, 29.0],[2.01, 29.5],[2.06, 30.0],
  [2.11, 30.5],[2.16, 31.0],[2.21, 31.5],[2.26, 32.0],[2.31, 32.5],
  [2.36, 33.0],[2.41, 33.5],[2.46, 34.0],[2.51, 34.5],[2.56, 35.0],
  [2.61, 35.5],[2.66, 36.0],[2.71, 36.5],[2.76, 37.0],[2.81, 37.5],
  [2.86, 38.0],[2.91, 38.5],[2.96, 39.0],[3.01, 39.5],[3.06, 40.0],
];
const FUEL_CACHE_KEY = 'fedex_fuel_surcharge';
const FUEL_CACHE_TIME_KEY = 'fedex_fuel_surcharge_time';
const FUEL_CACHE_PRICE_KEY = 'fedex_fuel_price';
const FUEL_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

function _fuelPriceToSurcharge(pricePerGallon) {
  for (let i = FUEL_TABLE.length - 1; i >= 0; i--) {
    if (pricePerGallon >= FUEL_TABLE[i][0]) return FUEL_TABLE[i][1];
  }
  return FUEL_TABLE[0][1];
}

async function _fetchJetFuelPrice() {
  const url = 'https://api.eia.gov/v2/petroleum/pri/spt/data/?api_key=auxzfmzdBJPaamHty8bfxCjiYJ0hQgCtxK2r3vDC&frequency=weekly&data[0]=value&facets[series][]=EER_EPJK_PF4_RGC_DPG&sort[0][column]=period&sort[0][direction]=desc&length=1';
  const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
  const d = await r.json();
  if (d.response && d.response.data && d.response.data.length > 0) {
    return { price: parseFloat(d.response.data[0].value), date: d.response.data[0].period };
  }
  return null;
}

export async function fetchFuelSurcharge(silent, onComplete) {
  const statusEl = document.getElementById('fuelStatus');
  // Vercelからの応答を待機している間は、EIAの表示を抑制する
  if (statusEl && !isVercelResponding) statusEl.textContent = '取得中...';
  
  try {
    const result = await _fetchJetFuelPrice();
    if (result) {
      // Vercelから一度でも正常な応答があれば、EIAの数値は反映させない（Vercel優先を徹底）
      if (isVercelResponding) return;

      const surcharge = _fuelPriceToSurcharge(result.price);
      document.getElementById('fuelSurcharge').value = surcharge;
      localStorage.setItem(FUEL_CACHE_KEY, surcharge);
      localStorage.setItem(FUEL_CACHE_PRICE_KEY, result.price);
      localStorage.setItem(FUEL_CACHE_TIME_KEY, Date.now());
      if (statusEl) statusEl.textContent = '✓ ' + surcharge + '% (燃料$' + result.price.toFixed(3) + '/gal ' + result.date + ')';
      if (onComplete) onComplete();
    }
  } catch(e) {
    if (isVercelResponding) return;
    if (statusEl) statusEl.textContent = '⚠ 取得失敗';
  }
}

export function initFuelSurcharge(onComplete) {
  const cached = localStorage.getItem(FUEL_CACHE_KEY);
  const cachedTime = parseInt(localStorage.getItem(RATE_CACHE_TIME_KEY)) || 0;
  if (cached && (Date.now() - cachedTime < FUEL_CACHE_TTL)) {
    document.getElementById('fuelSurcharge').value = cached;
  }
  fetchFuelSurcharge(true, onComplete);
}

const SPEEDPAK_API_BASE = 'https://speedpak-api.vercel.app';

export async function fetchSpeedpakRates(onComplete) {
  const weightKg = getVal('weight');
  const L = getVal('length');
  const W = getVal('width');
  const H = getVal('height');
  if (weightKg <= 0 || L <= 0 || W <= 0 || H <= 0) return;

  const rawSelling = getVal('sellingPrice');
  const compVal = getVal('compShipping');
  const rate = getVal('exchangeRate');
  const compShipping = state.compShippingCurrency === 'jpy' && rate > 0 ? compVal / rate : compVal;
  
  let declaredUsd = state.currentPricingMode === 'us' 
    ? (rawSelling + compShipping > 0 ? Math.round((rawSelling + compShipping - 0.01) * 100) / 100 : 0)
    : (rawSelling > 0 ? Math.round((rawSelling - 0.01) * 100) / 100 : 0);

  const cc = COUNTRIES.find(c => c.id === state.currentCountry) || COUNTRIES[0];

  state.speedpakLoading = true;
  if (onComplete) onComplete();

  try {
    const res = await fetch(SPEEDPAK_API_BASE + '/api/speedpak/estimate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        weight: weightKg * 1000, length: L, width: W, height: H,
        destCountry: cc.code, destZipCode: cc.defaultZip, declaredValueUsd: declaredUsd || undefined
      })
    });
    const data = await res.json();
    
    if (data.success) {
      // 通信成功フラグを立てる（これによりEIAの上書きを阻止する）
      isVercelResponding = true; 
      state.speedpakRates = data.rates;
      
      if (data.fuelSurchargePercent !== undefined) {
        document.getElementById('fuelSurcharge').value = data.fuelSurchargePercent;
        const statusEl = document.getElementById('fuelStatus');
        if (statusEl) statusEl.textContent = '✓ ' + data.fuelSurchargePercent + '% (SpeedPAK API)';
      }
    }
  } catch(e) {
    console.warn("Vercel API connection failed, using backup calculation.");
    isVercelResponding = false; // 失敗した場合はEIAに任せる
  } finally {
    state.speedpakLoading = false;
    if (onComplete) onComplete();
  }
}

export function spCost(apiKey) {
  return (state.speedpakRates && state.speedpakRates[apiKey]) ? state.speedpakRates[apiKey].totalAmount : null;
}
export function spDuty() {
  if (!state.speedpakRates) return 0;
  for (const key of ['dhl','ip_pak','ip','dhl_envelope']) {
    if (state.speedpakRates[key]?.dutyAmount > 0) return state.speedpakRates[key].dutyAmount;
  }
  return 0;
}
export function spDutyDetails() {
  if (!state.speedpakRates) return [];
  for (const key of ['dhl','ip_pak','ip','dhl_envelope']) {
    if (state.speedpakRates[key]?.dutyAmount > 0 && state.speedpakRates[key].feeDetails) {
      return state.speedpakRates[key].feeDetails.filter(d => d.freight > 0 && d.tariffCategoryType);
    }
  }
  return [];
}
export function spFeeDetails(apiKey) {
  return (state.speedpakRates && state.speedpakRates[apiKey]) ? state.speedpakRates[apiKey].feeDetails : null;
}