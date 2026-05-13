import { state } from './state.js';
import { saveState, restoreState } from './utils.js';
import { SHOP_SITES, KW_LIST, COUNTRIES } from './config.js';
import { initExchangeRate, initFuelSurcharge, fetchRate, fetchFuelSurcharge, fetchSpeedpakRates } from './api.js';
import { calculate } from './calculator.js';

// ===== 初期化処理 =====
function init() {
  initCountrySelector();
  initShopSites();
  rollKw();
  
  restoreState(state);
  
  // セレクトボックスの復元値チェック
  const sel = document.getElementById('destCountry');
  if (sel) {
    const validIds = COUNTRIES.map(c => c.id);
    if (!validIds.includes(sel.value)) sel.value = 'us';
    state.currentCountry = sel.value;
  }

  // モードUI反映
  updateModeUI();

  // APIデータ取得と計算の実行
  initExchangeRate(() => calculateWrapper());
  initFuelSurcharge(() => calculateWrapper());
  fetchSpeedpakRates(() => calculateWrapper());
}

// 状態保存＆計算ラッパー
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

  // 国セレクト変更時
  const destCountryEl = document.getElementById('destCountry');
  if (destCountryEl) {
    destCountryEl.addEventListener('change', (e) => {
      state.currentCountry = e.target.value;
      state.speedpakRates = null; // 国が変わったのでクリア
      calculateWrapper();
      fetchSpeedpakRates(() => calculateWrapper());
    });
  }

  // カテゴリNo変更時は calculator 内で config.js の getCategoryName 等を用いて自動反映されるため再計算のみ発火
  const categoryNoEl = document.getElementById('categoryNo');
  if (categoryNoEl) {
    categoryNoEl.addEventListener('input', () => {
      calculateWrapper();
    });
  }

  // モード切替（US / Other）
  const modeUsBtn = document.getElementById('modeUs');
  const modeOtherBtn = document.getElementById('modeOther');
  if (modeUsBtn) modeUsBtn.addEventListener('click', () => setPricingMode('us'));
  if (modeOtherBtn) modeOtherBtn.addEventListener('click', () => setPricingMode('other'));

  // プラン切替（ストアなし / ストアあり）
  const planNoStoreBtn = document.getElementById('planNoStore');
  const planStoreBtn = document.getElementById('planStore');
  if (planNoStoreBtn) planNoStoreBtn.addEventListener('click', () => setStorePlan('noStore'));
  if (planStoreBtn) planStoreBtn.addEventListener('click', () => setStorePlan('store'));
  
  // 通貨切替（US競合送料用）
  const compCurrUsdBtn = document.getElementById('compCurrUsd');
  const compCurrJpyBtn = document.getElementById('compCurrJpy');
  if (compCurrUsdBtn) compCurrUsdBtn.addEventListener('click', () => setCompShippingCurrency('usd'));
  if (compCurrJpyBtn) compCurrJpyBtn.addEventListener('click', () => setCompShippingCurrency('jpy'));

  // 手動取得ボタン
  const btnFetchRate = document.getElementById('btnFetchRate');
  const btnFetchFuel = document.getElementById('btnFetchFuel');
  if (btnFetchRate) btnFetchRate.addEventListener('click', () => fetchRate(false, calculateWrapper));
  if (btnFetchFuel) btnFetchFuel.addEventListener('click', () => fetchFuelSurcharge(false, calculateWrapper));

  // ガチャ・検索
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

  // 動的生成要素へのイベント委譲（ガチャ単語のコピー）
  const kwResult = document.getElementById('kwResult');
  if (kwResult) {
    kwResult.addEventListener('click', (e) => {
      if (e.target.tagName === 'SPAN') copyOneKw(e.target);
    });
  }
  
  // 詳細設定 トグル
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

  // 手数料内訳 トグル
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

  // 海外手数料 詳細トグル
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
    if (state.currentPricingMode === 'us') {
      usSec.classList.remove('u-hidden');
    } else {
      usSec.classList.add('u-hidden');
    }
  }
  if (otherSec) {
    if (state.currentPricingMode === 'other') {
      otherSec.classList.remove('u-hidden');
    } else {
      otherSec.classList.add('u-hidden');
    }
  }
  
  const planNoStoreBtn = document.getElementById('planNoStore');
  const planStoreBtn = document.getElementById('planStore');
  if (planNoStoreBtn) planNoStoreBtn.classList.toggle('active', state.currentStorePlan === 'noStore');
  if (planStoreBtn) planStoreBtn.classList.toggle('active', state.currentStorePlan === 'store');
}

// デバウンス処理（短時間の連続入力を防ぎAPIを呼び出す）
let _speedpakDebounceTimer = null;
function debouncedFetchSpeedpak() {
  if (_speedpakDebounceTimer) clearTimeout(_speedpakDebounceTimer);
  _speedpakDebounceTimer = setTimeout(() => {
    fetchSpeedpakRates(() => calculateWrapper());
  }, 500);
}

// ===== カントリーセレクタ =====
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

// ===== キーワードガチャ =====
export function rollKw() {
  const countSelect = document.getElementById('kwCount');
  const resultDiv = document.getElementById('kwResult');
  if (!countSelect || !resultDiv) return;
  
  const count = parseInt(countSelect.value) || 2;
  const shuffled = [...KW_LIST].sort(() => Math.random() - 0.5);
  const picked = shuffled.slice(0, count);
  resultDiv.innerHTML = picked.map(w => 
    `<span class="kw-item" title="クリックでコピー">${w}</span>`
  ).join('');
}

export function copyOneKw(span) {
  const text = span.textContent.trim();
  if (!text) return;
  
  // クリップボードへコピー
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  
  // 一時的に表示とスタイルを変更
  const orig = span.textContent;
  span.textContent = '✓ copy';
  span.style.background = 'var(--green-bg)';
  setTimeout(() => { 
    span.textContent = orig; 
    span.style.background = ''; // CSSで設定された元の背景色に戻す
  }, 800);
}

// ===== ショッピングサイト一括検索 =====
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

  // チェックボックス変更時に保存
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