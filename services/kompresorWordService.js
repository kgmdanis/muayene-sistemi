/**
 * Kompresör Muayene Raporu Word Oluşturma Servisi
 * FR7.2.21 Kompresör Muayene ve Ölçüm Raporu
 * Etiket bazlı akıllı değiştirme (checkbox yok, metin olarak Uygun/Uygun Değil)
 */

const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');

const TEMPLATE_PATH = path.join(__dirname, '../templates/mekanik/basınçlı malzemeler/FR7.2.21 Kompresör Muayene ve Ölçüm Raporu-1.docx');

// ============ YARDIMCI FONKSİYONLAR ============

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(dateStr, time = '09:00') {
    if (!dateStr) return '-';
    return `${formatDate(dateStr)} / ${time}`;
}

function getNextYearDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '-';
    date.setFullYear(date.getFullYear() + 1);
    return formatDate(date);
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

function writeToCell(cellXml, newText) {
    const escapedText = escapeXml(newText || '-');

    if (!/<w:t[ >]/.test(cellXml)) {
        if (/<w:pPr>[\s\S]*?<\/w:pPr>/.test(cellXml)) {
            return cellXml.replace(
                /(<\/w:pPr>)/,
                `$1<w:r><w:t xml:space="preserve">${escapedText}</w:t></w:r>`
            );
        }
        return cellXml.replace(
            /(<\/w:p>)/,
            `<w:r><w:t xml:space="preserve">${escapedText}</w:t></w:r>$1`
        );
    }

    let firstReplaced = false;
    return cellXml.replace(/<w:t([^>]*)>([^<]*)<\/w:t>/g, (match, attrs, oldText) => {
        if (!firstReplaced) {
            firstReplaced = true;
            return `<w:t xml:space="preserve">${escapedText}</w:t>`;
        }
        return '<w:t></w:t>';
    });
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
 * Kontrol sorusu satırında "Uygun" veya "Uygun Değil" hücresine değer yaz.
 * Kontrol tablosunda soru metni ilk hücrede, sonuç son hücrede bulunur.
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

        if (cells.length >= 2) {
            // Son hücreye sonucu yaz
            const lastCell = cells[cells.length - 1];
            const newCell = writeToCell(lastCell, deger);
            const newRow = row.replace(lastCell, newCell);
            return xml.replace(row, newRow);
        }
    }

    return xml;
}

// ============ ANA FONKSİYON ============

