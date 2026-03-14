/**
 * Hava Tankı Muayene Raporu Word Oluşturma Servisi
 * FR7.2.156 Hava Tankı Muayene ve Ölçüm Raporu
 * kompresorWordService.js pattern'i takip edilir
 */

const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');

const TEMPLATE_PATH = path.join(__dirname, '../templates/mekanik/basınçlı malzemeler/FR7.2.156 Hava Tankı Muayene ve Ölçüm Raporu-1.docx');

// ============ YARDIMCI FONKSİYONLAR ============

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function escapeXml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// ============ HÜCRE İŞLEMLERİ ============

// Calibri 8pt (16 half-points) font özellikleri
const FONT_RPR = '<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr>';

function writeToCell(cellXml, newText, opts = {}) {
    const escapedText = escapeXml(newText || '-');

    if (!/<w:t[ >]/.test(cellXml)) {
        if (/<w:pPr>[\s\S]*?<\/w:pPr>/.test(cellXml)) {
            return cellXml.replace(
                /(<\/w:pPr>)/,
                `$1<w:r>${FONT_RPR}<w:t xml:space="preserve">${escapedText}</w:t></w:r>`
            );
        }
        return cellXml.replace(
            /(<\/w:p>)/,
            `<w:r>${FONT_RPR}<w:t xml:space="preserve">${escapedText}</w:t></w:r>$1`
        );
    }

    let firstReplaced = false;
    let result = cellXml.replace(/<w:t([^>]*)>([^<]*)<\/w:t>/g, (match, attrs, oldText) => {
        if (!firstReplaced) {
            firstReplaced = true;
            return `<w:t xml:space="preserve">${escapedText}</w:t>`;
        }
        return '<w:t></w:t>';
    });

    // Mevcut run'lardaki font boyutlarını Calibri 8pt'ye normalize et
    result = result.replace(/<w:sz w:val="\d+"/g, '<w:sz w:val="16"');
    result = result.replace(/<w:szCs w:val="\d+"/g, '<w:szCs w:val="16"');
    result = result.replace(/<w:rFonts[^>]*\/>/g, '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>');
    result = result.replace(/<w:r>(\s*)<w:t/g, `<w:r>$1${FONT_RPR}<w:t`);

    return result;
}

function getRowText(rowXml) {
    const matches = rowXml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
    return matches.map(t => t.replace(/<[^>]+>/g, '')).join('').trim();
}

function getCellText(cellXml) {
    const matches = cellXml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
    return matches.map(t => t.replace(/<[^>]+>/g, '')).join('').trim();
}

// ============ ETİKET BAZLI DEĞİŞTİRME ============

function setValueByLabel(xml, labelText, newValue) {
    const rowRegex = /<w:tr[^>]*>[\s\S]*?<\/w:tr>/g;
    const rows = xml.match(rowRegex) || [];
    let result = xml;

    for (const row of rows) {
        const rowText = getRowText(row);
        if (!rowText.includes(labelText)) continue;

        const cellRegex = /<w:tc[^>]*>[\s\S]*?<\/w:tc>/g;
        const cells = row.match(cellRegex) || [];

        for (let i = 0; i < cells.length; i++) {
            const cellText = getCellText(cells[i]).trim();
            if (cellText.includes(labelText)) {
                if (i + 1 < cells.length) {
                    const newCell = writeToCell(cells[i + 1], newValue);
                    const newRow = row.replace(cells[i + 1], newCell);
                    result = result.replace(row, newRow);
                    return result;
                }
            }
        }
    }

    return result;
}

/**
 * Kontrol kriteri satırında, etiketin hemen sağındaki hücreye değer yaz.
 * Şablonda 4 sütunlu satırlar var: [kriter1][değer1][kriter2][değer2]
 * Bu yüzden "son hücre" değil, etiketin bulunduğu hücrenin +1'ine yazmak gerekir.
 */
