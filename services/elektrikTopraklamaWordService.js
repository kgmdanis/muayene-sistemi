/**
 * Elektrik Topraklama Raporu Word Oluşturma Servisi
 * Etiket bazlı akıllı değiştirme - şablondaki örnek değerlere bağımlı değil
 */

const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');

const TEMPLATE_PATH = path.join(__dirname, '../templates/elektrik/FR7.2.36 Elektrik Topraklama Ölçüm Raporu-1.docx');

// ============ YARDIMCI FONKSİYONLAR ============

/**
 * Tarihi Türkçe formata çevir
 */
function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Tarih ve saat formatı
 */
function formatDateTime(dateStr, time = '09:00') {
    if (!dateStr) return '-';
    return `${formatDate(dateStr)} / ${time}`;
}

/**
 * Bir sonraki yıl tarihini hesapla
 */
function getNextYearDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '-';
    date.setFullYear(date.getFullYear() + 1);
    return formatDate(date);
}

/**
 * XML için özel karakterleri escape et
 */
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

/**
 * Hücreye metin yaz - mevcut içeriği değiştirerek
 */
function writeToCell(cellXml, newText) {
    const escapedText = escapeXml(newText || '-');

    // Hücrede hiç w:t yoksa (dikkat: <w:tc>, <w:tcPr> ile karıştırma!)
    if (!/<w:t[ >]/.test(cellXml)) {
        // w:pPr (paragraph properties) varsa onun sonrasına ekle
        if (/<w:pPr>[\s\S]*?<\/w:pPr>/.test(cellXml)) {
            return cellXml.replace(
                /(<\/w:pPr>)/,
                `$1<w:r><w:t xml:space="preserve">${escapedText}</w:t></w:r>`
            );
        }
        // w:pPr yoksa </w:p> öncesine ekle
        return cellXml.replace(
            /(<\/w:p>)/,
            `<w:r><w:t xml:space="preserve">${escapedText}</w:t></w:r>$1`
        );
    }

    // İlk w:t'yi değiştir, diğerlerini boşalt
    let firstReplaced = false;
    return cellXml.replace(/<w:t([^>]*)>([^<]*)<\/w:t>/g, (match, attrs, oldText) => {
        if (!firstReplaced) {
            firstReplaced = true;
            return `<w:t xml:space="preserve">${escapedText}</w:t>`;
        }
        return '<w:t></w:t>';
    });
}

/**
 * Satırdaki tüm metni birleştir
 */
function getRowText(rowXml) {
    const matches = rowXml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
    return matches.map(t => t.replace(/<[^>]+>/g, '')).join('').trim();
}

/**
 * Hücredeki metni al
 */
function getCellText(cellXml) {
    const matches = cellXml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
    return matches.map(t => t.replace(/<[^>]+>/g, '')).join('').trim();
}

// ============ ETİKET BAZLI DEĞİŞTİRME ============

/**
 * Belirli bir etiketin yanındaki (sağındaki) hücreye değer yaz
 */
