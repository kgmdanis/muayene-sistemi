#!/usr/bin/env node
/**
 * RAPOR DOLDURMA DENETİMİ (dinamik)
 *
 * Statik auditTemplates.js sadece "label Word'de var mı" bakar; bu script ise
 * her şablon için GERÇEK rapor üretir (generateGenericWord) ve her alana benzersiz
 * sentinel değer vererek çıktıda doğru yere düşüp düşmediğini ölçer.
 *
 * Kontrol eder:
 *   - Kontrol soruları (controlQuestions): değer doğru kriter satırına düştü mü
 *   - Field mappings (firma/rapor/firmaBilgi bilgi alanları): doğru label'a düştü mü
 *
 * Kullanım: node scripts/rapor-doldurma-denetim.js [FR7.2.37 ...]
 *           (kod verilmezse tüm şablonlar taranır)
 */
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const gws = require('../services/genericWordService');
const { labelsMatch, normalizeLabel } = require('../services/wordCellOperations');

const CFG = path.join(__dirname, '..', 'services', 'templateConfigs');
const BASE = path.join(__dirname, '..');

function cellText(c) {
  const m = c.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
  return m.map(t => t.replace(/<[^>]+>/g, '')).join('').trim();
}
function rowsOf(xml) {
  return (xml.match(/<w:tr[^>]*>[\s\S]*?<\/w:tr>/g) || [])
    .map(r => (r.match(/<w:tc[^>]*>[\s\S]*?<\/w:tc>/g) || []).map(cellText));
}
function setPath(obj, dotted, val) {
  const p = dotted.split('.'); let o = obj;
  for (let i = 0; i < p.length - 1; i++) { o[p[i]] = o[p[i]] || {}; o = o[p[i]]; }
  o[p[p.length - 1]] = val;
}

async function auditFill(kod) {
  const cfg = JSON.parse(fs.readFileSync(path.join(CFG, kod + '.json'), 'utf8'));
  const wm = cfg.wordMapping || {};
  const tp = path.join(BASE, wm.templatePath || '');
  if (!wm.templatePath || !fs.existsSync(tp)) return { kod, skip: 'şablon dosyası yok' };
  // Özel form servisleri generic pipeline kullanmaz → temsili değil, atla
  const OZEL = { 'FR7.2.36': 1, 'FR7.2.40': 1, 'FR7.2.21': 1, 'FR7.2.156': 1 };
  if (OZEL[kod]) return { kod, skip: 'özel form (kendi servisi)' };

  const cq = (wm.controlQuestions && wm.controlQuestions.questions) || [];
  // Aynı label'a sahip kontrol sorusu olan field'lar "shadowed": kontrol sorusu
  // (sonra çalışır) değeri yazar, field ölü kalır ama değer yine de görünür.
  const cqLabels = new Set(cq.map(q => normalizeLabel(q.text || '')));
  const fields = (wm.fields || []).filter(f =>
    f.label && (!f.format || f.format === 'text') && !cqLabels.has(normalizeLabel(f.label)));

  // Sentinel'leri yerleştir
  const rapor = { sablonKodu: kod, formData: {} };
  const isEmri = { customer: {}, firmaBilgi: {} };
  const cqMap = {}, fMap = {};
  cq.forEach((q, i) => { const s = `CQ${i}CQ`; rapor.formData[q.field] = s; cqMap[s] = q; });
  fields.forEach((f, i) => {
    const s = `FD${i}FD`; fMap[s] = f;
    if (f.source === 'firmaBilgi.isgKatipId') isEmri.firmaBilgi.isgKatipId = s;
    else if (f.source) {
      const root = f.source.split('.')[0];
      if (root === 'firma') setPath(isEmri.customer, f.source.replace(/^firma\./, ''), s);
      else if (root === 'firmaBilgi') setPath(isEmri.firmaBilgi, f.source.replace(/^firmaBilgi\./, ''), s);
      else if (root === 'rapor') setPath(rapor, f.source.replace(/^rapor\./, ''), s);
      else setPath(rapor.formData, f.source, s);
    } else if (f.field) rapor.formData[f.field] = s;
  });

  let buf;
  try { buf = await gws.generateGenericWord(rapor, isEmri, {}); }
  catch (e) { return { kod, err: e.message }; }
  const zip = await JSZip.loadAsync(buf);
  let allXml = await zip.file('word/document.xml').async('string');
  if (wm.headerFile) { const hf = zip.file(wm.headerFile); if (hf) allXml = (await hf.async('string')) + allXml; }
  const rows = rowsOf(allXml);

  // Yerleşim
  const land = {};
  rows.forEach(cells => cells.forEach(ct => {
    for (const s of Object.keys({ ...cqMap, ...fMap })) if (ct.includes(s)) land[s] = cells;
  }));

  const cqMiss = [], cqWrong = [], fdMissCandidate = [];
  cq.forEach((q, i) => {
    const s = `CQ${i}CQ`, cells = land[s];
    if (!cells) { cqMiss.push(q.field); return; }
    const lbl = cells.filter(c => c && !/CQ\d+CQ|FD\d+FD/.test(c)).join(' ').toLowerCase();
    if (!lbl.includes(q.text.toLowerCase().substring(0, Math.min(20, q.text.length)))) cqWrong.push(q.field);
  });
  fields.forEach((f, i) => {
    const s = `FD${i}FD`;
    if (!land[s]) fdMissCandidate.push(f);
  });

  // Faz 2: toplu testte dolmayan field'ları TEK TEK yeniden test et.
  // (sıkışık header hücrelerinde çakışma kurbanı olanları ele; sadece kendi
  //  başına da dolmayan = gerçekten bozuk olanları bildir.)
  const fdMiss = [];
  for (const f of fdMissCandidate) {
    const r2 = { sablonKodu: kod, formData: {} };
    const ie2 = { customer: {}, firmaBilgi: {} };
    const SENT = 'SOLO_SENTINEL';
    if (f.source === 'firmaBilgi.isgKatipId') ie2.firmaBilgi.isgKatipId = SENT;
    else if (f.source) {
      const root = f.source.split('.')[0];
      if (root === 'firma') setPath(ie2.customer, f.source.replace(/^firma\./, ''), SENT);
      else if (root === 'firmaBilgi') setPath(ie2.firmaBilgi, f.source.replace(/^firmaBilgi\./, ''), SENT);
      else if (root === 'rapor') setPath(r2, f.source.replace(/^rapor\./, ''), SENT);
      else setPath(r2.formData, f.source, SENT);
    } else if (f.field) r2.formData[f.field] = SENT;
    let solo = false;
    try {
      const b2 = await gws.generateGenericWord(r2, ie2, {});
      const z2 = await JSZip.loadAsync(b2);
      let x2 = await z2.file('word/document.xml').async('string');
      if (wm.headerFile) { const hf2 = z2.file(wm.headerFile); if (hf2) x2 += await hf2.async('string'); }
      solo = x2.includes(SENT);
    } catch (e) { /* solo=false */ }
    if (!solo) fdMiss.push(f.label);  // tek başına da dolmadı → gerçekten bozuk
  }
  const fdCollision = fdMissCandidate.length - fdMiss.length;  // çakışma kurbanı sayısı
  return { kod, cqTotal: cq.length, fdTotal: fields.length, cqMiss, cqWrong, fdMiss, fdCollision };
}