function setKontrolSorusu(xml, soruText, deger) {
    if (!deger) return xml;

    const rowRegex = /<w:tr[^>]*>[\s\S]*?<\/w:tr>/g;
    const rows = xml.match(rowRegex) || [];

    for (const row of rows) {
        const rowText = getRowText(row);
        if (!rowText.includes(soruText)) continue;

        const cellRegex = /<w:tc[^>]*>[\s\S]*?<\/w:tc>/g;
        const cells = row.match(cellRegex) || [];

        // Etiketin bulunduğu hücreyi bul, sağındakine yaz
        for (let i = 0; i < cells.length; i++) {
            const cellText = getCellText(cells[i]);
            if (cellText.includes(soruText) && i + 1 < cells.length) {
                const newCell = writeToCell(cells[i + 1], deger, { stripColor: true });
                const newRow = row.replace(cells[i + 1], newCell);
                return xml.replace(row, newRow);
            }
        }
    }

    return xml;
}

/**
 * Test değerleri tablosu için: satırda belirli bir hücre index'ine yaz.
 * R10: [Hidrostatik Test] [tarih] [değer]
 * R11: [Emniyet Valfi Testi] [tarih] [değer]
 */
function setTestRow(xml, soruText, tarih, deger) {
    const rowRegex = /<w:tr[^>]*>[\s\S]*?<\/w:tr>/g;
    const rows = xml.match(rowRegex) || [];

    for (const row of rows) {
        const rowText = getRowText(row);
        if (!rowText.includes(soruText)) continue;

        const cellRegex = /<w:tc[^>]*>[\s\S]*?<\/w:tc>/g;
        const cells = row.match(cellRegex) || [];

        if (cells.length >= 3) {
            let newRow = row;
            // 2. hücre = test tarihi
            if (tarih) {
                const newCell1 = writeToCell(cells[1], tarih);
                newRow = newRow.replace(cells[1], newCell1);
            }
            // 3. hücre = test değeri
            if (deger) {
                // cells[2] referansı değişmiş olabilir, tekrar parse et
                const updatedCells = newRow.match(cellRegex) || [];
                if (updatedCells.length >= 3) {
                    const newCell2 = writeToCell(updatedCells[2], deger);
                    newRow = newRow.replace(updatedCells[2], newCell2);
                }
            }
            return xml.replace(row, newRow);
        }
    }

    return xml;
}

// ============ ANA FONKSİYON ============

