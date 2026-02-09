/**
 * Word Dinamik Tablo İşlemleri - Ortak Modül
 */

const { writeToCell, getRowText, getCellText } = require('./wordCellOperations');

/**
 * Config-driven tablo doldurma
 *
 * tableConfig:
 * {
 *   "findBy": "Ölçüm noktası",     // Tabloyu bulmak için anahtar metin
 *   "dataSource": "detayliOlcumler", // formData içindeki dizi adı
 *   "skipHeaderRows": 2,             // Atlanacak başlık satır sayısı
 *   "columns": [
 *     { "field": "siraNo", "format": "number" },
 *     { "field": "olcumNoktasi", "format": "text" },
 *     ...
 *   ],
 *   "calculations": [
 *     { "field": "ia", "formula": "sigortaTipi === 'B' ? anmaAkimi * 5 : ..." }
 *   ]
 * }
 */
function fillTableFromConfig(docXml, formData, tableConfig) {
    const dataRows = formData[tableConfig.dataSource];
    if (!dataRows || dataRows.length === 0) return docXml;

    const tableRegex = /<w:tbl>[\s\S]*?<\/w:tbl>/g;
    const tables = docXml.match(tableRegex) || [];

    let targetTable = null;
    for (const table of tables) {
        const tableText = table.replace(/<[^>]+>/g, ' ');
        if (tableText.includes(tableConfig.findBy)) {
            targetTable = table;
            break;
        }
    }

    if (!targetTable) {
        console.log(`Tablo bulunamadı: ${tableConfig.findBy}`);
        return docXml;
    }

    const rowRegex = /<w:tr[^>]*>[\s\S]*?<\/w:tr>/g;
    const rows = targetTable.match(rowRegex) || [];

    let newTable = targetTable;
    let dataRowIndex = 0;
    const minCells = tableConfig.columns ? tableConfig.columns.length : 2;

    for (let i = 0; i < rows.length && dataRowIndex < dataRows.length; i++) {
        const row = rows[i];
        const rowText = getRowText(row);

        // Başlık satırlarını atla
        if (isHeaderRow(rowText, tableConfig)) continue;

        const cells = row.match(/<w:tc[^>]*>[\s\S]*?<\/w:tc>/g) || [];
        if (cells.length < minCells) continue;

        const dataRow = dataRows[dataRowIndex];

        // Hesaplamaları uygula
        if (tableConfig.calculations) {
            applyCalculations(dataRow, tableConfig.calculations, formData);
        }

        // Hücreleri doldur
        const values = tableConfig.columns.map((col, idx) => {
            if (col.field === '_rowNum') return (dataRowIndex + 1).toString();
            let val = dataRow[col.field];
            if (val === undefined || val === null) return '-';
            return formatCellValue(val, col);
        });

        let newRow = row;
        for (let ci = 0; ci < Math.min(cells.length, values.length); ci++) {
            const newCell = writeToCell(cells[ci], String(values[ci]));
            newRow = newRow.replace(cells[ci], newCell);
        }

        const rowIndex = newTable.indexOf(row);
        if (rowIndex !== -1) {
            newTable = newTable.substring(0, rowIndex) + newRow + newTable.substring(rowIndex + row.length);
        }

        dataRowIndex++;
    }

    return docXml.replace(targetTable, newTable);
}

function isHeaderRow(rowText, tableConfig) {
    if (!rowText || rowText.length === 0) return true;

    // findBy metnini içeren satırlar başlık
    if (rowText.includes(tableConfig.findBy)) return true;

    // skipTexts varsa kontrol et
    if (tableConfig.skipTexts) {
        for (const skip of tableConfig.skipTexts) {
            if (rowText.includes(skip)) return true;
        }
    }

    return false;
}

function formatCellValue(val, colConfig) {
    if (val === undefined || val === null || val === '') return '-';

    switch (colConfig.format) {
        case 'number':
            const num = parseFloat(val);
            if (isNaN(num)) return '-';
            return colConfig.decimals !== undefined ? num.toFixed(colConfig.decimals) : num.toString();
        case 'date':
            return require('./wordHelpers').formatDate(val);
        default:
            return String(val);
    }
}

function applyCalculations(rowData, calculations, formData) {
    for (const calc of calculations) {
        try {
            const fn = new Function('row', 'form', `with(row) { return ${calc.formula}; }`);
            rowData[calc.field] = fn(rowData, formData);
        } catch (e) {
            console.error(`Hesaplama hatası (${calc.field}):`, e.message);
            rowData[calc.field] = '-';
        }
    }
}

/**
 * Tek hücreli tablo doldurma (kusur, notlar gibi)
 */
function fillSingleCellTable(docXml, findBy, text) {
    if (!text) return docXml;

    const tableRegex = /<w:tbl>[\s\S]*?<\/w:tbl>/g;
    const tables = docXml.match(tableRegex) || [];

    for (const table of tables) {
        const tableText = table.replace(/<[^>]+>/g, ' ');
        if (tableText.includes(findBy)) {
            const rows = table.match(/<w:tr[^>]*>[\s\S]*?<\/w:tr>/g) || [];
            if (rows.length >= 2) {
                const dataRow = rows[rows.length - 1];
                const cells = dataRow.match(/<w:tc[^>]*>[\s\S]*?<\/w:tc>/g) || [];
                if (cells.length > 0) {
                    const newCell = writeToCell(cells[0], text);
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
    fillTableFromConfig,
    fillSingleCellTable,
    applyCalculations
};
