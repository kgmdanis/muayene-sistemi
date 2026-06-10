/**
 * Şablon (config) ↔ HTML form ↔ Word(.docx) EŞLEŞME denetimi (read-only).
 * - Her config'in wordMapping.templatePath .docx dosyası diskte var mı?
 * - Hangi HTML forma yönleniyor (özel form mü generic mi)?
 * - Özel form FR kodları doğru mu?
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CFG_DIR = path.join(ROOT, 'services', 'templateConfigs');

// app.js OZEL_FORM_KOD_MAP ile aynı olmalı
const OZEL_FORM = {
    'FR7.2.36': 'elektrik-topraklama-form-v2.html',
    'FR7.2.40': 'elektrik-ic-tesisat-form.html',
    'FR7.2.21': 'kompresor-form.html',
    'FR7.2.156': 'hava-tanki-form.html'
};
const FORMS_DIR = path.join(ROOT, 'public', 'forms');

const files = fs.readdirSync(CFG_DIR).filter(f => f.endsWith('.json'));

const docxYok = [];      // config var ama .docx yok
const pathYok = [];      // config'te templatePath tanımsız
const ozelForm = [];     // özel HTML forma giden
const generic = [];      // generic forma giden (.docx var)
let toplam = 0;

for (const f of files) {
    let c;
    try { c = JSON.parse(fs.readFileSync(path.join(CFG_DIR, f), 'utf8')); }
    catch { console.log('BOZUK JSON:', f); continue; }
    if (!c.sablonKodu) continue;
    toplam++;

    const tp = c.wordMapping && c.wordMapping.templatePath;
    const ozel = OZEL_FORM[c.sablonKodu];

    if (!tp) {
        pathYok.push(c.sablonKodu + '  ' + (c.sablonAdi || ''));
    } else {
        const full = path.join(ROOT, tp);
        if (!fs.existsSync(full)) docxYok.push(`${c.sablonKodu}  →  ${tp}`);
    }

    if (ozel) ozelForm.push(`${c.sablonKodu} → ${ozel}`);
    else generic.push(c.sablonKodu);
}

// Özel form HTML'leri gerçekten var mı?
console.log('\n=== ÖZEL FORM HTML DOSYALARI ===');
for (const [kod, html] of Object.entries(OZEL_FORM)) {
    const varMi = fs.existsSync(path.join(FORMS_DIR, html));
    const cfgVar = files.some(f => { try { return JSON.parse(fs.readFileSync(path.join(CFG_DIR, f))).sablonKodu === kod; } catch { return false; } });
    console.log(`  ${kod} → ${html}  [HTML:${varMi ? 'VAR' : 'YOK ❌'}] [config:${cfgVar ? 'VAR' : 'YOK ❌'}]`);
}

console.log(`\n=== GENEL ===`);
console.log(`  Toplam config: ${toplam}`);
console.log(`  Özel forma giden: ${ozelForm.length}  |  Generic forma giden: ${generic.length}`);
console.log(`  ⚠️ templatePath tanımsız: ${pathYok.length}  |  ❌ .docx dosyası eksik: ${docxYok.length}`);

console.log(`\n❌ WORD ŞABLONU (.docx) EKSİK OLAN CONFIG'LER (${docxYok.length}):`);
docxYok.forEach(x => console.log('   • ' + x));

console.log(`\n⚠️ templatePath TANIMSIZ CONFIG'LER (${pathYok.length}):`);
pathYok.forEach(x => console.log('   • ' + x));

console.log(`\n=== ÖZEL FORMA YÖNLENENLER ===`);
ozelForm.forEach(x => console.log('   • ' + x));
