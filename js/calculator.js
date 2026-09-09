import { state } from './state.js';
import { getVal, fmt, fmtD } from './utils.js';
import { COUNTRIES, FEE_RATES, getGroupForCategory, getCategoryName, CATEGORY_TO_FEE_GROUP, ACTUAL_RATES } from './config.js';
import * as Rates from './shipping-rates.js';

function getUsShippingPctDec() {
  if (state.currentPricingMode === 'us') return 0.44; 
  return getVal('usShippingPct') / 100;
}

const EU_COUNTRY_CODES = ['DE','FR','NL','BE','AT','IE','LU','SE','DK','FI','EE','LV','LT','IT','ES','PT','GR','HR','SI','CY','MT','PL','CZ','HU','RO','SK','BG'];

function isEuCountry(code) { return EU_COUNTRY_CODES.includes((code || '').toUpperCase()); }

function isEuLowValue(ccCode, declaredUsd) {
  if (!isEuCountry(ccCode) || !(declaredUsd > 0)) return false;
  return (declaredUsd / 1.08) <= 150;
}

function getEuDutyYen(groupId, ccCode, declaredUsd, rate) {
  if (!isEuLowValue(ccCode, declaredUsd) || !(rate > 0)) return 0;
  const eurToJpy = (rate || 150) * 1.08;
  const duty = 3 * eurToJpy;
  
  const disbFeeEl = document.getElementById('euDisbursementFee');
  const disbFeeEur = disbFeeEl ? (parseFloat(disbFeeEl.value) || 12) : 12;
  const disbursement = disbFeeEur * eurToJpy;

  switch (groupId) {
    case 'fedex': case 'fedex-ip': case 'dhl':
      return Math.round(duty * 1.021); 
    case 'elogi-ficp': case 'elogi-ip': case 'elogi-ie': {
      const waiver = document.getElementById('euFedexCardWaiver');
      return Math.round(duty + (waiver && waiver.checked ? 0 : disbursement));
    }
    case 'elogi-ups': case 'elogi-dhl':
      return Math.round(duty + disbursement);
    default:
      return 0;
  }
}

const REMOTE_AREA_FEE = { fedex: 2990, 'fedex-ip': 2990, dhl: 1000 };

function isRemoteAreaChecked() {
  const el = document.getElementById('shipRemote');
  return !!(el && el.checked);
}

function getRemoteAreaFeeYen(groupId) {
  if (!isRemoteAreaChecked()) return 0;
  const base = REMOTE_AREA_FEE[groupId];
  if (!base) return 0;
  const fuelSurchargeRate = getVal('fuelSurcharge') / 100;
  return base + Math.round(base * fuelSurchargeRate);
}

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
    const compTotal = selling + getCompShippingUsd();
    if (compTotal <= 0) return 0;
    return Math.round((compTotal - 0.01) * 100) / 100;
  } else {
    if (selling <= 0) return 0;
    const base = Math.round((selling - 0.01) * 100) / 100;
    if (state.currentCountry === 'us') return Math.round((base * (1 + getUsShippingPctDec())) * 100) / 100;
    return base;
  }
}

