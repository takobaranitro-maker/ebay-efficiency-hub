import { state } from './state.js';
import { saveState, restoreState, getVal } from './utils.js';
import { SHOP_SITES, KW_LIST, COUNTRIES } from './config.js';
import { initExchangeRate, initFuelSurcharge, fetchRate, fetchFuelSurcharge, fetchSpeedpakRates } from './api.js';
import { calculate } from './calculator.js';

// ===== 初期化処理 =====
function init() {
  initCountrySelector();
  initShopSites();
  rollKw();
  
  restoreState(state);
  
  const sel = document.getElementById('destCountry');
  if (sel) {
    const validIds = COUNTRIES.map(c => c.id);
    if (!validIds.includes(sel.value)) sel.value = 'us';
    state.currentCountry = sel.value;
  }

  updateModeUI();

  initExchangeRate(() => calculateWrapper());
  initFuelSurcharge(() => calculateWrapper());
  fetchSpeedpakRates(() => calculateWrapper());
}

// ===== 状態保存＆計算ラッパー =====
function calculateWrapper() {
  calculate();
  saveState(state);
}

// ===== イベントリスナーの登録 =====
document.addEventListener('DOMContentLoaded', () => {
  init();

  // 全Input変更時
  document.querySelectorAll('input').forEach(el => {
    el.addEventListener('input', () => {
      calculateWrapper();
      debouncedFetchSpeedpak();
    });
  });

  const destCountryEl = document.getElementById('destCountry');
  if (destCountryEl) {
    destCountryEl.addEventListener('change', (e) => {
      state.currentCountry = e.target.value;
      state.speedpakRates = null; 
      calculateWrapper();
      fetchSpeedpakRates(() => calculateWrapper());
    });
  }

  const categoryNoEl = document.getElementById('categoryNo');
  if (categoryNoEl) {
    categoryNoEl.addEventListener('input', () => {
      calculateWrapper();
    });
  }

  const modeUsBtn = document.getElementById('modeUs');
  const modeOtherBtn = document.getElementById('modeOther');
  if (modeUsBtn) modeUsBtn.addEventListener('click', () => setPricingMode('us'));
  if (modeOtherBtn) modeOtherBtn.addEventListener('click', () => setPricingMode('other'));

  const planNoStoreBtn = document.getElementById('planNoStore');
  const planStoreBtn = document.getElementById('planStore');
  if (planNoStoreBtn) planNoStoreBtn.addEventListener('click', () => setStorePlan('noStore'));
  if (planStoreBtn) planStoreBtn.addEventListener('click', () => setStorePlan('store'));
  
  const compCurrUsdBtn = document.getElementById('compCurrUsd');
  const compCurrJpyBtn = document.getElementById('compCurrJpy');
  if (compCurrUsdBtn) compCurrUsdBtn.addEventListener('click', () => setCompShippingCurrency('usd'));
  if (compCurrJpyBtn) compCurrJpyBtn.addEventListener('click', () => setCompShippingCurrency('jpy'));

  const btnFetchRate = document.getElementById('btnFetchRate');
  const btnFetchFuel = document.getElementById('btnFetchFuel');
  if (btnFetchRate) btnFetchRate.addEventListener('click', () => fetchRate(false, calculateWrapper));
  if (btnFetchFuel) btnFetchFuel.addEventListener('click', () => fetchFuelSurcharge(false, calculateWrapper));

  const btnRollKw = document.getElementById('btnRollKw');
  const btnShopSearch = document.getElementById('btnShopSearch');
  const shopQuery = document.getElementById('shopQuery');
  const btnShopAll = document.getElementById('btnShopAll');
  const btnShopClear = document.getElementById('btnShopClear');
  if (btnRollKw) btnRollKw.addEventListener('click', rollKw);
  if (btnShopSearch) btnShopSearch.addEventListener('click', shopSearch);
  if (shopQuery) shopQuery.addEventListener('keydown', (e) => { if (e.key === 'Enter') shopSearch(); });
  if (btnShopAll) btnShopAll.addEventListener('click', () => toggleShopAll(true));
  if (btnShopClear) btnShopClear.addEventListener('click', () => toggleShopAll(false));

  const btnAutoDetermine = document.getElementById('btnAutoDetermine');
  if (btnAutoDetermine) {
    btnAutoDetermine.addEventListener('click', () => {
      autoDeterminePricing();
    });
  }

  const kwResult = document.getElementById('kwResult');
  if (kwResult) {
    kwResult.addEventListener('click', (e) => {
      if (e.target.tagName === 'SPAN') copyOneKw(e.target);
    });
  }
  
  const settingsToggle = document.getElementById('settingsToggle');
  if (settingsToggle) {
    settingsToggle.addEventListener('click', function() {
      const c = document.getElementById('settingsContent');
      if (!c) return;
      const isShow = c.classList.contains('show');
      if (isShow) {
        c.classList.remove('show');
        this.textContent = '詳細設定 ▼';
        this.classList.remove('active');
      } else {
        c.classList.add('show');
        this.textContent = '詳細設定 ▲';
        this.classList.add('active');
      }
    });
  }

  const feeToggle = document.getElementById('feeToggle');
  if (feeToggle) {
    feeToggle.addEventListener('click', function() {
      const c = document.getElementById('feeDetailContent');
      if (!c) return;
      const isShow = c.classList.contains('show');
      if (isShow) {
        c.classList.remove('show');
        this.textContent = '手数料内訳 ▼';
        this.classList.remove('active');
      } else {
        c.classList.add('show');
        this.textContent = '手数料内訳 ▲';
        this.classList.add('active');
      }
    });
  }

  const toggleIntlFee = document.getElementById('toggleIntlFee');
  if (toggleIntlFee) {
    toggleIntlFee.addEventListener('click', () => {
      const detail = document.getElementById('intlFeeDetail');
      if (!detail) return;
      if (detail.style.display === 'none' || detail.style.display === '') {
        detail.style.display = 'block';
      } else {
        detail.style.display = 'none';
      }
    });
  }
});

