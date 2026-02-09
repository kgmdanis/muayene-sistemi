/**
 * Word Hücre İşlemleri - Ortak Modül
 */

const { escapeXml } = require('./wordHelpers');

function writeToCell(cellXml, newText, opts = {}) {
    const escapedText = escapeXml(newText || '-');

    if (!/<w:t[ >]/.test(cellXml)) {
        const rPrMatch = cellXml.match(/<w:pPr>[\s\S]*?<w:rPr>([\s\S]*?)<\/w:rPr>[\s\S]*?<\/w:pPr>/);
        let rPrInner = rPrMatch ? rPrMatch[1] : '';
        if (opts.stripColor) {
            rPrInner = rPrInner.replace(/<w:color[^/]*\/>/g, '');
        }
        const rPrTag = rPrInner ? `<w:rPr>${rPrInner}</w:rPr>` : '';

        if (/<w:pPr>[\s\S]*?<\/w:pPr>/.test(cellXml)) {
            return cellXml.replace(
                /(<\/w:pPr>)/,
                `$1<w:r>${rPrTag}<w:t xml:space="preserve">${escapedText}</w:t></w:r>`
            );
        }
        return cellXml.replace(
            /(<\/w:p>)/,
            `<w:r>${rPrTag}<w:t xml:space="preserve">${escapedText}</w:t></w:r>$1`
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
                // Değer hücresini bul (bir sonraki hücre)
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
 * Kontrol sorusu - etiketin sağındaki hücreye yaz
 * mode: 'next' = etiketin +1 hücresi (4 sütunlu tablolar)
 * mode: 'last' = satırın son hücresi (2 sütunlu tablolar)
 * exact: true = hücre metni tam olarak soruText'e eşit olmalı (normalize edilmiş)
 */
function setKontrolSorusu(xml, soruText, deger, mode = 'last', exact = false) {
    if (!deger) return xml;

    const rowRegex = /<w:tr[^>]*>[\s\S]*?<\/w:tr>/g;
    const rows = xml.match(rowRegex) || [];
    const normalizedSoru = normalizeLabel(soruText);

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

module.exports = {
    writeToCell,
    getRowText,
    getCellText,
    setValueByLabel,
    setKontrolSorusu,
    setTestRow,
    fillKusurTable,
    fillNotlarTable
};
