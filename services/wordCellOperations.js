/**
 * Word Hücre İşlemleri - Ortak Modül
 */

const { escapeXml } = require('./wordHelpers');

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
    // rPr'si olmayan run'lara font ekle
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

/**
 * Label metnini normalize et - boşlukları, iki noktaları temizle, Türkçe karakter normalize et
 */
function normalizeLabel(text) {
    return text
        .replace(/\s+/g, ' ')           // Çoklu boşlukları tek boşluğa
        .replace(/\s*:\s*$/g, '')        // Sondaki iki noktayı kaldır
        .trim()
        .toLowerCase()
        // Türkçe karakter normalizasyonu
        .replace(/ş/g, 's')
        .replace(/ı/g, 'i')
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ö/g, 'o')
        .replace(/ç/g, 'c');
}

/**
 * İki label'ın eşleşip eşleşmediğini kontrol et
 */
function labelsMatch(cellLabel, searchLabel) {
    const normalizedCell = normalizeLabel(cellLabel);
    const normalizedSearch = normalizeLabel(searchLabel);

    // Tam eşleşme
    if (normalizedCell === normalizedSearch) return true;

    // Cell label aranandan başlıyor mu? (örn: "Firma Adı:" ile "Firma Adı" eşleşir)
    if (normalizedCell.startsWith(normalizedSearch + ' ') ||
        normalizedCell.startsWith(normalizedSearch + ':') ||
        normalizedCell.startsWith(normalizedSearch + '(') ||
        normalizedCell === normalizedSearch) return true;

    // Cell'de birden fazla label varsa (örn: "Firma Adı: Vergi No:"), aranan label içinde mi?
    // Ama dikkatli ol - kısmi eşleşmelerden kaçın
    const searchWords = normalizedSearch.split(' ');
    const cellWords = normalizedCell.split(/[\s:]+/).filter(w => w);

    // Tüm arama kelimeleri cell'de ardışık olarak var mı?
    for (let i = 0; i <= cellWords.length - searchWords.length; i++) {
        let match = true;
        for (let j = 0; j < searchWords.length; j++) {
            if (cellWords[i + j] !== searchWords[j]) {
                match = false;
                break;
            }
        }
        if (match) return true;
    }

    return false;
}

function setValueByLabel(xml, labelText, newValue) {
    const rowRegex = /<w:tr[^>]*>[\s\S]*?<\/w:tr>/g;
    const rows = xml.match(rowRegex) || [];
    let result = xml;

    // Arama için normalize edilmiş label
    const normalizedSearch = normalizeLabel(labelText);

    // Tüm eşleşmeleri topla ve en iyi olanı seç
    let bestMatch = null;
    let bestScore = Infinity; // Düşük skor = daha iyi eşleşme

    for (const row of rows) {
        const rowText = getRowText(row);
        const normalizedRowText = normalizeLabel(rowText);

        // Satırda aranan label'ın ilk kelimesi var mı? (hızlı kontrol)
        const firstWord = normalizedSearch.split(' ')[0];
        if (!normalizedRowText.includes(firstWord)) continue;

        const cellRegex = /<w:tc[^>]*>[\s\S]*?<\/w:tc>/g;
        const cells = row.match(cellRegex) || [];

        for (let i = 0; i < cells.length; i++) {
            const cellText = getCellText(cells[i]);

            if (labelsMatch(cellText, labelText)) {
                if (i + 1 < cells.length) {
                    // Skor: hücre metin uzunluğu (kısa = daha spesifik eşleşme)
                    const normalizedCell = normalizeLabel(cellText);
                    let score = normalizedCell.length;
                    // Tam eşleşme bonus
                    if (normalizedCell === normalizedSearch) score = 0;
                    // Başlangıç eşleşmesi bonus
                    else if (normalizedCell.startsWith(normalizedSearch)) score = normalizedCell.length;
                    // Substring eşleşme - uzunluk farkı kadar ceza
                    else score = normalizedCell.length + 100;

                    if (score < bestScore) {
                        bestScore = score;
                        bestMatch = { row, valueCell: cells[i + 1] };
                    }
                }
            }
        }
    }

    if (bestMatch) {
        const newCell = writeToCell(bestMatch.valueCell, newValue);
        const newRow = bestMatch.row.replace(bestMatch.valueCell, newCell);
        result = result.replace(bestMatch.row, newRow);
    }

    return result;
}

/**
 * Kontrol sorusu - etiketin sağındaki hücreye yaz
 * mode: 'next' = etiketin +1 hücresi (4 sütunlu tablolar)
 * mode: 'last' = satırın son hücresi (2 sütunlu tablolar)
 * exact: true = hücre metni tam olarak soruText'e eşit olmalı (normalize edilmiş)
 */