// ===== UI・状態変更機能群 =====
function setPricingMode(mode) {
  state.currentPricingMode = mode;
  updateModeUI();
  calculateWrapper();
}

function setStorePlan(plan) {
  state.currentStorePlan = plan;
  updateModeUI();
  calculateWrapper();
}

function setCompShippingCurrency(curr) {
  state.compShippingCurrency = curr;
  const compCurrUsdBtn = document.getElementById('compCurrUsd');
  const compCurrJpyBtn = document.getElementById('compCurrJpy');
  if (compCurrUsdBtn) compCurrUsdBtn.classList.toggle('active', curr === 'usd');
  if (compCurrJpyBtn) compCurrJpyBtn.classList.toggle('active', curr === 'jpy');
  calculateWrapper();
}

function updateModeUI() {
  const modeUsBtn = document.getElementById('modeUs');
  const modeOtherBtn = document.getElementById('modeOther');
  if (modeUsBtn) modeUsBtn.classList.toggle('active', state.currentPricingMode === 'us');
  if (modeOtherBtn) modeOtherBtn.classList.toggle('active', state.currentPricingMode === 'other');
  
  const usSec = document.getElementById('usSection');
  const otherSec = document.getElementById('otherSection');
  if (usSec) {
    if (state.currentPricingMode === 'us') usSec.classList.remove('u-hidden');
    else usSec.classList.add('u-hidden');
  }
  if (otherSec) {
    if (state.currentPricingMode === 'other') otherSec.classList.remove('u-hidden');
    else otherSec.classList.add('u-hidden');
  }
  
  const planNoStoreBtn = document.getElementById('planNoStore');
  const planStoreBtn = document.getElementById('planStore');
  if (planNoStoreBtn) planNoStoreBtn.classList.toggle('active', state.currentStorePlan === 'noStore');
  if (planStoreBtn) planStoreBtn.classList.toggle('active', state.currentStorePlan === 'store');
}