function setValueByLabel(xml, labelText, newValue) {
    const rowRegex = /<w:tr[^>]*>[\s\S]*?<\/w:tr>/g;
    const rows = xml.match(rowRegex) || [];
    let result = xml;

    for (const row of rows) {
        const rowText = getRowText(row);

        // Bu satırda etiket var mı?
        if (!rowText.includes(labelText)) continue;

        // Hücreleri bul
        const cellRegex = /<w:tc[^>]*>[\s\S]*?<\/w:tc>/g;
        const cells = row.match(cellRegex) || [];

        for (let i = 0; i < cells.length; i++) {
            const cellText = getCellText(cells[i]).trim();

            // Bu hücre tam olarak etiketi içeriyor mu?
            if (cellText.includes(labelText)) {
                // Hemen sağdaki hücreye yaz (i+1)
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
 * Checkbox işaretle (FORMCHECKBOX sonrasındaki metne göre)
 * Word'de checkbox: ☑ checked, ☐ unchecked olarak gösterilir
 */
function setCheckbox(xml, checkboxLabel, isChecked) {
    // FORMCHECKBOX ve ardından gelen metni bul
    // Şimdilik basit replace kullanalım
    // İleride daha gelişmiş checkbox yönetimi eklenebilir
    return xml;
}

// ============ ANA FONKSİYON ============

/**
 * Word raporu oluştur
 */
async function generateElektrikTopraklamaWord(rapor, isEmri, olcumler = [], options = {}) {
    // Şablonu oku
    const templateContent = fs.readFileSync(TEMPLATE_PATH);
    const zip = await JSZip.loadAsync(templateContent);
    let docXml = await zip.file('word/document.xml').async('string');

    // Firma bilgileri
    const firma = isEmri?.customer || {};
    const firmaBilgi = isEmri?.firmaBilgi || {};

    // === 1. FİRMA BİLGİLERİ ===
    docXml = setValueByLabel(docXml, 'Firma Adı', firma.unvan);
    docXml = setValueByLabel(docXml, 'Rapor Numarası', rapor.raporNo);
    docXml = setValueByLabel(docXml, 'Periyodik Kontrol Adresi', firma.adres);
    docXml = setValueByLabel(docXml, 'Rapor Tarihi', formatDate(rapor.bitisTarihi || new Date()));
    docXml = setValueByLabel(docXml, 'İSG-KATİP Sözleşme ID', rapor.isgKatipNo || firmaBilgi.isgKatipId);
    docXml = setValueByLabel(docXml, 'SGK Sicil Numarası', rapor.sgkSicilNo || firmaBilgi.sgkSicilNo);
    docXml = setValueByLabel(docXml, 'Başlangıç Tarihi ve Saati', formatDateTime(rapor.baslangicTarihi, options.baslangicSaati || '09:00'));
    docXml = setValueByLabel(docXml, 'Bitiş Tarihi ve Saati', formatDateTime(rapor.bitisTarihi, options.bitisSaati || '17:00'));
    docXml = setValueByLabel(docXml, 'Sonraki Periyodik Kontrol Tarihi', getNextYearDate(rapor.bitisTarihi));

    // === 2. EKİPMAN BİLGİLERİ ===
    docXml = setValueByLabel(docXml, 'Enerji sağlayan kuruluş', options.enerjiSaglayan || 'MEDAŞ');
    docXml = setValueByLabel(docXml, 'Şebeke gerilimi', options.sebekeGerilimi || '380');
    docXml = setValueByLabel(docXml, 'Proje bilgileri', options.projeBilgileri || '-');
    docXml = setValueByLabel(docXml, 'Ekipmanın kullanım amacı', options.kullanimAmaci || firma.spiKodu || 'FABRİKA');
    docXml = setValueByLabel(docXml, 'Son kontrol tarihi', formatDate(options.sonKontrolTarihi) || '-');
    docXml = setValueByLabel(docXml, 'Hava durumu ve sıcaklığı', `${rapor.ortamSicaklik || 25} °C`);
    docXml = setValueByLabel(docXml, 'Zemin nem durumu', rapor.ortamNem ? (rapor.ortamNem < 50 ? 'KURU' : 'NORMAL') : 'KURU');

    // === 3. ÖLÇÜM CİHAZI ===
    if (rapor.topraklamaCihaz) {
        docXml = setValueByLabel(docXml, 'Cihaz adı', rapor.topraklamaCihaz.cihazAdi || 'Chauvin Arnoux');
        docXml = setValueByLabel(docXml, 'Seri numarası', rapor.topraklamaCihaz.seriNo);
        docXml = setValueByLabel(docXml, 'Kalibrasyon tarihi', formatDate(rapor.topraklamaCihaz.kalibrasyonTarihi));
    }

    // === 4. ÖLÇÜM TABLOSU ===
    if (olcumler && olcumler.length > 0) {
        docXml = fillMeasurementTable(docXml, olcumler, rapor.sistemTipi || 'TN');
    }

    // === 5. SONUÇ ===
    const sonucMetni = rapor.genelSonuc === 'UYGUN' ? 'UYGUNDUR' : 'UYGUN DEĞİLDİR';

    // Sonuç cümlesindeki UYGUNDUR/UYGUN DEĞİLDİR metnini değiştir
    docXml = docXml.replace(
        /(kullanımı\s*\d*\s*yıl\s*süreyle[;:]*\s*)(UYGUNDUR|UYGUN DEĞİLDİR)/gi,
        `$1${sonucMetni}`
    );

    // === 6. YETKİLİ KİŞİ ===
    if (options.tekniker) {
        docXml = setValueByLabel(docXml, 'Adı Soyadı', options.tekniker.adSoyad);
        docXml = setValueByLabel(docXml, 'Mesleği', options.tekniker.meslek || 'Elektrik Teknikeri');
        docXml = setValueByLabel(docXml, 'Diploma No', options.tekniker.diplomaNo);
        docXml = setValueByLabel(docXml, 'Ekipnet', options.tekniker.ekipnetNo);
    }

    // === 7. NOTLAR ===
    if (options.notlar) {
        // Not alanını bul ve değiştir
        docXml = setValueByLabel(docXml, 'Açıklama', options.notlar);
    }

    // Güncellenmiş XML'i kaydet
    zip.file('word/document.xml', docXml);

    // Yeni dosyayı oluştur
    return await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 9 }
    });
}

/**
 * Ölçüm tablosunu doldur
 * Şablondaki mevcut ölçüm satırlarını bul ve değiştir
 */
function fillMeasurementTable(docXml, olcumler, sistemTipi) {
    // Ölçüm tablosunu bul
    const tableRegex = /<w:tbl>[\s\S]*?<\/w:tbl>/g;
    const tables = docXml.match(tableRegex) || [];

    let measurementTable = null;

    // "Ölçüm noktası" veya "DOLAYLI DOKUNMAYA" içeren tabloyu bul
    for (let i = 0; i < tables.length; i++) {
        const tableText = tables[i].replace(/<[^>]+>/g, ' ');
        if (tableText.includes('Ölçüm noktası') || tableText.includes('DOLAYLI DOKUNMAYA')) {
            measurementTable = tables[i];
            break;
        }
    }

    if (!measurementTable) {
        console.log('Ölçüm tablosu bulunamadı');
        return docXml;
    }

    // Tablodaki satırları bul
    const rowRegex = /<w:tr[^>]*>[\s\S]*?<\/w:tr>/g;
    const rows = measurementTable.match(rowRegex) || [];

    // Başlık satırlarını atla (ilk 3 satır genellikle başlık)
    // Veri satırları: sayı ile başlayan satırlar (1, 2, 3, ...)

    let newTable = measurementTable;
    let dataRowIndex = 0;

    for (let i = 0; i < rows.length && dataRowIndex < olcumler.length; i++) {
        const row = rows[i];
        const rowText = getRowText(row);

        // Başlık satırlarını atla (No, In, Açma, Ölçüm noktası gibi kelimeler içeren)
        if (rowText.includes('Ölçüm noktası') ||
            rowText.includes('Açma eğrisi') ||
            rowText.includes('SON TÜKETİM') ||
            rowText.includes('Koruma Elemanı') ||
            rowText.length < 10) {
            continue;
        }

        // Sayı ile başlayan satırlar veri satırları
        const firstNum = rowText.match(/^\d+/);
        if (!firstNum) continue;

        const olcum = olcumler[dataRowIndex];
        const newRow = fillMeasurementRow(row, olcum, dataRowIndex + 1, sistemTipi);

        // Satırı değiştir - benzersiz bir şekilde bul ve değiştir
        const rowIndex = newTable.indexOf(row);
        if (rowIndex !== -1) {
            newTable = newTable.substring(0, rowIndex) + newRow + newTable.substring(rowIndex + row.length);
        }

        dataRowIndex++;
    }

    return docXml.replace(measurementTable, newTable);
}

/**
 * Tek bir ölçüm satırını doldur
 */
function fillMeasurementRow(rowXml, olcum, rowNum, sistemTipi) {
    const cellRegex = /<w:tc[^>]*>[\s\S]*?<\/w:tc>/g;
    const cells = rowXml.match(cellRegex) || [];

    if (cells.length < 10) return rowXml;

    // Hesaplamalar
    const anmaAkimi = parseFloat(olcum.anmaAkimi) || 0;
    const sigortaTipi = olcum.sigortaTipi || 'C';
    const zx = parseFloat(olcum.zx) || 0;

    // Ia hesapla
    let ia = 0;
    if (anmaAkimi) {
        if (sigortaTipi === 'B') ia = anmaAkimi * 5;
        else if (sigortaTipi === 'C') ia = anmaAkimi * 10;
        else if (sigortaTipi === 'D') ia = anmaAkimi * 20;
    }

    // Zs veya RA hesapla
    let zsra = 0;
    if (ia > 0) {
        zsra = sistemTipi === 'TN' ? (230 / ia) : (50 / ia);
    }

    // Ik hesapla
    let ik = zx > 0 ? (230 / zx) : 0;

    // Sonuç
    const sonuc = (zx > 0 && zsra > 0 && zx <= zsra) ? 'NOT-1' : 'NOT-2';

    // RCD bilgisi
    const rcdInfo = olcum.rcdVarMi ? `AC/${anmaAkimi || 40}/${olcum.rcdIAn || 30}` : '-';

    // Hücreleri değiştir (sırasıyla)
    // Tipik sıralama: No, Tablo, Pano, Şalter, In, Tip, Ia, Zs/RA, Zx, Ik, RCD, IΔn, Süre, Sonuç
    const values = [
        rowNum.toString(),                           // 0: No
        olcum.tabloAdi || olcum.panoAdi || '-',     // 1: Tablo Adı
        olcum.panoAdi || '-',                        // 2: Pano Adı
        olcum.salterAdi || '-',                      // 3: Şalter
        anmaAkimi ? anmaAkimi.toString() : '-',      // 4: In
        sigortaTipi,                                  // 5: Tip
        ia ? ia.toFixed(0) : '-',                    // 6: Ia
        zsra ? zsra.toFixed(3) : '-',                // 7: Zs/RA
        zx ? zx.toFixed(2) : '-',                    // 8: Zx
        ik ? ik.toFixed(0) : '-',                    // 9: Ik
        rcdInfo,                                      // 10: RCD
        olcum.rcdIAn || '-',                         // 11: IΔn
        olcum.rcdSure || '-',                        // 12: Süre
        sonuc                                         // 13: Sonuç
    ];

    let newRow = rowXml;
    for (let i = 0; i < Math.min(cells.length, values.length); i++) {
        const newCell = writeToCell(cells[i], values[i]);
        newRow = newRow.replace(cells[i], newCell);
    }

    return newRow;
}

/**
 * Dosyaya kaydet
 */
async function saveWordToFile(rapor, isEmri, olcumler, options, outputPath) {
    const buffer = await generateElektrikTopraklamaWord(rapor, isEmri, olcumler, options);
    fs.writeFileSync(outputPath, buffer);
    return outputPath;
}

module.exports = {
    generateElektrikTopraklamaWord,
    saveWordToFile,
    formatDate,
    formatDateTime,
    getNextYearDate
};
