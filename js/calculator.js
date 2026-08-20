import { state } from './state.js';
import { getVal, fmt, fmtD } from './utils.js';
import { COUNTRIES, FEE_RATES, getGroupForCategory, getCategoryName, CATEGORY_TO_FEE_GROUP, ACTUAL_RATES } from './config.js';
import * as Rates from './shipping-rates.js';
import { spCost, spDuty, spDutyDetails, spFeeDetails } from './api.js';

export function getCompShippingUsd() {
  const val = getVal('compShipping');
  if (state.compShippingCurrency === 'jpy') {
    const rate = getVal('exchangeRate');
    return rate > 0 ? val / rate : 0;
  }
  return val;
}

export function getEffectiveSellingPrice() {
  const selling = getVal('sellingPrice');
  if (state.currentPricingMode === 'us') {
    const compShipping = getCompShippingUsd();
    const compTotal = selling + compShipping;
    if (compTotal <= 0) return 0;
    const total = Math.round((compTotal - 0.01) * 100) / 100;
    if (state.currentCountry !== 'us' && total <= 2499.99) {
      return Math.round((total / 1.15) * 100) / 100;
    }
    return total;
  } else {
    if (selling <= 0) return 0;
    const base = Math.round((selling - 0.01) * 100) / 100;
    if (state.currentCountry === 'us') {
      const usShippingPct = getVal('usShippingPct') / 100;
      const usShipping = Math.round(selling * usShippingPct * 100) / 100;
      return Math.round((base + usShipping) * 100) / 100;
    }
    return base;
  }
}

function updatePricingDisplay() {
  const selling = getVal('sellingPrice');
  if (state.currentPricingMode === 'us') {
    const compShipping = getCompShippingUsd();
    const compTotal = selling + compShipping;
    const total = compTotal > 0 ? Math.round((compTotal - 0.01) * 100) / 100 : 0;
    if (total > 0) {
      if (total > 2499.99) {
        document.getElementById('listPrice').textContent = '$' + fmtD(total);
        document.getElementById('listShipping').textContent = '$0.00';
      } else {
        const itemPrice = Math.round((total / 1.15) * 100) / 100;
        const usShipping = Math.round((total - itemPrice) * 100) / 100;
        document.getElementById('listPrice').textContent = '$' + fmtD(itemPrice);
        document.getElementById('listShipping').textContent = '$' + fmtD(usShipping);
      }
    } else {
      document.getElementById('listPrice').textContent = '-';
      document.getElementById('listShipping').textContent = '-';
    }
  } else {
    const usShippingPct = getVal('usShippingPct') / 100;
    const usShippingRef = selling > 0 ? Math.round(selling * usShippingPct * 100) / 100 : 0;
    document.getElementById('usShippingRef').textContent = usShippingRef > 0 ? '$' + fmtD(usShippingRef) : '-';
  }
}

function getActualBaseRateForCategory() {
  if (!ACTUAL_RATES || !ACTUAL_RATES.rates) return null;
  const catId = parseInt(document.getElementById('categoryNo').value);
  if (!catId) return null;
  const leaf = getCategoryName(catId);
  if (!leaf) return null;
  const grp = getGroupForCategory(catId);

  const plan = FEE_RATES[state.currentStorePlan];
  if (!plan[grp]) return null;

  const isStore = (state.currentStorePlan === 'store');
  let pW = 0, pC = 0;
  let aW = 0, aC = 0;
  
  for (const path in ACTUAL_RATES.rates) {
    const segs = path.split('|');
    if (segs[segs.length - 1].trim() !== leaf) continue;
    if (CATEGORY_TO_FEE_GROUP && CATEGORY_TO_FEE_GROUP[segs[0].trim()] !== grp) continue;

    const rd = ACTUAL_RATES.rates[path];
    if (!rd) continue;
    if (rd.count) { aW += rd.avgRate * rd.count; aC += rd.count; }
    const pRate = isStore ? rd.avgRateStore : rd.avgRateNoStore;
    const pCnt  = isStore ? rd.countStore   : rd.countNoStore;
    if (pRate != null && pCnt) { pW += pRate * pCnt; pC += pCnt; }
  }
  
  let billed;
  if (pC >= 3) billed = pW / pC;
  else if (aC >= 3) billed = aW / aC;
  else return null;

  const _tr = getVal('taxRate');
  const taxMul = 1 + ((_tr > 0 ? _tr : 10) / 100);
  return Math.round(billed / taxMul * 100) / 100;
}