async function generateHavaTankiWord(rapor, isEmri, options = {}) {
    const templateContent = fs.readFileSync(TEMPLATE_PATH);
    const zip = await JSZip.loadAsync(templateContent);
    let docXml = await zip.file('word/document.xml').async('string');

    const firma = isEmri?.customer || {};
    const firmaBilgi = isEmri?.firmaBilgi || {};

    // === 1. FİRMA & RAPOR BİLGİLERİ (header2.xml'de) ===
    const headerFile = zip.file('word/header2.xml');
    if (headerFile) {
        let headerXml = await headerFile.async('string');
        headerXml = setValueByLabel(headerXml, 'Firma Adı', firma.unvan);
        headerXml = setValueByLabel(headerXml, 'Adresi', firma.adres);
        headerXml = setValueByLabel(headerXml, 'Tel/Fax', firma.telefon);
        headerXml = setValueByLabel(headerXml, 'E-mail', firma.email);
        headerXml = setValueByLabel(headerXml, 'Web', firma.web || '-');
        headerXml = setValueByLabel(headerXml, 'Bölümü', rapor.bolumu || options.bolumu);
        headerXml = setValueByLabel(headerXml, 'Kontrol Tarihi', formatDate(rapor.kontrolTarihi || options.kontrolTarihi));
        headerXml = setValueByLabel(headerXml, 'Rapor Tarihi', formatDate(rapor.raporTarihi || options.raporTarihi));
        headerXml = setValueByLabel(headerXml, 'Sonraki Kontrol Tarihi', formatDate(rapor.sonrakiKontrolTarihi || options.sonrakiKontrolTarihi));
        headerXml = setValueByLabel(headerXml, 'Rapor No', rapor.raporNo);
        headerXml = setValueByLabel(headerXml, 'SGK Sicil No', firmaBilgi.sgkSicilNo);
        headerXml = setValueByLabel(headerXml, 'İSG-KATİP Sözleşme ID', firmaBilgi.isgKatipId);
        zip.file('word/header2.xml', headerXml);
    }

    // === 2. EKİPMAN TEKNİK ÖZELLİKLERİ ===
    // R1-R5: 4 sütunlu satırlar [label][value][label][value]
    docXml = setValueByLabel(docXml, 'Markası', rapor.markasi || options.markasi);
    docXml = setValueByLabel(docXml, 'Tasarım Basıncı', rapor.tasarimBasinci || options.tasarimBasinci);
    docXml = setValueByLabel(docXml, 'Tip', rapor.tip || options.tip);
    docXml = setValueByLabel(docXml, 'Üretim Test Basıncı', rapor.uretimTestBasinci || options.uretimTestBasinci);
    docXml = setValueByLabel(docXml, 'Seri No', rapor.seriNo || options.seriNo);
    docXml = setValueByLabel(docXml, 'İşletme Basıncı', rapor.isletmeBasinci || options.isletmeBasinci);
    docXml = setValueByLabel(docXml, 'İmalat Yılı', rapor.imalatYili || options.imalatYili);
    docXml = setValueByLabel(docXml, 'Test Basıncı', rapor.testBasinci || options.testBasinci);
    docXml = setValueByLabel(docXml, 'Hacmi (lt)', rapor.hacmi || options.hacmi);
    docXml = setValueByLabel(docXml, 'Emniyet Ventilleri Açma Basıncı', rapor.emniyetVentilAcmaBasinci || options.emniyetVentilAcmaBasinci);

    // === 3. BASINÇ KAYNAĞI BİLGİLERİ ===
    // R7: [Basınç kaynağı adı][değer][Basınç kaynağı seri numarası][değer]
    docXml = setValueByLabel(docXml, 'Basınç kaynağı adı', rapor.basincKaynagiAdi || options.basincKaynagiAdi);
    docXml = setValueByLabel(docXml, 'Basınç kaynağı seri numarası', rapor.basincKaynagiSeriNo || options.basincKaynagiSeriNo);

    // === 4. TEST DEĞERLERİ ===
    // R10: [Hidrostatik Test][tarih][değer(bar)]
    // R11: [Emniyet Valfi Testi][tarih][değer(bar)]
    const testTarihi = formatDate(rapor.testTarihi || options.testTarihi);
    docXml = setTestRow(docXml, 'Hidrostatik Test', testTarihi, rapor.hidrostatikTestDegeri || options.hidrostatikTestDegeri);
    docXml = setTestRow(docXml, 'Emniyet Valfi Testi', testTarihi, rapor.emniyetValfiTestiDegeri || options.emniyetValfiTestiDegeri);

    // === 5. KONTROL KRİTERLERİ VE TESTLER ===
    // R19-R23: 4 sütunlu satırlar [kriter][değerlendirme][kriter][değerlendirme]
    // R25: 4 sütunlu [test][değerlendirme][test][değerlendirme]
    const kriterler = [
        { field: 'kriter1', text: 'Bilgi etiketi' },
        { field: 'kriter2', text: 'İşletme talimatları' },
        { field: 'kriter3', text: 'Tank üzerinde işlemler' },
        { field: 'kriter4', text: 'Tank yüzeyleri' },
        { field: 'kriter5', text: 'giriş açıklıkları' },
        { field: 'kriter6', text: 'Boşaltma tertibatları' },
        { field: 'kriter7', text: 'titreşimden korunması' },
        { field: 'kriter8', text: 'manometre' },
        { field: 'kriter9', text: 'Emniyet valfleri' },
        { field: 'kriter10', text: 'mekanik darbelere' },
        { field: 'testHidrostatik', text: 'Hidrostatik test' },
        { field: 'testEmniyetValfi', text: 'Emniyet valfi testi' }
    ];

    for (const kriter of kriterler) {
        const deger = rapor[kriter.field] || options[kriter.field];
        if (deger) {
            docXml = setKontrolSorusu(docXml, kriter.text, deger);
        }
    }

    // === 6. KUSUR AÇIKLAMALARI ===
    if (rapor.kusurAciklama || options.kusurAciklama) {
        docXml = fillKusurTable(docXml, rapor.kusurAciklama || options.kusurAciklama);
    }

    // === 7. NOTLAR ===
    if (rapor.notlar || options.notlar) {
        docXml = fillNotlarTable(docXml, rapor.notlar || options.notlar);
    }

    // === 8. SONUÇ (renkli) ===
    const sonucUygun = (rapor.genelSonuc || options.genelSonuc) === 'UYGUN';
    const sonucMetni = sonucUygun ? 'uygundur' : 'uygun değildir';
    const sonucRenk = sonucUygun ? '059669' : 'DC2626';

    docXml = docXml.replace(
        /(<w:r\b[^>]*>)([\s\S]*?)(<w:t[^>]*>)\s*(uygundur)\s*(<\/w:t>)/i,
        (match, rOpen, rContent, tOpen, oldText, tClose) => {
            const colorTag = `<w:color w:val="${sonucRenk}"/>`;
            const boldTag = '<w:b/>';
            if (rContent.includes('<w:rPr>')) {
                let newContent = rContent;
                if (newContent.includes('<w:color')) {
                    newContent = newContent.replace(/<w:color[^/]*\/>/g, colorTag);
                } else {
                    newContent = newContent.replace('</w:rPr>', `${colorTag}${boldTag}</w:rPr>`);
                }
                return `${rOpen}${newContent}${tOpen}${escapeXml(sonucMetni)}${tClose}`;
            } else {
                return `${rOpen}<w:rPr>${colorTag}${boldTag}</w:rPr>${rContent}${tOpen}${escapeXml(sonucMetni)}${tClose}`;
            }
        }
    );

    // === 9. YETKİLİ KİŞİ ===
    if (options.tekniker) {
        docXml = setValueByLabel(docXml, 'Adı, Soyadı', options.tekniker.adSoyad);
        docXml = setValueByLabel(docXml, 'Unvanı', options.tekniker.unvan || 'Mekanik Kontrol Sorumlusu');
        docXml = setValueByLabel(docXml, 'Mesleği', options.tekniker.meslek || 'Makine Teknikeri');
        docXml = setValueByLabel(docXml, 'Diploma Tarihi', formatDate(options.tekniker.diplomaTarihi));
        docXml = setValueByLabel(docXml, 'Diploma Numarası', options.tekniker.diplomaNo);
        docXml = setValueByLabel(docXml, 'Ekipnet Kayıt No', options.tekniker.ekipnetNo);
    }

    zip.file('word/document.xml', docXml);

    return await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 9 }
    });
}