async function generateKompresorWord(rapor, isEmri, options = {}) {
    const templateContent = fs.readFileSync(TEMPLATE_PATH);
    const zip = await JSZip.loadAsync(templateContent);
    let docXml = await zip.file('word/document.xml').async('string');

    const firma = isEmri?.customer || {};
    const firmaBilgi = isEmri?.firmaBilgi || {};

    // === 1. FİRMA BİLGİLERİ ===
    docXml = setValueByLabel(docXml, 'Firma Adı', firma.unvan);
    docXml = setValueByLabel(docXml, 'Rapor Numarası', rapor.raporNo);
    docXml = setValueByLabel(docXml, 'Periyodik Kontrol Adresi', firma.adres);
    docXml = setValueByLabel(docXml, 'Rapor Tarihi', formatDate(rapor.bitisTarihi || new Date()));
    docXml = setValueByLabel(docXml, 'İSG-KATİP Sözleşme ID', rapor.isgKatipNo || firmaBilgi.isgKatipId);
    docXml = setValueByLabel(docXml, 'SGK Sicil Numarası', rapor.sgkSicilNo || firmaBilgi.sgkSicilNo);
    docXml = setValueByLabel(docXml, 'Periyodik Kontrol Başlangıç Tarihi ve Saati', formatDateTime(rapor.baslangicTarihi, options.baslangicSaati || '09:00'));
    docXml = setValueByLabel(docXml, 'Periyodik Kontrol Bitiş Tarihi ve Saati', formatDateTime(rapor.bitisTarihi, options.bitisSaati || '17:00'));
    docXml = setValueByLabel(docXml, 'Bir Sonraki Periyodik Kontrol Tarihi', getNextYearDate(rapor.bitisTarihi));

    // === 2. EKİPMAN BİLGİLERİ ===
    docXml = setValueByLabel(docXml, 'Markası', rapor.markasi || options.markasi);
    docXml = setValueByLabel(docXml, 'Tip', rapor.tip || options.tip);
    docXml = setValueByLabel(docXml, 'Seri No', rapor.seriNo || options.seriNo);
    docXml = setValueByLabel(docXml, 'İmalat Yılı', rapor.imalatYili || options.imalatYili);
    docXml = setValueByLabel(docXml, 'Maksimum Basınç', rapor.maksBasinc || options.maksBasinc);
    docXml = setValueByLabel(docXml, 'Durma Basıncı', rapor.durmaBasinci || options.durmaBasinci);
    docXml = setValueByLabel(docXml, 'Tekrar Çalışma', rapor.tekrarCalismaBasinci || options.tekrarCalismaBasinci);

    // === 3. KONTROL SORULARI (10 adet) - Uygun/Uygun Değil ===
    const sorular = [
        { field: 'soru1ArizaKarti', text: 'arıza kartı' },
        { field: 'soru2TseCe', text: 'TSE/CE' },
        { field: 'soru3YagToz', text: 'yağ/toz' },
        { field: 'soru4BasincAyar', text: 'Basınç ayar otomatiği' },
        { field: 'soru5KayisKasnak', text: 'Kayış-kasnak' },
        { field: 'soru6ElektrikMotor', text: 'Elektrik motoru' },
        { field: 'soru7VanaHortum', text: 'vana/hortum' },
        { field: 'soru8HavaFiltresi', text: 'Hava Filtresi' },
        { field: 'soru9YanginSondurucu', text: 'Yangın söndürücü' },
        { field: 'soru10UyariTalimat', text: 'Uyarı ve kullanma talimatı' }
    ];

    for (const soru of sorular) {
        const deger = rapor[soru.field] || options[soru.field];
        if (deger) {
            docXml = setKontrolSorusu(docXml, soru.text, deger);
        }
    }

    // === 4. KUSUR AÇIKLAMALARI ===
    if (rapor.kusurAciklama || options.kusurAciklama) {
        docXml = fillKusurTable(docXml, rapor.kusurAciklama || options.kusurAciklama);
    }

    // === 5. NOTLAR ===
    if (rapor.notlar || options.notlar) {
        docXml = fillNotlarTable(docXml, rapor.notlar || options.notlar);
    }

    // === 6. SONUÇ ===
    const sonucMetni = rapor.genelSonuc === 'UYGUN' ? 'uygundur' : 'uygun değildir';
    docXml = docXml.replace(
        /(kullanımı\s*)(uygundur|uygun değildir)/gi,
        `$1${sonucMetni}`
    );

    // === 7. YETKİLİ KİŞİ ===
    if (options.tekniker) {
        docXml = setValueByLabel(docXml, 'Adı, Soyadı', options.tekniker.adSoyad);
        docXml = setValueByLabel(docXml, 'Unvanı', options.tekniker.unvan || 'Mekanik Kontrol Sorumlusu');
        docXml = setValueByLabel(docXml, 'Mesleği', options.tekniker.meslek || 'Makine Teknikeri');
        docXml = setValueByLabel(docXml, 'Diploma Tarihi', formatDate(options.tekniker.diplomaTarihi));
        docXml = setValueByLabel(docXml, 'Diploma Numarası', options.tekniker.diplomaNo);
        docXml = setValueByLabel(docXml, 'Ekipnet Kayıt No', options.tekniker.ekipnetNo);
    }

    // Güncellenmiş XML'i kaydet
    zip.file('word/document.xml', docXml);

    return await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 9 }
    });
}

/**
 * Kusur açıklamalarını doldur
 */
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

/**
 * Notlar tablosunu doldur
 */
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

async function saveWordToFile(rapor, isEmri, options, outputPath) {
    const buffer = await generateKompresorWord(rapor, isEmri, options);
    fs.writeFileSync(outputPath, buffer);
    return outputPath;
}

module.exports = {
    generateKompresorWord,
    saveWordToFile,
    formatDate,
    formatDateTime,
    getNextYearDate,
    setValueByLabel,
    setKontrolSorusu,
    fillKusurTable,
    fillNotlarTable
};