function updateFeeDescription() {
  const no = parseInt(document.getElementById('categoryNo').value) || 0;
  const catName = getCategoryName(no);
  if (catName) {
    document.getElementById('categoryName').textContent = catName;
    state.currentFeeGroup = getGroupForCategory(no);
  } else {
    document.getElementById('categoryName').textContent = no ? '不明なカテゴリ' : '-';
    state.currentFeeGroup = 'default';
  }

  const plan = FEE_RATES[state.currentStorePlan];
  const effectiveGroup = plan[state.currentFeeGroup] ? state.currentFeeGroup : 'default';
  const g = plan[effectiveGroup];

  if (g.special === 'shoes') {
    document.getElementById('ebayFeeRate').value = g.rate_low;
    document.getElementById('feeThreshold').value = g.threshold;
    document.getElementById('ebayFeeRate2').value = g.rate_high;
  } else if (g.tiers) {
    document.getElementById('ebayFeeRate').value = g.tiers[0][0];
    document.getElementById('feeThreshold').value = g.tiers[0][1];
    document.getElementById('ebayFeeRate2').value = g.tiers.length > 1 ? g.tiers[1][0] : 0;
  } else {
    const actualBase = getActualBaseRateForCategory();
    document.getElementById('ebayFeeRate').value = (actualBase != null ? actualBase : g.rate1);
    document.getElementById('feeThreshold').value = g.th;
    document.getElementById('ebayFeeRate2').value = g.rate2;
  }

  const descEl = document.getElementById('feeDescription');
  const selling = getEffectiveSellingPrice();

  if (!selling || selling <= 0) {
    descEl.textContent = 'FVF: 売値を入力してください';
    return;
  }

  let fvf = 0;
  const appliedRates = [];
  const _tr = getVal('taxRate');
  const taxMul = 1 + ((_tr > 0 ? _tr : 10) / 100);

  const r1 = getVal('ebayFeeRate');
  const r2 = getVal('ebayFeeRate2');
  const th = getVal('feeThreshold');

  if (g.special === 'shoes') {
    if (selling >= th) {
      fvf = selling * (r2 / 100);
      appliedRates.push(r2 + '%');
    } else {
      fvf = selling * (r1 / 100);
      appliedRates.push(r1 + '%');
    }
  } else if (g.tiers) {
     fvf = selling * (r1 / 100);
     appliedRates.push(r1 + '%');
  } else {
    if (selling <= th) {
      fvf = selling * (r1 / 100);
      appliedRates.push(r1 + '%');
    } else {
      fvf = th * (r1 / 100) + (selling - th) * (r2 / 100);
      appliedRates.push(r1 + '%', r2 + '%');
    }
  }
  
  const billedFvf = fvf * taxMul;
  const billedPct = selling > 0 ? (billedFvf / selling * 100) : 0;
  descEl.textContent = 'FVF(税込): ' + billedPct.toFixed(2) + '% ($' + billedFvf.toFixed(2) + ')';
}

function calcFVFBase(amount, grp, ebayRate1, threshold, ebayRate2, perOrder) {
  let fvfBase = 0;
  let effectivePerOrder = perOrder;
  if (amount <= 10) effectivePerOrder = 0.30;

  if (grp.special === 'shoes') {
    if (amount >= grp.threshold) {
      fvfBase = amount * (grp.rate_high / 100);
      effectivePerOrder = 0;
    } else {
      fvfBase = amount * (grp.rate_low / 100);
    }
  } else if (grp.tiers) {
    let remaining = amount;
    let prevLimit = 0;
    for (const [rate, limit] of grp.tiers) {
      const bandLimit = limit === Infinity ? remaining : Math.min(remaining, limit - prevLimit);
      if (bandLimit <= 0) break;
      fvfBase += bandLimit * (rate / 100);
      remaining -= bandLimit;
      prevLimit = limit;
      if (remaining <= 0) break;
    }
  } else {
    if (amount <= threshold) {
      fvfBase = amount * ebayRate1;
    } else {
      fvfBase = threshold * ebayRate1 + (amount - threshold) * ebayRate2;
    }
  }
  return { fvfBase, effectivePerOrder };
}

function getUsDuty(cc, selling, rate, isDdpEnabled) {
  if (cc.code !== 'US' || !isDdpEnabled) return { amount: 0, isEstimate: false, loading: false };
  if (state.speedpakLoading || (!state.speedpakRates && selling > 0)) {
    return { amount: 0, isEstimate: false, loading: true };
  }
  // 【修正】APIの関税額(spDuty)を完全に無視し、米国向けは強制的に30%を適用する
  if (selling > 0 && rate > 0) {
    return { amount: Math.round(selling * 0.30 * rate), isEstimate: true, loading: false };
  }
  return { amount: 0, isEstimate: false, loading: false };
}

function buildDutyFeeDetails(shippingLabel, shippingCost, dutyInfo, zonosFeeJpy = 0) {
  const details = [{charges: shippingLabel, chargesEn: 'Shipping Rate', freight: shippingCost}];
  if (dutyInfo.amount > 0) {
    // 【修正】米国DDP（isEstimate: true）の場合は強制的に30%概算ラベルにする
    if (dutyInfo.isEstimate) {
      details.push({charges: '推定関税（税率30%概算）', chargesEn: 'Estimated Duty&Tax', freight: dutyInfo.amount});
    } else {
      const apiDetails = spDutyDetails();
      if (apiDetails.length > 0) {
        apiDetails.forEach(d => details.push(d));
      } else {
        details.push({charges: '推定関税及び税金料金', chargesEn: 'Estimated Duty&Tax', freight: dutyInfo.amount});
      }
    }
  }
  if (zonosFeeJpy > 0) {
    details.push({charges: 'Zonos手数料 ($2 + 関税10%)', chargesEn: 'Zonos Handling Fee', freight: zonosFeeJpy});
  }
  return details;
}

