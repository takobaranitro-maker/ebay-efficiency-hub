import { state } from './state.js';
import { saveState, restoreState, getVal } from './utils.js';
import { SHOP_SITES, KW_LIST, COUNTRIES } from './config.js'; // ← ここを修正しました
import { initExchangeRate, fetchRate } from './api.js';
import { calculate } from './calculator.js';

let _cpickShowAll = false;

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
    const cData = COUNTRIES.find(c => c.id === sel.value);
    if (cData && document.getElementById('countryBtnLabel')) {
      document.getElementById('countryBtnLabel').textContent = cData.name;
    }
  }

  updateModeUI();
  initExchangeRate(() => calculateWrapper());
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
    // 検索窓での入力を計算発火から除外
    if(el.id === 'countrySearch' || el.id === 'shopQuery') return;
    el.addEventListener('input', () => {
      calculateWrapper();
    });
  });

  const destCountryEl = document.getElementById('destCountry');
  if (destCountryEl) {
    destCountryEl.addEventListener('change', (e) => {
      state.currentCountry = e.target.value;
      calculateWrapper();
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
  
  // API廃止に伴い手動入力を案内
  if (btnFetchFuel) {
    btnFetchFuel.addEventListener('click', () => {
      alert('燃油サーチャージは手動入力になりました。現在の数値を直接入力してください。');
      calculateWrapper();
    });
  }

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

// ===== 宛先セレクタ（検索付き） =====
function cpickNorm(s) {
  return (s || '').toLowerCase()
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '')
    .replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/\s+/g, '');
}

function renderCountryList() {
  const list = document.getElementById('countryList');
  const sel = document.getElementById('destCountry');
  const searchInput = document.getElementById('countrySearch');
  if (!list || !sel || !searchInput) return;
  
  const q = cpickNorm(searchInput.value);
  list.innerHTML = '';
  
  const mkRow = (c) => {
    const row = document.createElement('div');
    row.className = 'cpick-row' + (c.id === sel.value ? ' selected' : '');
    row.dataset.id = c.id;
    row.textContent = c.name;
    row.onclick = () => {
      sel.value = c.id;
      sel.dispatchEvent(new Event('change'));
      document.getElementById('countryBtnLabel').textContent = c.name;
      document.getElementById('countryPanel').hidden = true;
    };
    return row;
  };
  const mkHead = (t) => { const h = document.createElement('div'); h.className = 'cpick-head'; h.textContent = t; return h; };

  if (q) {
    const hits = COUNTRIES.filter(c => cpickNorm(c.name + c.code + c.id).includes(q));
    if (!hits.length) {
      list.innerHTML = '<div class="cpick-empty">該当する国がありません</div>';
    } else {
      hits.forEach(c => list.appendChild(mkRow(c)));
    }
    return;
  }
  
  if (_cpickShowAll) {
    let g = null;
    COUNTRIES.forEach(c => { if (c.group !== g) { list.appendChild(mkHead(c.group)); g = c.group; } list.appendChild(mkRow(c)); });
    return;
  }
  
  list.appendChild(mkHead('主要な宛先'));
  ['us','ca','uk','de','au','cn'].forEach(id => { const c = COUNTRIES.find(x => x.id === id); if (c) list.appendChild(mkRow(c)); });
  const more = document.createElement('button');
  more.type = 'button'; more.className = 'cpick-more';
  more.textContent = 'すべての国を表示（' + COUNTRIES.length + 'ヶ国）';
  more.onclick = (e) => { e.stopPropagation(); _cpickShowAll = true; renderCountryList(); };
  list.appendChild(more);
}

function initCountrySelector() {
  const sel = document.getElementById('destCountry');
  if (!sel) return;
  sel.innerHTML = '';
  COUNTRIES.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    sel.appendChild(opt);
  });
  
  const btn = document.getElementById('countryBtn');
  const panel = document.getElementById('countryPanel');
  const search = document.getElementById('countrySearch');
  
  if(btn && panel && search) {
    btn.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) {
        search.value = '';
        _cpickShowAll = false;
        renderCountryList();
        search.focus();
      }
    });
    
    search.addEventListener('input', renderCountryList);
    
    document.addEventListener('click', (e) => {
      const picker = document.getElementById('countryPicker');
      if (picker && !picker.contains(e.target)) {
        panel.hidden = true;
      }
    });
  }
}

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

