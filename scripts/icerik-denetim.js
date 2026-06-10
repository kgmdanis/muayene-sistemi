/**
 * İÇERİK uyumsuzluğu denetimi (read-only).
 * Word doldurma label eşleşmesiyle yapılıyor. Bu script her config alanının `label`'ının
 * gerçekten Word .docx içinde (bir hücre olarak) bulunup bulunmadığını GERÇEK labelsMatch
 * fonksiyonuyla kontrol eder. Bulunamayan label = rapor çıktısında BOŞ kalan alan.
 */
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { normalizeLabel, getCellText } = require('../services/wordCellOperations');

// wordCellOperations.js içindeki labelsMatch ile birebir aynı (export edilmediği için kopya)
function labelsMatch(cellLabel, searchLabel) {
    const normalizedCell = normalizeLabel(cellLabel);
    const normalizedSearch = normalizeLabel(searchLabel);
    if (normalizedCell === normalizedSearch) return true;
    if (normalizedCell.startsWith(normalizedSearch + ' ') ||
        normalizedCell.startsWith(normalizedSearch + ':') ||
        normalizedCell.startsWith(normalizedSearch + '(')) return true;
    const searchWords = normalizedSearch.split(' ');
    const cellWords = normalizedCell.split(/[\s:]+/).filter(w => w);
    for (let i = 0; i <= cellWords.length - searchWords.length; i++) {
        let match = true;
        for (let j = 0; j < searchWords.length; j++) {
            if (cellWords[i + j] !== searchWords[j]) { match = false; break; }
        }
        if (match) return true;
    }
    return false;
}

const ROOT = path.join(__dirname, '..');
const CFG_DIR = path.join(ROOT, 'services', 'templateConfigs');
const OZEL = new Set(['FR7.2.36', 'FR7.2.40', 'FR7.2.21', 'FR7.2.156']); // özel HTML formlar - generic doldurma kullanmaz

async function cellTextsFromDocx(docxPath) {
    const buf = fs.readFileSync(docxPath);
    const zip = await JSZip.loadAsync(buf);
    let xml = '';
    // document.xml + tüm header*.xml
    for (const name of Object.keys(zip.files)) {
        if (/word\/(document|header\d*)\.xml$/.test(name)) {
            xml += await zip.file(name).async('string');
        }
    }
    const cells = xml.match(/<w:tc[^>]*>[\s\S]*?<\/w:tc>/g) || [];
    return cells.map(c => getCellText(c)).filter(t => t && t.trim());
}

(async () => {
    const files = fs.readdirSync(CFG_DIR).filter(f => f.endsWith('.json'));
    const sorunlu = [];
    let temiz = 0, atlanan = 0;

    for (const f of files) {
        let c;
        try { c = JSON.parse(fs.readFileSync(path.join(CFG_DIR, f), 'utf8')); } catch { continue; }
        if (!c.sablonKodu || OZEL.has(c.sablonKodu)) { atlanan++; continue; }
        const tp = c.wordMapping && c.wordMapping.templatePath;
        if (!tp) continue;
        const full = path.join(ROOT, tp);
        if (!fs.existsSync(full)) continue;

        let cellTexts;
        try { cellTexts = await cellTextsFromDocx(full); }
        catch (e) { console.log(`DOCX okunamadı: ${c.sablonKodu} (${e.message})`); continue; }

        const fields = [...(c.wordMapping.headerFields || []), ...(c.wordMapping.fields || [])];
        const eksikLabellar = [];
        for (const fld of fields) {
            if (!fld.label) continue;
            // Word'de bu label'a eşleşen bir hücre var mı?
            const bulundu = cellTexts.some(ct => labelsMatch(ct, fld.label));
            if (!bulundu) eksikLabellar.push(fld.label);
        }

        if (eksikLabellar.length) sorunlu.push({ kod: c.sablonKodu, ad: c.sablonAdi, eksik: eksikLabellar, toplam: fields.filter(x => x.label).length });
        else temiz++;
    }

    sorunlu.sort((a, b) => b.eksik.length - a.eksik.length);

    console.log(`\n📊 İÇERİK DENETİMİ — Generic config'ler`);
    console.log(`   ✅ Temiz: ${temiz}  |  ⚠️ İçerik uyumsuz: ${sorunlu.length}  |  (özel form atlandı: ${atlanan})`);

    console.log(`\n⚠️ WORD'DE BULUNAMAYAN LABEL'LAR (rapor çıktısında boş kalır):`);
    for (const s of sorunlu) {
        console.log(`\n• ${s.kod} - ${s.ad}  (${s.eksik.length}/${s.toplam} alan eşleşmiyor)`);
        s.eksik.forEach(l => console.log(`     ✗ "${l}"`));
    }
    process.exit(0);
})();