export function calculate() {
  updatePricingDisplay();
  updateFeeDescription();
  
  const isDDP = (state.currentCountry === 'us');

  const purchase = getVal('purchasePrice');
  const selling = getEffectiveSellingPrice();
  const weightKg = getVal('weight');
  const L = getVal('length');
  const W = getVal('width');
  const H = getVal('height');

  const ebayRate1 = getVal('ebayFeeRate') / 100;
  const threshold = getVal('feeThreshold');
  const ebayRate2 = getVal('ebayFeeRate2') / 100;
  const perOrder = getVal('perOrderFee');
  const promotedRate = getVal('promotedRate') / 100;
  const intlRate = getVal('intlFeeRate') / 100;
  const payoneerRate = getVal('payoneerRate') / 100;
  const rate = getVal('exchangeRate');
  const taxRate = getVal('taxRate') / 100;
  const taxMultiplier = 1 + taxRate;
  const fuelSurchargeRate = getVal('fuelSurcharge') / 100;

  const vol = L * W * H;
  const volWeight = vol / 5000;
  const volWeightEco = vol / 8000;

  document.getElementById('volWeight').textContent = volWeight.toFixed(3) + ' kg';
  document.getElementById('volWeightEco').textContent = volWeightEco.toFixed(3) + ' kg';

  const plan = FEE_RATES[state.currentStorePlan];
  const effectiveGroup = plan[state.currentFeeGroup] ? state.currentFeeGroup : 'default';
  const grp = plan[effectiveGroup];

  const fvfResult = calcFVFBase(selling, grp, ebayRate1, threshold, ebayRate2, perOrder);
  const fvfBase = fvfResult.fvfBase;
  const effectivePerOrder = fvfResult.effectivePerOrder;
  const ebayFvf = (fvfBase + effectivePerOrder) * taxMultiplier;
  const promotedFee = selling * promotedRate * taxMultiplier;
  const intlFee = selling * intlRate * taxMultiplier;
  const totalEbayDeductions = ebayFvf + promotedFee + intlFee;
  const netPayout = selling - totalEbayDeductions;
  const payoneerFee = netPayout * payoneerRate;
  const netReceived = netPayout * (1 - payoneerRate) * rate;
  const revenueYen = selling * rate;
  const totalFeesYen = revenueYen - netReceived;

  const purchaseTax = purchase * taxRate / taxMultiplier;
  const ebayFeeTaxPortion = totalEbayDeductions / taxMultiplier * taxRate * rate;
  const totalRefund = purchaseTax + ebayFeeTaxPortion;

  document.getElementById('revenueYen').textContent = '¥' + fmt(revenueYen) + '（$' + fmtD(selling) + '）';
  document.getElementById('totalFeesYen').textContent = '¥' + fmt(totalFeesYen);
  document.getElementById('feeEbay').textContent = '$' + fmtD(ebayFvf);
  document.getElementById('feeEbayDetail').textContent = '($' + fmtD(fvfBase) + ' + $' + fmtD(effectivePerOrder) + '/注文) 税込';
  document.getElementById('feePromoted').textContent = '$' + fmtD(promotedFee);
  document.getElementById('feeIntl').textContent = '$' + fmtD(intlFee);
  document.getElementById('feePayoneer').textContent = '$' + fmtD(payoneerFee) + '（¥' + fmt(payoneerFee * rate) + '）';
  document.getElementById('feeTotalUsd').textContent = '$' + fmtD(totalEbayDeductions + payoneerFee) + '（¥' + fmt(totalFeesYen) + '）';

  // --- Shipping Methods ---
  const weightG = weightKg * 1000;
  const fedexDims = [Math.ceil(L), Math.ceil(W), Math.ceil(H)].sort((a,b) => b-a);
  const fxLength = fedexDims[0];
  const fxGirth = 2 * (fedexDims[1] + fedexDims[2]);
  const fxLpG = fxLength + fxGirth;
  const billableStandard = Math.max(weightKg, volWeight);
  const billableStandardG = billableStandard * 1000;
  const billableEcoKg = Math.max(weightKg, volWeightEco);

  const cc = COUNTRIES.find(c => c.id === state.currentCountry) || COUNTRIES[0];
  const ficpTable = Rates.getFicpTable(cc.fedexZone);
  const dhlTable = Rates.getDhlTable(cc.dhlZone);

  const groups = [
    { id: 'fedex',    label: 'FedEx FICP（CPaSS）', tag: '推奨', primary: true,  methods: [], note: '基本的にはこの配送方法でOK' },
    { id: 'fedex-ip', label: 'FedEx IP（CPaSS）',   tag: '速達', primary: false, methods: [], collapsed: true, note: '早い配送方法、少し高い' },
    { id: 'speedpak', label: 'Economy（CPaSS）',     tag: cc.economy?'4ヶ国限定':'非対応', primary: false, methods: [], note: cc.economy?'配送が遅いので使用する場合はEconomy用のShipping Policyを作成してください':'この国はEconomy非対応です' },
    { id: 'jppost',   label: '日本郵便', tag: cc.jpOk!==false?'補助':'非対応', primary: false, methods: [], note: cc.jpOk!==false?'CPaSS非対応・自分で発送手続きが必要 (EMSはZonos対応)':(cc.jpZone?'この国は日本郵便の差出が制限されています（△）':'料金テーブル未設定') },
    { id: 'dhl',      label: 'DHL（CPaSS）',        tag: '推奨', primary: true,  methods: [], note: '安ければ使用OK、基本的にはFedExが安い' },
    { id: 'elogi-ficp', label: 'eLogi FedEx FICP', tag: '比較用', primary: false, methods: [], collapsed: true, note: 'CPaSSと比較用 ※関税は後日請求のため含まれていません' },
    { id: 'elogi-ip',   label: 'eLogi FedEx IP',   tag: '比較用', primary: false, methods: [], collapsed: true, note: 'CPaSSと比較用 ※関税は後日請求のため含まれていません' },
    ...(Rates.getElogiUpsData(cc.upsZone) ? [{ id: 'elogi-ups', label: 'eLogi UPS Express Saver', tag: '比較用', primary: false, methods: [], collapsed: true, note: 'アジア・オーストラリア向けが安い' }] : []),
  ];

  function addMethod(groupId, m) {
    m._groupId = groupId;
    const g = groups.find(g => g.id === groupId);
    if (g) g.methods.push(m);
  }

  const _loading = state.speedpakLoading;
  const _apiSrc = state.speedpakRates ? 'API' : '';
  const _subSuffix = _apiSrc ? '' : (_loading ? '（取得中...）' : '（API未接続）');
  const _dutyType = isDDP ? 'DDP' : 'DDU';

  // 関税情報の取得（ここで強制30%が取得される）
  const usDutyInfo = getUsDuty(cc, selling, rate, isDDP);
  const usDutyAmount = usDutyInfo.amount;

  // --- Zonos手数料計算（アメリカ宛のみ自動加算） ---
  let zonosFeeJpy = 0;
  if (isDDP && cc.code === 'US' && usDutyAmount > 0) {
      const dutyUsd = usDutyAmount / rate;
      const zonosUsd = 2 + (dutyUsd * 0.10);
      zonosFeeJpy = Math.round(zonosUsd * rate);
  }

  // --- 【重要】APIの関税額を強制削除し、30%を注入するヘルパー関数 ---
  function getAdjustedApiMethod(methodKey, cs) {
    if (!cs) return { c: null, details: null };
    let c = spCost(methodKey);
    if (c === null || c <= 0) return { c, details: null };
    
    let details = spFeeDetails(methodKey);
    const apiDutyVal = spDuty();
    
    if (!isDDP) {
        if (apiDutyVal > 0) c -= apiDutyVal;
        if (details) {
            const dutyNames = spDutyDetails().map(d => d.charges);
            details = details.filter(d => !dutyNames.includes(d.charges));
        }
    } else if (isDDP && cc.code === 'US' && selling > 0) {
        // APIから取得した関税額（10,923円など）を総額からマイナスする
        if (apiDutyVal > 0) {
            c -= apiDutyVal;
        }
        // 絶対ルールの30%関税を注入
        const customDuty = Math.round(selling * 0.30 * rate);
        c += customDuty;
        
        if (details) {
            // APIの関税明細（推定関税及び税金料金、推定関税処理手数料など）を削除
            const dutyNames = spDutyDetails().map(d => d.charges);
            details = details.filter(d => !dutyNames.includes(d.charges));
            // 代わりに30%概算の明細を追加
            details.push({charges: '推定関税（税率30%概算）', chargesEn: 'Estimated Duty&Tax', freight: customDuty});
        }
    }
    return { c, details };
  }

  // --- SpeedPAK FedEx FICP ---
  {
    const cs = billableStandardG <= 68000;
    // APIの値を強制上書き
    let { c, details } = getAdjustedApiMethod('ficp', cs);
    let subNote = _subSuffix;
    
    // APIがダウンしている時のフォールバック計算
    if (cs && (c === null || c === 0)) {
      const baseRate = Rates.lookupRate(ficpTable, billableStandardG);
      if (baseRate > 0) {
        const fuel = Math.round(baseRate * fuelSurchargeRate);
        let duty = 0;
        let dutyEstimate = false;
        if (isDDP) {
           if (cc.code === 'US' && selling > 0 && rate > 0) {
              duty = Math.round(selling * 0.30 * rate);
              dutyEstimate = true;
           } else {
              duty = spDuty();
           }
        }
        c = baseRate + fuel + duty;
        details = [
          {charges:'運送料金', chargesEn:'Shipping Rate', freight:baseRate},
          {charges:'燃料割増金', chargesEn:'Fuel Surcharge', freight:fuel},
        ];
        if (duty > 0) {
          if (dutyEstimate) {
            details.push({charges: '推定関税（税率30%概算）', chargesEn:'Estimated Duty&Tax', freight:duty});
          } else {
            const dutyItems = spDutyDetails();
            if (dutyItems.length > 0) dutyItems.forEach(d => details.push(d));
            else details.push({charges: '推定関税及び税金料金', chargesEn:'Estimated Duty&Tax', freight:duty});
          }
        }
        subNote = isDDP ? (dutyEstimate ? '（概算/30%関税想定）' : '（関税あり）') : '（関税なし）';
      }
    }
    const canSend = cs && c !== null && c > 0;
    addMethod('fedex',{name:'International Connect Plus',sub:'2-5日/'+_dutyType+'/最大68kg/体積÷5,000/燃油込' + subNote,cost:canSend?c:-1,canSend:canSend,feeDetails:details,reason:!cs?'68kg超過':(c===null?'送料取得中':''),loading:_loading});
  }

  // --- SpeedPAK FedEx IP Envelope ---
  {
    const sorted = [L, W, H].sort((a,b) => b-a);
    const csW = weightG <= 500;
    const csS = sorted[0] <= 33.5 && sorted[1] <= 23.5 && sorted[2] <= 3;
    const csVal = selling <= 0 || selling <= 500;
    const cs = csW && csS && csVal;
    let { c, details } = getAdjustedApiMethod('ip_envelope', cs);
    const canSend = cs && c !== null && c > 0;
    const r2 = [];
    if (!csW) r2.push('500g超過');
    if (!csS) r2.push('サイズ超過(23.5x33.5x3cm)');
    if (!csVal) r2.push('申告価額$500超過');
    addMethod('fedex-ip',{name:'FedEx IP Envelope',sub:'1-3日/'+_dutyType+'/最大500g/内寸23.5×33.5×3cm/$500以下/燃油込' + _subSuffix,cost:canSend?c:-1,canSend:canSend,feeDetails:details,reason:r2.length?r2.join(', '):(c===null?'送料取得中':''),loading:_loading});
  }

  // --- SpeedPAK FedEx IP Pak ---
  {
    const cs = weightG <= 2500;
    let { c, details } = getAdjustedApiMethod('ip_pak', cs);
    const canSend = cs && c !== null && c > 0;
    addMethod('fedex-ip',{name:'FedEx IP Pak',sub:'1-3日/'+_dutyType+'/最大2.5kg/実重量/燃油込' + _subSuffix,cost:canSend?c:-1,canSend:canSend,feeDetails:details,reason:!cs?'2.5kg超過':(c===null?'送料取得中':''),loading:_loading});
  }

  // --- SpeedPAK FedEx IP Package ---
  {
    const csW = billableStandardG <= 68000;
    const csL = fxLength <= 274;
    const csG = fxLpG <= 330;
    const cs = csW && csL && csG;
    let { c, details } = getAdjustedApiMethod('ip', cs);
    const canSend = cs && c !== null && c > 0;
    const r2 = [];
    if (!csW) r2.push('68kg超過');
    if (!csL) r2.push('最長辺274cm超過');
    if (!csG) r2.push('長さ+周囲330cm超過');
    addMethod('fedex-ip',{name:'FedEx IP Package',sub:'1-3日/'+_dutyType+'/最大68kg/274cm/周囲330cm/体積÷5,000/燃油込' + _subSuffix,cost:canSend?c:-1,canSend:canSend,feeDetails:details,reason:r2.length?r2.join(', '):(c===null?'送料取得中':''),loading:_loading});
  }

  // --- SpeedPAK DHL Express Envelope ---
  {
    const cs = weightG <= 300;
    let { c, details } = getAdjustedApiMethod('dhl_envelope', cs);
    const canSend = cs && c !== null && c > 0;
    addMethod('dhl',{name:'DHL Express Envelope',sub:'2-4日/'+_dutyType+'/最大300g/実重量/燃油込' + _subSuffix,cost:canSend?c:-1,canSend:canSend,feeDetails:details,reason:!cs?'300g超過':(c===null?'送料取得中':''),loading:_loading});
  }

  // --- SpeedPAK DHL Express Worldwide ---
  {
    const maxW = cc.dhlZone === 10 ? 70000 : 30000;
    const cs = billableStandardG <= maxW;
    let { c, details } = getAdjustedApiMethod('dhl', cs);
    const canSend = cs && c !== null && c > 0;
    addMethod('dhl',{name:'DHL Express',sub:'2-4日/'+_dutyType+'/最大'+(maxW/1000)+'kg/体積÷5,000/燃油込' + _subSuffix,cost:canSend?c:-1,canSend:canSend,feeDetails:details,reason:!cs?(maxW/1000)+'kg超過':(c===null?'送料取得中':''),loading:_loading});
  }

  // --- SpeedPAK Economy ---
  if (cc.economy) {
    const maxKg = cc.ecoMaxKg || 25;
    const realMaxKg = cc.ecoRealMaxKg || Infinity;
    const csW = billableEcoKg <= maxKg && weightKg <= realMaxKg;
    const csD = cc.ecoSizeCheck ? cc.ecoSizeCheck(L, W, H, billableEcoKg*1000) : true;
    const cs = csW && csD;
    let { c, details } = getAdjustedApiMethod('economy', cs);
    const canSend = cs && c !== null && c > 0;
    const r2 = [];
    if (!csW) r2.push(maxKg + 'kg超過');
    if (!csD) r2.push('サイズ超過');
    let ecoReason;
    if (r2.length) {
      ecoReason = r2.join(', ');
    } else if (c === null) {
      if (_loading) ecoReason = '送料取得中';
      else ecoReason = 'Economy対象外';
    } else ecoReason = '';
    addMethod('speedpak',{name:'Economy',sub:cc.ecoDays+'/'+cc.ecoMaxVal+'以下/体積÷8,000/'+_dutyType + _subSuffix,cost:canSend?c:-1,canSend:canSend,feeDetails:details,reason:ecoReason,loading:_loading});
  } else {
    addMethod('speedpak',{name:'Economy',sub:'この国はEconomy非対応',cost:-1,canSend:false,reason:cc.name+' 非対応'});
  }

  // --- 日本郵便 ---
  {
    const jpZone = cc.jpZone || 4;
    const jpOk = cc.jpOk !== false;
    const zoneName = jpZone === 1 ? '第1地帯' : jpZone === 2 ? '第2地帯' : jpZone === 3 ? '第3地帯' : '第4地帯';
    const eplTable = Rates.getEpacketLightTable(jpZone);
    const emsTable = Rates.getEmsTable(jpZone);
    
    // Zonos表示用ラベル
    const zonosDdpLabel = (isDDP && cc.code === 'US') ? ' (Zonos DDP)' : '';
    
    if (eplTable) {
      const dims = [L, W, H].sort((a,b) => b-a);
      const eplTooSmall = dims[0] < 14.8 || dims[1] < 10.5;
      const eplTooLarge = dims[0] > 60 || (dims[0] + dims[1] + dims[2]) > 90;
      const eplWeightOk = weightG <= 2000;
      const eplSizeOk = !eplTooSmall && !eplTooLarge;
      const cs = jpOk && eplWeightOk && eplSizeOk;
      const c = cs ? Rates.lookupRate(eplTable, weightG) : -1;
      const r2 = [];
      if (!jpOk) r2.push('差出不可（△）');
      if (eplTooSmall) r2.push('サイズ小さい（最小14.8×10.5cm）');
      if (eplTooLarge) r2.push('サイズ超過（最大60cm/3辺合計90cm）');
      if (!eplWeightOk) r2.push('2kg超過');
      const shipOnly = cs&&c>0 ? c : -1; 
      const totalCost = shipOnly > 0 ? shipOnly + usDutyAmount + zonosFeeJpy : -1;
      addMethod('jppost',{name:'eパケットライト',sub:zoneName+'/追跡あり/最大2kg/実重量'+zonosDdpLabel,cost:totalCost,canSend:cs&&c>0,reason:r2.join(', '),feeDetails:shipOnly>0?buildDutyFeeDetails('配送料',shipOnly,usDutyInfo, zonosFeeJpy):null,_dutyLoading:usDutyInfo.loading});
    }
    {
      const emsDims = [L, W, H].sort((a,b) => b-a);
      const emsTooLarge = emsDims[0] > 150 || (emsDims[0] + emsDims[1] + emsDims[2]) > 300;
      const emsWeightOk = weightG <= 30000;
      const emsSizeOk = !emsTooLarge;
      const cs = jpOk && emsWeightOk && emsSizeOk;
      const c = cs ? Rates.lookupRate(emsTable, weightG) : -1;
      const r2 = [];
      if (!jpOk) r2.push('差出不可（△）');
      if (emsTooLarge) r2.push('サイズ超過（最大150cm/3辺合計300cm）');
      if (!emsWeightOk) r2.push('30kg超過');
      const shipOnly = cs&&c>0 ? c : -1; 
      const totalCost = shipOnly > 0 ? shipOnly + usDutyAmount + zonosFeeJpy : -1;
      addMethod('jppost',{name:'EMS',sub:zoneName+'/最速/最大30kg/実重量'+zonosDdpLabel,cost:totalCost,canSend:cs&&c>0,reason:r2.join(', '),feeDetails:shipOnly>0?buildDutyFeeDetails('配送料',shipOnly,usDutyInfo, zonosFeeJpy):null,_dutyLoading:usDutyInfo.loading});
    }
  }

  // --- eLogi FedEx ---
  {
    const eZ = cc.elogiZone;
    if (eZ) {
      const ficpD = Rates.getElogiFicpData(eZ);
      if (ficpD) {
        const csW = billableStandardG <= 68000;
        const csL = fxLength <= 274;
        const csG = fxLpG <= 330;
        const cs = csW && csL && csG;
        let c = cs ? Rates.elogiLookup(ficpD[0], ficpD[1], billableStandardG) : -1;
        const r2 = [];
        if (!csW) r2.push('68kg超過');
        if (!csL) r2.push('最長辺274cm超過');
        if (!csG) r2.push('長さ+周囲330cm超過');
        if (cs && c <= 0) r2.push('重量超過');
        const shipOnly = cs&&c>0 ? c : -1; 
        const totalCost = shipOnly > 0 ? shipOnly + usDutyAmount : -1;
        addMethod('elogi-ficp',{name:'eLogi FICP',sub:'2-5日/'+_dutyType+'/最大68kg/274cm/周囲330cm/体積÷5,000/サーチャージ込',cost:totalCost,canSend:cs&&c>0,reason:r2.join(', '),feeDetails:shipOnly>0?buildDutyFeeDetails('配送料（サーチャージ込）',shipOnly,usDutyInfo):null,_dutyLoading:usDutyInfo.loading});
      }
      {
        const sorted = [L, W, H].sort((a,b) => b-a);
        const csW = weightG <= 500;
        const csS = sorted[0] <= 33.5 && sorted[1] <= 23.5 && sorted[2] <= 3;
        const csVal = selling <= 0 || selling <= 500;
        const cs = csW && csS && csVal;
        const envRate = Rates.getElogiIpEnvRate(eZ);
        const c = cs && envRate > 0 ? envRate : -1;
        const r2 = [];
        if (!csW) r2.push('500g超過');
        if (!csS) r2.push('サイズ超過');
        if (!csVal) r2.push('申告価額$500超過');
        const shipOnly = cs&&c>0 ? c : -1; 
        const totalCost = shipOnly > 0 ? shipOnly + usDutyAmount : -1;
        addMethod('elogi-ip',{name:'eLogi IP Envelope',sub:'1-3日/'+_dutyType+'/最大500g/$500以下/サーチャージ込',cost:totalCost,canSend:cs&&c>0,reason:r2.join(', '),feeDetails:shipOnly>0?buildDutyFeeDetails('配送料（サーチャージ込）',shipOnly,usDutyInfo):null,_dutyLoading:usDutyInfo.loading});
      }
      {
        const pakTable = Rates.getElogiIpPakTable(eZ);
        const csW = weightG <= 2500;
        const csS = fedexDims[0] <= 52.71 && fedexDims[1] <= 44.45;
        let csV = true;
        let pakBillableG = weightG;
        if (vol > 15400) {
          pakBillableG = Math.max(weightG, vol / 5000 * 1000);
          csV = pakBillableG <= 2500;
        }
        const csVal = selling <= 0 || selling <= 500;
        const cs = csW && csS && csV && csVal && !!pakTable;
        let c = cs ? Rates.lookupRate(pakTable, pakBillableG) : -1;
        const pakR = [];
        if (!csW) pakR.push('2.5kg超過');
        if (!csS) pakR.push('サイズ超過（44.45×52.71cm超）');
        if (csW && !csV) pakR.push('寸法重量2.5kg超過');
        if (!csVal) pakR.push('申告価額$500超過');
        const pakSub = vol > 15400 ? '体積÷5,000' : '実重量';
        const shipOnly = cs&&c>0 ? c : -1; 
        const totalCost = shipOnly > 0 ? shipOnly + usDutyAmount : -1;
        addMethod('elogi-ip',{name:'eLogi IP Pak',sub:'1-3日/'+_dutyType+'/最大2.5kg/'+pakSub+'/44.45×52.71cm/サーチャージ込',cost:totalCost,canSend:cs&&c>0,reason:pakR.join(', '),feeDetails:shipOnly>0?buildDutyFeeDetails('配送料（サーチャージ込）',shipOnly,usDutyInfo):null,_dutyLoading:usDutyInfo.loading});
      }
      {
        const pkgD = Rates.getElogiIpPkgData(eZ);
        if (pkgD) {
          const csW = billableStandardG <= 68000;
          const csL = fxLength <= 274;
          const csG = fxLpG <= 330;
          const cs = csW && csL && csG;
          let c = cs ? Rates.elogiLookup(pkgD[0], pkgD[1], billableStandardG) : -1;
          const r2 = [];
          if (!csW) r2.push('68kg超過');
          if (!csL) r2.push('最長辺274cm超過');
          if (!csG) r2.push('長さ+周囲330cm超過');
          if (cs && c <= 0) r2.push('重量超過');
          const shipOnly = cs&&c>0 ? c : -1; 
          const totalCost = shipOnly > 0 ? shipOnly + usDutyAmount : -1;
          addMethod('elogi-ip',{name:'eLogi IP Package',sub:'1-3日/'+_dutyType+'/最大68kg/274cm/周囲330cm/体積÷5,000/サーチャージ込',cost:totalCost,canSend:cs&&c>0,reason:r2.join(', '),feeDetails:shipOnly>0?buildDutyFeeDetails('配送料（サーチャージ込）',shipOnly,usDutyInfo):null,_dutyLoading:usDutyInfo.loading});
        }
      }
    }
  }

  // --- eLogi UPS ---
  {
    const upsD = Rates.getElogiUpsData(cc.upsZone);
    if (upsD) {
      let c = Rates.elogiLookup(upsD[0], upsD[1], billableStandardG);
      const cs = c > 0;
      const shipOnly = cs ? c : -1; 
      const totalCost = shipOnly > 0 ? shipOnly + usDutyAmount : -1;
      addMethod('elogi-ups',{name:'UPS Express Saver',sub:'2-5日/'+_dutyType+'/体積÷5,000/サーチャージ込',cost:totalCost,canSend:cs,reason:!cs?'重量超過':'',feeDetails:shipOnly>0?buildDutyFeeDetails('配送料（サーチャージ込）',shipOnly,usDutyInfo):null,_dutyLoading:usDutyInfo.loading});
    }
  }

  let allMethods = [];
  groups.forEach(g => {
    g.methods.forEach(m => {
      if (m.cost > 0) {
        m.profit = Math.round(netReceived - purchase - m.cost);
        m.profitWithRefund = Math.round(m.profit + totalRefund);
        m.profitRate = purchase > 0 ? (m.profit / purchase * 100) : 0;
        
        let purchasePrice = 0;
        const purchaseInput = document.getElementById('purchasePrice');
        if (purchaseInput && purchaseInput.value) {
          purchasePrice = parseFloat(purchaseInput.value.replace(/,/g, '')) || 0;
        }
        
        // 利益ルール：1000円以上 ＆ 仕入値の10%以上
        const targetProfit = purchasePrice * 0.1;
        m.isOk = m.canSend && m.profit >= 1000 && m.profit >= targetProfit;
      } else {
        m.profit = null; m.profitWithRefund = null; m.profitRate = 0; m.isOk = false;
      }
      allMethods.push(m);
    });
  });

  // 最安値判定（FedEx、DHL、日本郵便）
  const validMethodsForBest = allMethods.filter(m => m._groupId === 'fedex' || m._groupId === 'fedex-ip' || m._groupId === 'dhl' || m._groupId === 'jppost');
  let bestMethod = null, bestProfit = -Infinity;
  validMethodsForBest.forEach(m => {
    if (m.canSend && m.profit !== null && m.profit > bestProfit) { 
        bestProfit = m.profit; 
        bestMethod = m; 
    }
  });

  let maxProfitAny = -Infinity, maxRefundAny = -Infinity;
  allMethods.forEach(m => {
    if (!m.canSend) return;
    if (m._groupId.startsWith('elogi')) return;
    if (m.profit !== null && m.profit > maxProfitAny) maxProfitAny = m.profit;
    if (m.profitWithRefund !== null && m.profitWithRefund > maxRefundAny) maxRefundAny = m.profitWithRefund;
  });

  function setProfitCard(cellId, value, elId) {
    const el = document.getElementById(elId);
    if (!el) return;
    if (value === null || value === undefined) {
      el.textContent = '-';
      el.className = 'p-val';
      return;
    }
    if (value < 0) {
      el.textContent = '⚠ ¥' + fmt(value);
      el.className = 'p-val val-negative';
    } else {
      el.textContent = '¥' + fmt(value);
      el.className = 'p-val';
    }
  }

  const bestNameEl = document.getElementById('bestMethodName');
  const bestRateSubEl = document.getElementById('bestRateSub');
  const summaryBar = document.querySelector('.profit-summary');

  if (bestMethod) {
    allMethods.forEach(m => { m.isBest = (m === bestMethod); });
    setProfitCard('summaryProfit', bestMethod.profit, 'bestProfitYen');
    setProfitCard('summaryRefund', bestMethod.profitWithRefund, 'bestProfitRefundYen');
    if(summaryBar) summaryBar.classList.toggle('negative', !bestMethod.isOk);
    const rateEl = document.getElementById('bestProfitRate');
    if(rateEl) rateEl.textContent = bestMethod.profitRate.toFixed(1) + '%';
    if(bestNameEl) bestNameEl.textContent = bestMethod.name;
    if(bestRateSubEl) bestRateSubEl.textContent = '仕入額 ¥' + fmt(purchase) + ' に対して';
  } else {
    let fallbackBest = null;
    allMethods.forEach(m => { 
        m.isBest = m.profit !== null && m.profit === maxProfitAny && m.isOk; 
        if (m.isBest && !fallbackBest) fallbackBest = m; 
    });
    setProfitCard('summaryProfit', maxProfitAny > -Infinity ? maxProfitAny : null, 'bestProfitYen');
    setProfitCard('summaryRefund', maxRefundAny > -Infinity ? maxRefundAny : null, 'bestProfitRefundYen');
    if(summaryBar) summaryBar.classList.toggle('negative', !fallbackBest || !fallbackBest.isOk);
    const rateEl = document.getElementById('bestProfitRate');
    if(rateEl) rateEl.textContent = fallbackBest ? fallbackBest.profitRate.toFixed(1) + '%' : '-';
    if(bestNameEl) bestNameEl.textContent = fallbackBest ? fallbackBest.name : '';
    if(bestRateSubEl) bestRateSubEl.textContent = purchase > 0 ? '仕入額 ¥' + fmt(purchase) + ' に対して' : '';
  }

  groups.forEach(g => {
    g.methods.sort((a,b) => {
      const av = a.profit, bv = b.profit;
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return bv - av;
    });
  });

  const container = document.getElementById('resultsContainer');
  if(!container) return;
  // コンテナの内部のみクリア
  container.innerHTML = '';

  groups.forEach(g => {
    const section = document.createElement('div');
    let sectionCls = 'group-section';
    if (g.id === 'speedpak' && !cc.economy) sectionCls += ' collapsed';
    if (g.collapsed) sectionCls += ' collapsed';
    section.className = sectionCls;

    let headerExtra = '';
    const isCollapsed = g.collapsed || (g.id === 'speedpak' && !cc.economy);
    if (isCollapsed) {
      headerExtra = `<button class="group-toggle" onclick="this.closest('.group-section').classList.toggle('collapsed');this.textContent=this.closest('.group-section').classList.contains('collapsed')?'詳細 ▼':'閉じる ▲'">詳細 ▼</button>`;
    }
    
    let meritLink = '';
    if (g.id === 'elogi-ficp') {
      meritLink = `<span class="elogi-merit-link" onclick="event.stopPropagation();const d=this.parentElement.nextElementSibling;d.classList.toggle('u-hidden');">メリット</span>`;
    }
    
    const noteHtml = g.note ? `<span class="g-note">— ${g.note}</span>` : '';
    section.innerHTML = `<div class="group-header"><span class="g-label">${g.label}</span>${noteHtml}${meritLink}${headerExtra}</div>`;
    
    if (g.id === 'elogi-ficp') {
      const popup = document.createElement('div');
      popup.className = 'elogi-merit-popup u-hidden';
      popup.innerHTML = `<b>手数料の免除</b><br><b>【地域外配達料が発生しない国】</b><br>米国、ヨーロッパ、アジア主要国等は、FICPを利用の場合は「地域外配達料」は発生しない。`;
      section.appendChild(popup);
    }

    if (g.id === 'jppost') {
      const jpZone = cc.jpZone || 4;
      const note = document.createElement('div');
      note.className = 'group-note';
      note.textContent = '📮 ' + (jpZone===3?'第3地帯':'第4地帯') + '（' + cc.name + '）';
      section.appendChild(note);
    }

    const grid = document.createElement('div');
    grid.className = 'group-grid';

    g.methods.forEach(m => {
      const row = document.createElement('div');
      let cls = 'method-row';
      if (m.isOk && m.canSend && m.cost > 0) cls += ' usable';
      else cls += ' dimmed';
      row.className = cls;

      const tagItems = [];
      if (m.isBest) tagItems.push('<span class="method-tag tag-recommend">最安・推奨</span>');
      if (m.isOk) tagItems.push('<span class="method-tag tag-ok">利益OK</span>');
      if (m.sub && m.sub.includes('DDP')) tagItems.push('<span class="method-tag tag-ddp">DDP</span>');
      if (g.tag === '速達') tagItems.push('<span class="method-tag tag-fast">速達</span>');
      if (g.tag === '比較用') tagItems.push('<span class="method-tag tag-compare">比較用</span>');
      if (g.tag === '4ヶ国限定') tagItems.push('<span class="method-tag tag-limit">4ヶ国限定</span>');
      if (g.tag === '非対応') tagItems.push('<span class="method-tag tag-ng">非対応</span>');
      if (m.reason) tagItems.push(`<span class="method-tag tag-limit">${m.reason}</span>`);
      const tags = tagItems.length ? `<div class="mr-tags">${tagItems.join('')}</div>` : '';

      let right;
      if (m.cost > 0 && m.profit !== null) {
        const profitCls = m.profit < 0 ? 'val val-neg' : 'val val-profit';
        const refundCls = m.profitWithRefund < 0 ? 'val val-neg' : 'val val-refund';
        const profitTxt = m.profit < 0 ? '⚠ ¥' + fmt(m.profit) : '¥' + fmt(m.profit);
        const refundTxt = m.profitWithRefund < 0 ? '⚠ ¥' + fmt(m.profitWithRefund) : '¥' + fmt(m.profitWithRefund);
        const detailBtn = m.feeDetails ? `<button class="fee-detail-btn" onclick="event.stopPropagation();const p=this.closest('.mr-right').nextElementSibling;p.classList.toggle('u-hidden');" title="送料内訳">明細</button>` : '';
        
        let popupHtml = '';
        if (m.feeDetails) {
          const rows = m.feeDetails.filter(d => d.freight > 0).map(d => `<div class="fp-row"><span class="fp-name">${d.charges}</span><span class="fp-val">¥${fmt(d.freight)}</span></div>`).join('');
          popupHtml = `<div class="fee-popup u-hidden"><div class="fp-header">送料内訳</div>${rows}<div class="fp-row fp-total"><span class="fp-name">合計</span><span class="fp-val">¥${fmt(m.cost)}</span></div></div>`;
        }
        const dutyLoadingNote = m._dutyLoading ? '<div style="font-size:.65rem;color:var(--text3);text-align:right;margin-top:1px">関税取得中...</div>' : '';

        right = `<div class="mr-right">
          <span class="lbl">送料 ${detailBtn}</span><span class="val val-cost">¥${fmt(m.cost)}</span>
          <span class="lbl">利益</span><span class="${profitCls}">${profitTxt}</span>
          <span class="lbl">還付込</span><span class="${refundCls}">${refundTxt}</span>
        </div>${dutyLoadingNote}${popupHtml}`;
      } else {
        right = `<div class="mr-na">${m.reason || '発送不可'}</div>`;
      }

      row.innerHTML = `<div class="mr-left"><div class="mr-name">${m.name}</div><div class="mr-sub">${m.sub}</div>${tags}</div>${right}`;
      grid.appendChild(row);
    });

    section.appendChild(grid);
    container.appendChild(section);
  });
}