// ===== セラーリサーチ用 段階的自動判定ロジック =====
async function autoDeterminePricing() {
  const reasonEl = document.getElementById('adoptedReason');
  const benchEl = document.getElementById('adoptedBenchmark');
  const sellEl = document.getElementById('sellingPrice');
  const compShipEl = document.getElementById('compShipping');
  const countryEl = document.getElementById('destCountry'); 
  
  const btn = document.getElementById('btnAutoDetermine'); 
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
      candidates.push({ id: i, price: p, ship: s, total: p + s });
    }
  }

  const bmPrice = getVal('comp4Price');
  const bmShip = getVal('comp4Ship');
  let benchmark = null;

  if (bmPrice > 0) {
    benchmark = { id: 4, price: bmPrice, ship: bmShip, total: bmPrice + bmShip };
  } else if (candidates.length > 0) {
    benchmark = [...candidates].sort((a, b) => a.total - b.total)[0];
  }

  if (!benchmark) {
    if (benchEl) benchEl.textContent = 'データ未入力';
    await updateMsg('ベンチマーク（または比較先）の価格が入力されていません。', '#dc2626');
    if (btn) btn.disabled = false;
    return;
  }

  if (benchEl) benchEl.textContent = '最適な価格を計算中...';
  await updateMsg('⏳ システムが利益条件を満たす最安値を探索しています...', '#ea580c');
  await new Promise(resolve => setTimeout(resolve, 100));

  let validTargets = candidates.filter(c => c.total <= benchmark.total);
  validTargets.push(benchmark);

  const uniqueTargets = [];
  const seenIds = new Set();
  for (const t of validTargets) {
    if (!seenIds.has(t.id)) {
      seenIds.add(t.id);
      uniqueTargets.push(t);
    }
  }

  uniqueTargets.sort((a, b) => a.total - b.total);

  const checkProfitability = () => {
    const names = document.querySelectorAll('.mr-name');
    for (const nameEl of names) {
      if (nameEl.textContent.trim() === 'International Connect Plus') {
        const row = nameEl.closest('.method-row');
        return row && row.querySelector('.tag-ok') !== null;
      }
    }
    const summaryBar = document.querySelector('.profit-summary');
    return summaryBar && !summaryBar.classList.contains('negative');
  };

  let adoptedTarget = null;
  let adoptedType = ''; 
  let adoptedUsPrice = 0;
  let adoptedOtherPrice = 0;

  setPricingMode('us'); 
  if (countryEl) await updateInput(countryEl, 'us');

  for (const target of uniqueTargets) {
    const targetUsTotal = Math.round((target.total - 0.10) * 100) / 100;
    const targetUsPrice = Math.max(0, Math.round((targetUsTotal - target.ship) * 100) / 100);

    await updateInput(sellEl, targetUsPrice);
    await updateInput(compShipEl, target.ship);

    calculate();

    if (checkProfitability()) {
      adoptedTarget = target;
      adoptedType = 'us';
      adoptedUsPrice = targetUsPrice;
      break; 
    }
  }

  if (!adoptedTarget) {
    setPricingMode('other'); 
    if (countryEl) {
      await updateInput(countryEl, 'de');
      document.getElementById('countryBtnLabel').textContent = '🇩🇪 ドイツ';
    }

    for (const target of uniqueTargets) {
      const targetOtherPrice = Math.max(0, Math.round((target.price - 0.10) * 100) / 100);

      await updateInput(sellEl, targetOtherPrice);
      await updateInput(compShipEl, 0); 

      calculate();

      if (checkProfitability()) {
        adoptedTarget = target;
        adoptedType = 'other';
        adoptedOtherPrice = targetOtherPrice;
        break; 
      }
    }
  }

  if (adoptedTarget) {
    if (adoptedType === 'us') {
      setPricingMode('us');
      if (countryEl) {
        await updateInput(countryEl, 'us');
        document.getElementById('countryBtnLabel').textContent = '🇺🇸 アメリカ';
      }
      await updateInput(sellEl, adoptedUsPrice);
      await updateInput(compShipEl, adoptedTarget.ship);
      calculate();

      benchEl.textContent = `本体 $${adoptedUsPrice.toFixed(2)} + 送料 $${adoptedTarget.ship.toFixed(2)}`;
      await updateMsg('【出品OK】アメリカ向け(US)でベンチマークより安く出品可能です！', '#16a34a');
    } else {
      setPricingMode('other');
      if (countryEl) {
        await updateInput(countryEl, 'de');
        document.getElementById('countryBtnLabel').textContent = '🇩🇪 ドイツ';
      }
      await updateInput(sellEl, adoptedOtherPrice);
      await updateInput(compShipEl, 0);
      calculate();

      benchEl.textContent = `本体 $${adoptedOtherPrice.toFixed(2)} + 送料(自動計算)`;
      await updateMsg('【出品OK】他国向け(Other)ならベンチマークより安く出品可能です！', '#2563eb');
    }
  } else {
    if (benchEl) benchEl.textContent = `利益基準(1000円/10%)未達`;
    await updateMsg('【出品NG】ベンチマークより安く出品すると利益基準を満たせません。', '#dc2626');
  }

  saveState(state);
  if (btn) btn.disabled = false;
}