function updatePricingDisplay() {
  const selling = getVal('sellingPrice');
  if (state.currentPricingMode === 'us') {
    const compTotal = selling + getCompShippingUsd();
    const total = compTotal > 0 ? Math.round((compTotal - 0.01) * 100) / 100 : 0;
    if (total > 0) {
      if (state.currentCountry === 'us') {
        const itemPrice = Math.round((total / (1 + getUsShippingPctDec())) * 100) / 100;
        document.getElementById('listPrice').textContent = '$' + fmtD(itemPrice);
        document.getElementById('listShipping').textContent = '$' + fmtD(Math.round((total - itemPrice) * 100) / 100);
      } else {
        document.getElementById('listPrice').textContent = '$' + fmtD(total);
        document.getElementById('listShipping').textContent = '$0.00';
      }
    } else {
      document.getElementById('listPrice').textContent = '-'; document.getElementById('listShipping').textContent = '-';
    }
  } else {
    const usShippingRef = selling > 0 ? Math.round((selling - 0.01) * getUsShippingPctDec() * 100) / 100 : 0;
    const refEl = document.getElementById('usShippingRef');
    if (refEl) refEl.textContent = usShippingRef > 0 ? '$' + fmtD(usShippingRef) : '-';
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
  let pW = 0, pC = 0, aW = 0, aC = 0;
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

  const taxMul = 1 + (getVal('taxRate') / 100);
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
  const taxMul = 1 + (getVal('taxRate') / 100);
  const r1 = getVal('ebayFeeRate'), r2 = getVal('ebayFeeRate2'), th = getVal('feeThreshold');

  if (g.special === 'shoes') {
    fvf = selling * (selling >= th ? r2/100 : r1/100);
  } else if (g.tiers) {
    fvf = selling * (r1 / 100);
  } else {
    fvf = selling <= th ? selling * (r1/100) : th * (r1/100) + (selling - th) * (r2/100);
  }
  
  const billedFvf = fvf * taxMul;
  descEl.textContent = `FVF(税込): ${(selling > 0 ? (billedFvf / selling * 100) : 0).toFixed(2)}% ($${billedFvf.toFixed(2)})`;
}

function calcFVFBase(amount, grp, r1, th, r2, perOrder) {
  let fvfBase = 0, effPerOrder = (amount <= 10) ? 0.30 : perOrder;
  if (grp.special === 'shoes') {
    fvfBase = amount * (amount >= grp.threshold ? grp.rate_high/100 : grp.rate_low/100);
    if(amount >= grp.threshold) effPerOrder = 0;
  } else if (grp.tiers) {
    let rem = amount, pLim = 0;
    for (const [rate, limit] of grp.tiers) {
      const band = limit === Infinity ? rem : Math.min(rem, limit - pLim);
      if (band <= 0) break;
      fvfBase += band * (rate / 100);
      rem -= band; pLim = limit;
      if (rem <= 0) break;
    }
  } else {
    fvfBase = amount <= th ? amount * r1 : th * r1 + (amount - th) * r2;
  }
  return { fvfBase, effectivePerOrder: effPerOrder };
}

function lookupBracketKg(table, weightGrams) {
  if (!table) return 0;
  for (let i = 0; i < table.length; i++) {
    if (weightGrams <= table[i][0]) return table[i][0] / 1000;
  }
  return 0;
}

function buildDutyDetails(label, cost, duty, zonos = 0) {
  const d = [{charges: label, freight: cost}];
  if(duty > 0) d.push({charges: '推定関税（原価35%）', freight: duty});
  if(zonos > 0) d.push({charges: 'Zonos手数料 ($2+関税10%)', freight: zonos});
  return d;
}

export function calculate() {
  updatePricingDisplay();
  updateFeeDescription();
  
  const isDDP = (state.currentCountry === 'us');
  const purchase = getVal('purchasePrice') || 0;
  const selling = getEffectiveSellingPrice();
  const weightKg = getVal('weight'), L = getVal('length'), W = getVal('width'), H = getVal('height');
  
  const taxMul = 1 + (getVal('taxRate') / 100);
  const rate = getVal('exchangeRate');
  const fuelSurchargeRate = getVal('fuelSurcharge') / 100;

  const vol = L * W * H;
  const volWeight = vol / 5000;
  document.getElementById('volWeight').textContent = volWeight.toFixed(3) + ' kg';
  document.getElementById('volWeightEco').textContent = (vol / 8000).toFixed(3) + ' kg';

  const plan = FEE_RATES[state.currentStorePlan];
  const grp = plan[plan[state.currentFeeGroup] ? state.currentFeeGroup : 'default'];
  const fvfResult = calcFVFBase(selling, grp, getVal('ebayFeeRate')/100, getVal('feeThreshold'), getVal('ebayFeeRate2')/100, getVal('perOrderFee'));
  
  const ebayFvf = (fvfResult.fvfBase + fvfResult.effectivePerOrder) * taxMul;
  const promotedFee = selling * (getVal('promotedRate')/100) * taxMul;
  const intlFee = selling * (getVal('intlFeeRate')/100) * taxMul;
  const totalEbayDeductions = ebayFvf + promotedFee + intlFee;
  const payoneerFee = (selling - totalEbayDeductions) * (getVal('payoneerRate')/100);
  const netReceived = (selling - totalEbayDeductions) * (1 - getVal('payoneerRate')/100) * rate;
  const revenueYen = selling * rate;
  const totalFeesYen = revenueYen - netReceived;
  const totalRefund = (purchase * (getVal('taxRate')/100) / taxMul) + (totalEbayDeductions / taxMul * (getVal('taxRate')/100) * rate);

  document.getElementById('revenueYen').textContent = `¥${fmt(revenueYen)}（$${fmtD(selling)}）`;
  document.getElementById('totalFeesYen').textContent = `¥${fmt(totalFeesYen)}`;
  document.getElementById('feeEbay').textContent = `$${fmtD(ebayFvf)}`;
  document.getElementById('feeEbayDetail').textContent = `($${fmtD(fvfResult.fvfBase)} + $${fmtD(fvfResult.effectivePerOrder)}/注文) 税込`;
  document.getElementById('feePromoted').textContent = `$${fmtD(promotedFee)}`;
  document.getElementById('feeIntl').textContent = `$${fmtD(intlFee)}`;
  document.getElementById('feePayoneer').textContent = `$${fmtD(payoneerFee)}（¥${fmt(payoneerFee * rate)}）`;
  document.getElementById('feeTotalUsd').textContent = `$${fmtD(totalEbayDeductions + payoneerFee)}（¥${fmt(totalFeesYen)}）`;

  const weightG = weightKg * 1000;
  const fedexDims = [Math.ceil(L), Math.ceil(W), Math.ceil(H)].sort((a,b) => b-a);
  const fxLength = fedexDims[0], fxLpG = fxLength + 2*(fedexDims[1]+fedexDims[2]);
  const billableStandardG = Math.max(weightKg, volWeight) * 1000;

  const cc = COUNTRIES.find(c => c.id === state.currentCountry) || COUNTRIES[0];
  const ficpTable = Rates.getFicpTable(cc.fedexZone);
  const dhlTable = Rates.getDhlTable(cc.dhlZone);
  
  let usDutyAmount = 0, zonosFeeJpy = 0;
  if (isDDP && cc.code === 'US' && selling > 0 && rate > 0) {
      usDutyAmount = Math.round((selling / (1 + getUsShippingPctDec())) * 0.35 * rate); 
      zonosFeeJpy = Math.round((2 + ((usDutyAmount / rate) * 0.10)) * rate);
  }

  // ✅【リクエスト対応】EMS(日本郵便)の配置変更 ＋ eLogiの完全復旧
  const groups = [
    { id: 'fedex',      label: 'FedEx FICP（CPaSS）', methods: [], note: '基本的にはこの配送方法でOK' },
    { id: 'fedex-ip',   label: 'FedEx IP（CPaSS）', methods: [], collapsed: true, note: '早い配送方法。Pakは実重量課金なので軽くて嵩張る荷物は割安' },
    { id: 'jppost',     label: '日本郵便', methods: [], note: cc.jpOk!==false?'CPaSS非対応・自分で発送手続きが必要 (EMSはZonos対応)':(cc.jpZone?'この国は日本郵便の差出が制限されています（△）':'料金テーブル未設定') },
    { id: 'dhl',        label: 'DHL（CPaSS）', methods: [], note: '安ければ使用OK、基本的にはFedExが安い' },
    { id: 'speedpak',   label: 'Economy（CPaSS）', methods: [], note: cc.economy?'配送が遅いので使用する場合はEconomy用のShipping Policyを作成してください':'この国はEconomy非対応です' },
    { id: 'elogi-ficp', label: 'eLogi FedEx FICP', methods: [], collapsed: true, note: 'CPaSSと比較用' },
    { id: 'elogi-ip',   label: 'eLogi FedEx IP', methods: [], collapsed: true, note: 'CPaSSと比較用' },
    { id: 'elogi-ie',   label: 'eLogi FedEx IE', methods: [], collapsed: true, note: 'エコノミー。IPより遅いが安い' },
    { id: 'elogi-dhl',  label: 'eLogi DHL Express', methods: [], collapsed: true, note: 'CPaSSのDHLと比較用' },
    { id: 'elogi-ups',  label: 'eLogi UPS Express Saver', methods: [], collapsed: true, note: 'アジア・オーストラリア向けが安い' }
  ];

  function addMethod(groupId, m) {
    m._groupId = groupId;
    const euDuty = getEuDutyYen(groupId, cc.code, selling, rate);
    if (euDuty > 0 && m.cost > 0) {
      m.cost += euDuty;
      m.feeDetails = [...(m.feeDetails||[]), {charges:'EU関税（€3）＋手数料', freight:euDuty}];
    }
    const remoteFee = getRemoteAreaFeeYen(groupId);
    if (remoteFee > 0 && m.cost > 0) {
      m.cost += remoteFee;
      m.feeDetails = [...(m.feeDetails||[]), {charges:'地域外配達料（燃油込）', freight:remoteFee}];
    }
    groups.find(g => g.id === groupId).methods.push(m);
  }

  const _dutyType = (isDDP || isEuLowValue(cc.code, selling)) ? 'DDP' : 'DDU';

  // --- CPaSS FedEx FICP ---
  if (billableStandardG <= 68000) {
    const baseRate = Rates.lookupRate(ficpTable, billableStandardG);
    if (baseRate > 0) {
      const peak = Math.round(lookupBracketKg(ficpTable, billableStandardG) * (cc.peakPerKg || 0));
      const fuel = Math.round((baseRate + peak) * fuelSurchargeRate);
      let details = [{charges:'運送料金', freight:baseRate}];
      if (peak > 0) details.push({charges:'混雑時割増金', freight:peak});
      details.push({charges:'燃料割増金', freight:fuel});
      if (usDutyAmount > 0) details.push({charges:'推定関税', freight:usDutyAmount});
      
      addMethod('fedex',{name:'International Connect Plus', sub:'2-5日/'+_dutyType+'/最大68kg/燃油込', cost: baseRate+peak+fuel+usDutyAmount, canSend:true, feeDetails:details});
    }
    
    // CPaSS FedEx Pak
    if (weightG <= 2500 && vol <= 15400 && fedexDims[0] <= 52.71 && fedexDims[1] <= 44.45 && (selling <= 0 || selling <= 500)) {
      const pakBase = Rates.lookupRate(ficpTable, weightG);
      if (pakBase > 0) {
        const pakPeak = Math.round(lookupBracketKg(ficpTable, weightG) * (cc.peakPerKg || 0));
        const pakFuel = Math.round((pakBase + pakPeak) * fuelSurchargeRate);
        let pakDetails = [{charges:'運送料金', freight:pakBase}];
        if (pakPeak > 0) pakDetails.push({charges:'混雑時割増金', freight:pakPeak});
        pakDetails.push({charges:'燃料割増金', freight:pakFuel});
        if (usDutyAmount > 0) pakDetails.push({charges:'推定関税', freight:usDutyAmount});
        
        addMethod('fedex',{name:'International Connect Plus（FedEx Pak）', sub:'2-5日/'+_dutyType+'/実重量課金/最大2.5kg/$500以下/燃油込', cost: pakBase+pakPeak+pakFuel+usDutyAmount, canSend:true, feeDetails:pakDetails});
      }
    }
  }

  // --- CPaSS FedEx IP Package ---
  if (billableStandardG <= 68000 && fxLength <= 274 && fxLpG <= 330) {
    const ipTable = (typeof Rates.getIpPackageTable === 'function') ? Rates.getIpPackageTable(cc.fedexZone) : null;
    if (ipTable) {
      const baseRate = Rates.lookupRate(ipTable, billableStandardG);
      if (baseRate > 0) {
        const peak = Math.round(lookupBracketKg(ipTable, billableStandardG) * (cc.peakPerKg || 0));
        const fuel = Math.round((baseRate + peak) * fuelSurchargeRate);
        let details = [{charges:'運送料金', freight:baseRate}];
        if (peak > 0) details.push({charges:'混雑時割増金', freight:peak});
        details.push({charges:'燃料割増金', freight:fuel});
        if (usDutyAmount > 0) details.push({charges:'推定関税', freight:usDutyAmount});
        
        addMethod('fedex-ip',{name:'FedEx IP Package', sub:'1-3日/'+_dutyType+'/最大68kg/燃油込', cost: baseRate+peak+fuel+usDutyAmount, canSend:true, feeDetails:details});
      }
    }
  }

  // --- CPaSS DHL Express ---
  if (billableStandardG <= 70000 && dhlTable) {
    const baseRate = Rates.lookupRate(dhlTable, billableStandardG);
    if (baseRate > 0) {
      const fuel = Math.round(baseRate * fuelSurchargeRate);
      let details = [{charges:'運送料金', freight:baseRate}, {charges:'燃料割増金', freight:fuel}];
      if(usDutyAmount > 0) details.push({charges:'推定関税', freight:usDutyAmount});
      
      addMethod('dhl',{name:'DHL Express', sub:'2-4日/'+_dutyType+'/最大70kg/燃油込', cost: baseRate+fuel+usDutyAmount, canSend:true, feeDetails:details});
    }
  }

  // --- eLogi FedEx FICP, IP ---
  const eZ = cc.elogiZone;
  if (eZ && typeof Rates.getElogiFicpData === 'function') {
    const ficpD = Rates.getElogiFicpData(eZ);
    if (ficpD && billableStandardG <= 68000 && fxLength <= 274 && fxLpG <= 330) {
      const c = Rates.elogiLookup(ficpD[0], ficpD[1], billableStandardG);
      if(c > 0) addMethod('elogi-ficp',{name:'eLogi FICP',sub:'2-5日/'+_dutyType+'/最大68kg/サーチャージ込',cost:c+usDutyAmount,canSend:true,feeDetails:buildDutyDetails('配送料（燃油込）',c,usDutyAmount)});
    }
    
    const envRate = Rates.getElogiIpEnvRate(eZ);
    if (envRate > 0 && weightG <= 500 && fedexDims[0] <= 33.5 && fedexDims[1] <= 23.5 && fedexDims[2] <= 3 && (selling <= 0 || selling <= 500)) {
      addMethod('elogi-ip',{name:'eLogi IP Envelope',sub:'1-3日/'+_dutyType+'/最大500g/$500以下/サーチャージ込',cost:envRate+usDutyAmount,canSend:true,feeDetails:buildDutyDetails('配送料（燃油込）',envRate,usDutyAmount)});
    }
    
    const pakTable = Rates.getElogiIpPakTable(eZ);
    const pakBillableG = (vol > 15400) ? Math.max(weightG, volWeight*1000) : weightG;
    if (pakTable && weightG <= 2500 && pakBillableG <= 2500 && fedexDims[0] <= 52.71 && fedexDims[1] <= 44.45 && (selling <= 0 || selling <= 500)) {
      const cPak = Rates.lookupRate(pakTable, pakBillableG);
      if (cPak > 0) addMethod('elogi-ip',{name:'eLogi IP Pak',sub:'1-3日/'+_dutyType+'/最大2.5kg/44.45×52.71cm/サーチャージ込',cost:cPak+usDutyAmount,canSend:true,feeDetails:buildDutyDetails('配送料（燃油込）',cPak,usDutyAmount)});
    }

    const pkgD = Rates.getElogiIpPkgData(eZ);
    if (pkgD && billableStandardG <= 68000 && fxLength <= 274 && fxLpG <= 330) {
      const c = Rates.elogiLookup(pkgD[0], pkgD[1], billableStandardG);
      if (c > 0) addMethod('elogi-ip',{name:'eLogi IP Package',sub:'1-3日/'+_dutyType+'/最大68kg/サーチャージ込',cost:c+usDutyAmount,canSend:true,feeDetails:buildDutyDetails('配送料（燃油込）',c,usDutyAmount)});
    }
  }

  // --- eLogi FedEx IE ---
  if (eZ && typeof Rates.getElogiIeData === 'function') {
    const ieD = Rates.getElogiIeData(eZ);
    if (ieD && billableStandardG <= 68000 && fxLength <= 274 && fxLpG <= 330) {
      const c = Rates.elogiLookup(ieD[0], ieD[1], billableStandardG);
      if(c > 0) addMethod('elogi-ie',{name:'eLogi IE',sub:'4-6日/'+_dutyType+'/最大68kg/サーチャージ込',cost:c+usDutyAmount,canSend:true,feeDetails:buildDutyDetails('配送料（燃油込）',c,usDutyAmount)});
    }
  }

  // --- eLogi DHL Express ---
  if (typeof Rates.getElogiDhlData === 'function') {
    const dhlD = Rates.getElogiDhlData(cc.elogiDhlZone);
    if (dhlD && billableStandardG <= 30000) {
      const c = Rates.elogiLookup(dhlD[0], dhlD[1], billableStandardG);
      if(c > 0) addMethod('elogi-dhl',{name:'eLogi DHL Express',sub:'2-4日/'+_dutyType+'/最大30kg/サーチャージ込',cost:c+usDutyAmount,canSend:true,feeDetails:buildDutyDetails('配送料（燃油込）',c,usDutyAmount)});
    }
  }

  // --- eLogi UPS Express Saver ---
  if (typeof Rates.getElogiUpsData === 'function') {
    const upsD = Rates.getElogiUpsData(cc.upsZone);
    if (upsD) {
      const c = Rates.elogiLookup(upsD[0], upsD[1], billableStandardG);
      if (c > 0) addMethod('elogi-ups',{name:'UPS Express Saver',sub:'2-5日/'+_dutyType+'/体積÷5,000/サーチャージ込',cost:c+usDutyAmount,canSend:true,feeDetails:buildDutyDetails('配送料（燃油込）',c,usDutyAmount)});
    }
  }

  // --- 日本郵便 ---
  const jpOk = cc.jpOk !== false;
  if (jpOk && typeof Rates.getEpacketLightTable === 'function') {
    const eplTable = Rates.getEpacketLightTable(cc.jpZone || 4);
    if (eplTable && weightG <= 2000 && fedexDims[0] <= 60 && (fedexDims[0]+fedexDims[1]+fedexDims[2]) <= 90 && fedexDims[2] >= 10.5) {
      const c = Rates.lookupRate(eplTable, weightG);
      if (c > 0) addMethod('jppost',{name:'eパケットライト',sub:`第${cc.jpZone||4}地帯/追跡あり/最大2kg/実重量`,cost:c+usDutyAmount+zonosFeeJpy,canSend:true,feeDetails:buildDutyDetails('配送料',c,usDutyAmount,zonosFeeJpy)});
    }
    const emsTable = Rates.getEmsTable(cc.jpZone || 4);
    if (emsTable && weightG <= 30000 && fedexDims[0] <= 150 && (fedexDims[0]+fedexDims[1]+fedexDims[2]) <= 300) {
      const c = Rates.lookupRate(emsTable, weightG);
      const zonosDdpLabel = (isDDP && cc.code === 'US') ? ' (Zonos DDP)' : '';
      if (c > 0) addMethod('jppost',{name:'EMS',sub:`第${cc.jpZone||4}地帯/最速/最大30kg/実重量${zonosDdpLabel}`,cost:c+usDutyAmount+zonosFeeJpy,canSend:true,feeDetails:buildDutyDetails('配送料',c,usDutyAmount,zonosFeeJpy)});
    }
  }

  addMethod('speedpak',{name:'Economy',sub:'この国はEconomy非対応',cost:-1,canSend:false,reason:'料金表未設定 (API専用)'});

  let allMethods = [];
  groups.forEach(g => {
    g.methods.forEach(m => {
      if (m.cost > 0) {
        m.profit = Math.round(netReceived - purchase - m.cost);
        m.profitWithRefund = Math.round(m.profit + totalRefund);
        m.profitRate = purchase > 0 ? (m.profit / purchase * 100) : 0;
        m.isOk = m.profit >= 1000 && m.profit >= (purchase * 0.1);
      }
      allMethods.push(m);
    });
  });

  const validMethodsForBest = allMethods.filter(m => m._groupId === 'fedex' || m._groupId === 'fedex-ip' || m._groupId === 'dhl' || m._groupId === 'jppost');
  let bestMethod = null, bestProfit = -Infinity;
  validMethodsForBest.forEach(m => {
    if (m.canSend && m.profit !== null && m.profit > bestProfit) { bestProfit = m.profit; bestMethod = m; }
  });

  const container = document.getElementById('resultsContainer');
  if(!container) return;
  container.innerHTML = '';

  groups.forEach(g => {
    // ✅ 空のグループ（料金データが無い配送手段）はスッキリ非表示にする
    if(g.methods.length === 0) return;

    const section = document.createElement('div');
    section.className = 'group-section' + (g.collapsed ? ' collapsed' : '');
    const headerExtra = g.collapsed ? `<button class="group-toggle" onclick="this.closest('.group-section').classList.toggle('collapsed');this.textContent=this.closest('.group-section').classList.contains('collapsed')?'詳細 ▼':'閉じる ▲'">詳細 ▼</button>` : '';
    section.innerHTML = `<div class="group-header"><span class="g-label">${g.label}</span>${g.note?`<span class="g-note">— ${g.note}</span>`:''}${headerExtra}</div>`;
    
    if (g.id === 'jppost') section.innerHTML += `<div class="group-note">📮 第${cc.jpZone||4}地帯（${cc.name}）</div>`;

    const grid = document.createElement('div');
    grid.className = 'group-grid';

    g.methods.sort((a,b) => (b.profit||0) - (a.profit||0)).forEach(m => {
      const isBest = (m === bestMethod);
      const cls = (m.isOk && m.cost > 0) ? 'method-row usable' : 'method-row dimmed';
      
      let right = `<div class="mr-na">${m.reason || '発送不可'}</div>`;
      if (m.cost > 0) {
        const pCls = m.profit < 0 ? 'val val-neg' : 'val val-profit';
        const rCls = m.profitWithRefund < 0 ? 'val val-neg' : 'val val-refund';
        const popup = `<div class="fee-popup u-hidden"><div class="fp-header">送料内訳</div>` + 
          (m.feeDetails||[]).map(d => `<div class="fp-row"><span class="fp-name">${d.charges}</span><span class="fp-val">¥${fmt(d.freight)}</span></div>`).join('') +
          `<div class="fp-row fp-total"><span class="fp-name">合計</span><span class="fp-val">¥${fmt(m.cost)}</span></div></div>`;

        right = `<div class="mr-right">
          <span class="lbl">送料 <button class="fee-detail-btn" onclick="event.stopPropagation();const p=this.closest('.mr-right').nextElementSibling;p.classList.toggle('u-hidden');">明細</button></span><span class="val val-cost">¥${fmt(m.cost)}</span>
          <span class="lbl">利益</span><span class="${pCls}">¥${fmt(m.profit)}</span>
          <span class="lbl">还付込</span><span class="${rCls}">¥${fmt(m.profitWithRefund)}</span>
        </div>${popup}`;
      }

      const tags = (isBest ? '<span class="method-tag tag-recommend">最安・推奨</span>' : '') + (m.isOk ? '<span class="method-tag tag-ok">利益OK</span>' : '');
      grid.innerHTML += `<div class="${cls}"><div class="mr-left"><div class="mr-name">${m.name}</div><div class="mr-sub">${m.sub}</div><div class="mr-tags">${tags}</div></div>${right}</div>`;
    });

    section.appendChild(grid);
    container.appendChild(section);
  });

  const bestNameEl = document.getElementById('bestMethodName');
  const summaryBar = document.querySelector('.profit-summary');
  if (bestMethod) {
    document.getElementById('bestProfitYen').textContent = '¥' + fmt(bestMethod.profit);
    document.getElementById('bestProfitRefundYen').textContent = '¥' + fmt(bestMethod.profitWithRefund);
    if(summaryBar) summaryBar.classList.toggle('negative', !bestMethod.isOk);
    if(bestNameEl) bestNameEl.textContent = bestMethod.name;
  } else {
    document.getElementById('bestProfitYen').textContent = '-';
    document.getElementById('bestProfitRefundYen').textContent = '-';
    if(summaryBar) summaryBar.classList.add('negative');
    if(bestNameEl) bestNameEl.textContent = '-';
  }
}