let _speedpakDebounceTimer = null;
function debouncedFetchSpeedpak() {
  if (_speedpakDebounceTimer) clearTimeout(_speedpakDebounceTimer);
  _speedpakDebounceTimer = setTimeout(() => {
    fetchSpeedpakRates(() => calculateWrapper());
  }, 500);
}

function initCountrySelector() {
  const sel = document.getElementById('destCountry');
  if (!sel) return;
  COUNTRIES.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    sel.appendChild(opt);
  });
  sel.value = 'us';
}

export function rollKw() {
  const countSelect = document.getElementById('kwCount');
  const resultDiv = document.getElementById('kwResult');
  if (!countSelect || !resultDiv) return;
  
  const count = parseInt(countSelect.value) || 2;
  const shuffled = [...KW_LIST].sort(() => Math.random() - 0.5);
  const picked = shuffled.slice(0, count);
  resultDiv.innerHTML = picked.map(w => `<span class="kw-item" title="クリックでコピー">${w}</span>`).join('');
}

export function copyOneKw(span) {
  const text = span.textContent.trim();
  if (!text) return;
  
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  
  const orig = span.textContent;
  span.textContent = '✓ copy';
  span.style.background = 'var(--green-bg)';
  setTimeout(() => { 
    span.textContent = orig; 
    span.style.background = ''; 
  }, 800);
}

function initShopSites() {
  const container = document.getElementById('shopSites');
  if (!container) return;
  
  const saved = JSON.parse(localStorage.getItem('shop_sites_checked') || 'null');
  SHOP_SITES.forEach(s => {
    const checked = saved ? (saved[s.id] !== undefined ? saved[s.id] : s.checked) : s.checked;
    const lbl = document.createElement('label');
    lbl.innerHTML = `<input type="checkbox" data-shop="${s.id}" ${checked ? 'checked' : ''}> ${s.name}`;
    container.appendChild(lbl);
  });

  container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', saveShopChecks);
  });
}

function saveShopChecks() {
  const obj = {};
  document.querySelectorAll('#shopSites input[type="checkbox"]').forEach(cb => {
    obj[cb.dataset.shop] = cb.checked;
  });
  localStorage.setItem('shop_sites_checked', JSON.stringify(obj));
}

function toggleShopAll(on) {
  document.querySelectorAll('#shopSites input[type="checkbox"]').forEach(cb => { 
    cb.checked = on; 
  });
  saveShopChecks();
}

function shopSearch() {
  const qInput = document.getElementById('shopQuery');
  if (!qInput) return;
  const q = qInput.value.trim();
  if (!q) { alert('キーワードを入力してください'); return; }
  
  const encoded = encodeURIComponent(q);
  let opened = 0;
  document.querySelectorAll('#shopSites input[type="checkbox"]:checked').forEach(cb => {
    const site = SHOP_SITES.find(s => s.id === cb.dataset.shop);
    if (site) { 
      window.open(site.url.replace('{q}', encoded), '_blank'); 
      opened++; 
    }
  });
  if (opened === 0) alert('検索するサイトを選択してください');
}