function setKontrolSorusu(xml, soruText, deger, mode = 'last', exact = false, occurrence = 1) {
    if (!deger) return xml;

    const rowRegex = /<w:tr[^>]*>[\s\S]*?<\/w:tr>/g;
    const rows = xml.match(rowRegex) || [];
    const normalizedSoru = normalizeLabel(soruText);

    // occurrence > 1: aynı soru metni birden fazla tabloda birebir tekrar
    // ediyorsa, kaçıncı eşleşen satıra yazılacağını belirler (1 = ilk).
    let matchCount = 0;

    for (const row of rows) {
        const rowText = getRowText(row);
        if (!rowText.includes(soruText)) continue;

        const cellRegex = /<w:tc[^>]*>[\s\S]*?<\/w:tc>/g;
        const cells = row.match(cellRegex) || [];

        if (cells.length < 2) continue;

        // exact modda: hücre metninin tam olarak soruText'e eşit olması gerekir
        let foundMatchingCell = false;
        let matchingCellIndex = -1;

        for (let i = 0; i < cells.length; i++) {
            const cellText = getCellText(cells[i]);
            if (exact) {
                // Normalize edilmiş tam eşleşme
                if (normalizeLabel(cellText) === normalizedSoru) {
                    foundMatchingCell = true;
                    matchingCellIndex = i;
                    break;
                }
            } else {
                // Kısmi eşleşme (eski davranış)
                if (cellText.includes(soruText)) {
                    foundMatchingCell = true;
                    matchingCellIndex = i;
                    break;
                }
            }
        }

        if (!foundMatchingCell) continue;

        // İstenen tekrara ulaşana kadar eşleşen satırları atla
        matchCount++;
        if (matchCount < occurrence) continue;

        if (mode === 'next') {
            if (matchingCellIndex + 1 < cells.length) {
                const newCell = writeToCell(cells[matchingCellIndex + 1], deger, { stripColor: true });
                const newRow = row.replace(cells[matchingCellIndex + 1], newCell);
                return xml.replace(row, newRow);
            }
        } else {
            const lastCell = cells[cells.length - 1];
            const newCell = writeToCell(lastCell, deger, { stripColor: true });
            const newRow = row.replace(lastCell, newCell);
            return xml.replace(row, newRow);
        }
    }

    return xml;
}

/**
 * Test satırı: [label][tarih][değer]
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
            if (tarih) {
                const newCell1 = writeToCell(cells[1], tarih);
                newRow = newRow.replace(cells[1], newCell1);
            }
            if (deger) {
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

/**
 * Kusur tablosunu doldur
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

/**
 * "İKAZ VE ÖNERİLER" başlık satırının HEMEN ALTINDAKİ satırın ilk hücresine yazar.
 * Şablonlarda bu bölüm ayrı tablo değil; büyük tablonun içinde başlık satırı + boş satır şeklinde.
 * Form alanı `ikazOneriler` buraya basılır (eskiden hiç yazılmıyordu).
 */
function fillIkazOneriler(docXml, text) {
    if (!text) return docXml;

    const tableRegex = /<w:tbl>[\s\S]*?<\/w:tbl>/g;
    const tables = docXml.match(tableRegex) || [];

    // Türkçe İ harfi normalizeLabel'da combining-dot sorunu yaratıyor; ham büyük harf karşılaştır
    const buyuk = (s) => (s || '').toLocaleUpperCase('tr');
    for (const table of tables) {
        const rows = table.match(/<w:tr[^>]*>[\s\S]*?<\/w:tr>/g) || [];
        for (let i = 0; i < rows.length - 1; i++) {
            const rowUp = buyuk(getRowText(rows[i]));
            // "İKAZ" ve "ÖNERİ" aynı satırda (başlık satırı)
            if (rowUp.includes('İKAZ') && rowUp.includes('ÖNER')) {
                const hedef = rows[i + 1];
                const hedefUp = buyuk(getRowText(hedef));
                // Bir sonraki satır başka bir başlıksa (sonuc/kanaat) atla
                if (hedefUp.includes('SONUÇ') || hedefUp.includes('KANAAT')) continue;
                const cells = hedef.match(/<w:tc[^>]*>[\s\S]*?<\/w:tc>/g) || [];
                if (cells.length > 0) {
                    const newCell = writeToCell(cells[0], text);
                    const newRow = hedef.replace(cells[0], newCell);
                    const newTable = table.replace(hedef, newRow);
                    return docXml.replace(table, newTable);
                }
            }
        }
    }

    return docXml;
}

module.exports = {
    writeToCell,
    getRowText,
    getCellText,
    normalizeLabel,
    labelsMatch,
    setValueByLabel,
    setKontrolSorusu,
    setTestRow,
    fillKusurTable,
    fillNotlarTable,
    fillIkazOneriler
};
