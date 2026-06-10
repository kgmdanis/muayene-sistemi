/**
 * FR7.2.38 (Jeneratör) ve FR7.2.71 (Katodik Koruma) elektrik şablonlarının
 * header2.xml firma bloğuna "SGK Sicil No" ve "İSG-KATİP Sözleşme ID" satırı ekler.
 * Bu alanlar formda toplanıyordu ama Word'de hedef hücre yoktu → rapora basılmıyordu.
 *
 * Yeni satır yapısı: [SGK Sicil No :][değer][İSG-KATİP Sözleşme ID :][değer]
 * Değer hücrelerine setValueByLabel (genericWordService) firmaBilgi.sgkSicilNo /
 * firmaBilgi.isgKatipId yazar; eşleşme labelsMatch ile doğrulandı.
 */
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { writeToCell, getCellText } = require('../services/wordCellOperations');

const ROOT = path.join(__dirname, '..');
const CELL_RE = /<w:tc[^>]*>[\s\S]*?<\/w:tc>/g;
const ROW_RE = /<w:tr\b[\s\S]*?<\/w:tr>/g;

async function processTemplate(kod) {
    const c = JSON.parse(fs.readFileSync(path.join(ROOT, 'services/templateConfigs', kod + '.json'), 'utf8'));
    const docxPath = path.join(ROOT, c.wordMapping.templatePath);

    // Yedek
    const bak = docxPath + '.bak';
    if (!fs.existsSync(bak)) fs.copyFileSync(docxPath, bak);

    const zip = await JSZip.loadAsync(fs.readFileSync(docxPath));
    let xml = await zip.file('word/header2.xml').async('string');

    const rows = xml.match(ROW_RE) || [];
    // "Web" satırını bul (firma bloğunun son satırı, ekleme noktası + klon kaynağı)
    const webRow = rows.find(r => {
        const cells = (r.match(CELL_RE) || []).map(getCellText);
        return cells[0] && /^Web/.test(cells[0].trim());
    });
    if (!webRow) throw new Error(kod + ': Web satırı bulunamadı');

    // Zaten eklenmiş mi?
    if (/SGK Sicil/.test(getCellText(webRow)) || rows.some(r => /SGK Sicil/.test(getCellText(r)))) {
        console.log(`  ${kod}: SGK Sicil satırı zaten mevcut, atlandı`);
        return;
    }

    const cells = webRow.match(CELL_RE) || [];
    if (cells.length < 4) throw new Error(kod + ': Web satırında 4 hücre yok (' + cells.length + ')');

    // Klonu kur — orijinal hücre stringleri webRow içinde benzersiz; sondan başa replace
    let newRow = webRow;
    newRow = newRow.replace(cells[3], writeToCell(cells[3], ''));                              // değer
    newRow = newRow.replace(cells[2], writeToCell(cells[2], 'İSG-KATİP Sözleşme ID  :'));      // etiket
    newRow = newRow.replace(cells[1], writeToCell(cells[1], ''));                              // değer
    newRow = newRow.replace(cells[0], writeToCell(cells[0], 'SGK Sicil No      :'));           // etiket

    // Web satırından sonra ekle
    xml = xml.replace(webRow, webRow + newRow);

    zip.file('word/header2.xml', xml);
    const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    fs.writeFileSync(docxPath, out);
    console.log(`  ${kod}: satır eklendi → ${path.basename(docxPath)}`);
}

(async () => {
    console.log('Elektrik firma satırı ekleme:');
    for (const kod of ['FR7.2.38', 'FR7.2.71']) {
        await processTemplate(kod);
    }
    console.log('Tamamlandı.');
})().catch(e => { console.error('HATA:', e.message); process.exit(1); });