(async () => {
  let kodlar = process.argv.slice(2);
  if (!kodlar.length) kodlar = fs.readdirSync(CFG).filter(f => f.endsWith('.json')).map(f => f.replace('.json', '')).sort();

  let CQ = 0, CQM = 0, CQW = 0, FD = 0, FDM = 0, FDC = 0;
  const bad = [];
  for (const kod of kodlar) {
    try {
      const r = await auditFill(kod);
      if (r.skip || r.err) { if (r.err) bad.push(r); continue; }
      CQ += r.cqTotal; CQM += r.cqMiss.length; CQW += r.cqWrong.length;
      FD += r.fdTotal; FDM += r.fdMiss.length; FDC += r.fdCollision || 0;
      if (r.cqMiss.length || r.cqWrong.length || r.fdMiss.length) bad.push(r);
    } catch (e) { bad.push({ kod, err: e.message }); }
  }

  console.log(`\n${'='.repeat(72)}`);
  console.log(`RAPOR DOLDURMA DENETİMİ — ${kodlar.length} şablon (özel formlar hariç)`);
  console.log(`${'-'.repeat(72)}`);
  console.log(`Kontrol soruları: ${CQ} | ❌ dolmadı: ${CQM}  ⚠️ yanlış satır: ${CQW}`);
  console.log(`Bilgi alanları  : ${FD} | ❌ gerçekten dolmadı: ${FDM}  (çakışma kurbanı: ${FDC})`);
  console.log(`  ℹ️ çakışma kurbanı = sıkışık header hücresinde başka alanın ezdiği (tek başına dolar)`);
  console.log(`${'='.repeat(72)}`);
  if (bad.length) {
    console.log(`\nSorunlu şablonlar (${bad.length}):`);
    for (const r of bad) {
      if (r.err) { console.log(`  [${r.kod}] HATA: ${r.err}`); continue; }
      const parts = [];
      if (r.cqMiss.length) parts.push(`soru-dolmadı: ${r.cqMiss.join(',')}`);
      if (r.cqWrong.length) parts.push(`soru-yanlış: ${r.cqWrong.join(',')}`);
      if (r.fdMiss.length) parts.push(`alan-dolmadı: ${r.fdMiss.join(',')}`);
      console.log(`  [${r.kod}] ${parts.join(' | ')}`);
    }
  } else {
    console.log('\n✅ Tüm şablonlar temiz doluyor.');
  }
})().catch(e => { console.error(e); process.exit(1); });