function fillKusurTable(docXml, kusurText) {
    if (!kusurText) return docXml;

    const tableRegex = /<w:tbl>[\s\S]*?<\/w:tbl>/g;
    const tables = docXml.match(tableRegex) || [];

    for (const table of tables) {
        const tableText = table.replace(/<[^>]+>/g, ' ');
        if (tableText.includes('KUSUR AÇIKLAMALARI') || tableText.includes('Kusur Açıklamaları') || tableText.includes('kusurlu')) {
            const rows = table.match(/<w:tr[^>]*>[\s\S]*?<\/w:tr>/g) || [];
            if (rows.length >= 2) {
                const dataRow = rows[rows.length - 1];
                const cells = dataRow.match(/<w:tc[^>]*>[\s\S]*?<\/w:tc>/g) || [];
                if (cells.length > 0) {
                    const newCell = writeToCell(cells[0], kusurText);
                    const newRow = dataRow.replace(cells[0], newCell);
                    const newTable = table.replace(dataRow, newRow);
                    return docXml.replace(table, newTable);
                }
            }
        }
    }

    return docXml;
}

function fillNotlarTable(docXml, notlarText) {
    if (!notlarText) return docXml;

    const tableRegex = /<w:tbl>[\s\S]*?<\/w:tbl>/g;
    const tables = docXml.match(tableRegex) || [];

    for (const table of tables) {
        const tableText = table.replace(/<[^>]+>/g, ' ');
        if (tableText.includes('NOTLAR') && !tableText.includes('KUSUR')) {
            const rows = table.match(/<w:tr[^>]*>[\s\S]*?<\/w:tr>/g) || [];
            if (rows.length >= 2) {
                const dataRow = rows[rows.length - 1];
                const cells = dataRow.match(/<w:tc[^>]*>[\s\S]*?<\/w:tc>/g) || [];
                if (cells.length > 0) {
                    const newCell = writeToCell(cells[0], notlarText);
                    const newRow = dataRow.replace(cells[0], newCell);
                    const newTable = table.replace(dataRow, newRow);
                    return docXml.replace(table, newTable);
                }
            }
        }
    }

    return docXml;
}

module.exports = {
    generateHavaTankiWord
};