// ===== 最安値・市場（US/Other）自動判定ロジック =====
async function autoDeterminePricing() {
  const reasonEl = document.getElementById('adoptedReason');
  const benchEl = document.getElementById('adoptedBenchmark');
  const sellEl = document.getElementById('sellingPrice');
  const compShipEl = document.getElementById('compShipping');
  const countryEl = document.getElementById('destCountry'); 
  
  // ★修正：HTMLの正しいID（btnAutoDetermine）に合わせました
  const btn = document.getElementById('btnAutoDetermine'); 
  
  // 処理開始時にボタンを無効化（ここで先ほど追加したグレーのCSSが適用されます）
  if (btn) btn.disabled = true; 

  const updateMsg = async (text, color = '#4b5563') => {
    if (reasonEl) reasonEl.innerHTML = `<span style="color:${color};">${text}</span>`;
    await new Promise(resolve => setTimeout(resolve, 50));
  };

  const updateInput = async (el, val) => {
    if (!el) return;
    el.value = val;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true })); 
    await new Promise(resolve => setTimeout(resolve, 50)); 
  };

  const candidates = [];
  for (let i = 1; i <= 3; i++) {
    const p = getVal('comp' + i + 'Price');
    const s = getVal('comp' + i + 'Ship');
    if (p > 0) {
      candidates.push({ id: i, price: p, ship: s, total: p + s, ratio: s / p });
    }
  }

  if (candidates.length === 0) {
    if (benchEl) benchEl.textContent = 'データ未入力';
    await updateMsg('候補データが入力されていません。', '#dc2626');
    if (btn) btn.disabled = false; // エラー終了時もボタンを復活
    return;
  }

  if (benchEl) benchEl.textContent = '最適な価格を計算中...';
  await updateMsg('⏳ システムが利益と最安値を検証しています...', '#ea580c');
  await new Promise(resolve => setTimeout(resolve, 100));

  let validCandidates = candidates.filter(c => c.ratio <= 0.35);
  if (validCandidates.length === 0) {
    validCandidates = candidates;
  }

  const bestUs = [...validCandidates].sort((a, b) => a.total - b.total)[0];
  const bestOther = [...validCandidates].sort((a, b) => a.price - b.price)[0];

  // STEP 1: 他国向け(DDU)の利益チェック【ヨーロッパ基準】
  setPricingMode('other'); 
  if (countryEl) await updateInput(countryEl, 'eu');
  await updateInput(sellEl, bestOther.price);
  
  await fetchSpeedpakRates();
  calculate();

  const summaryBar = document.querySelector('.profit-summary');
  const isOtherProfitable = summaryBar && !summaryBar.classList.contains('negative');

  if (!isOtherProfitable) {
    if (benchEl) benchEl.textContent = `本体 $${bestOther.price.toFixed(2)} + 送料 $${bestOther.ship.toFixed(2)} (候補${bestOther.id})`;
    await updateMsg('【出品NG】他国(ヨーロッパ基準)で売れた場合に利益基準を満たせません。', '#dc2626');
    saveState(state);
    if (btn) btn.disabled = false; // 処理終了でボタンを復活
    return; 
  }

  // STEP 2: アメリカ向け(DDP)の利益チェック
  setPricingMode('us'); 
  if (countryEl) await updateInput(countryEl, 'us');
  await updateInput(sellEl, bestUs.price);
  await updateInput(compShipEl, bestUs.ship);

  await fetchSpeedpakRates();
  calculate();

  const isUsProfitable = summaryBar && !summaryBar.classList.contains('negative');

  // STEP 3: 最終判定の画面表示
  if (isUsProfitable) {
    if (benchEl) benchEl.textContent = `本体 $${bestUs.price.toFixed(2)} + 送料 $${bestUs.ship.toFixed(2)} (候補${bestUs.id}を採用)`;
    await updateMsg('【採用】アメリカ向け(DDP)で設定（他国に売れても利益確保OK）', '#16a34a');
    
    // アメリカ向け判定になった場合も、最終的な配送先表示は「ヨーロッパ」にしておく
    if (countryEl) {
      await updateInput(countryEl, 'eu');
      await fetchSpeedpakRates();
      calculate();
    }
  } else {
    setPricingMode('other');
    if (countryEl) await updateInput(countryEl, 'eu');
    
    await updateInput(compShipEl, bestOther.ship);
    await updateInput(sellEl, bestOther.price); 

    await fetchSpeedpakRates();
    calculate();

    if (benchEl) benchEl.textContent = `本体 $${bestOther.price.toFixed(2)} + 送料 $${bestOther.ship.toFixed(2)} (候補${bestOther.id}を採用)`;
    await updateMsg('【採用】他国向け(DDU)で設定（アメリカ最安値は不可ですが、他国で利益OK）', '#2563eb');
  }
  
  saveState(state);
  
  // 処理終了でボタンを復活（色が元に戻る）
  if (btn) btn.disabled = false;
}