/**
 * Generic Word Rapor Servisi
 * Tüm şablon tiplerini config-driven olarak doldurur
 */

const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');
const { formatDate, formatDateTime, getNextYearDate, escapeXml } = require('./wordHelpers');
const { setValueByLabel, setKontrolSorusu, setTestRow, fillKusurTable, fillNotlarTable, fillIkazOneriler, getCellText, normalizeLabel, writeToCell } = require('./wordCellOperations');
const { fillCheckboxesFromConfig } = require('./wordCheckboxHandler');
const { fillTableFromConfig, fillSingleCellTable } = require('./wordTableHandler');

/**
 * Config dosyasını yükle (cache ile)
 */
const configCache = new Map();

function loadConfig(sablonKodu) {
    const configPath = path.join(__dirname, 'templateConfigs', `${sablonKodu}.json`);
    if (!fs.existsSync(configPath)) {
        throw new Error(`Şablon config bulunamadı: ${sablonKodu}`);
    }
    // Her seferinde diskten oku - config değişikliklerinin hemen yansıması için
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return config;
}

/**
 * Config cache'i temizle (geliştirme sırasında)
 */
function clearConfigCache() {
    configCache.clear();
}

/**
 * formData veya rapor'dan değer al
 */
function getValue(fieldId, rapor, formData, options) {
    if (options && options[fieldId] !== undefined && options[fieldId] !== '') return options[fieldId];
    if (formData && formData[fieldId] !== undefined && formData[fieldId] !== '') return formData[fieldId];
    if (rapor && rapor[fieldId] !== undefined && rapor[fieldId] !== '') return rapor[fieldId];
    return null;
}

/**
 * Değeri formatla
 */
function formatValue(value, format, opts = {}) {
    if (!value && value !== 0) return '-';
    switch (format) {
        case 'date': return formatDate(value);
        case 'dateTime': return formatDateTime(value, opts.time || '09:00');
        case 'nextYear': return getNextYearDate(value);
        case 'number':
            const num = parseFloat(value);
            if (isNaN(num)) return '-';
            return opts.decimals !== undefined ? num.toFixed(opts.decimals) : num.toString();
        default: return String(value);
    }
}

/**
 * Ana fonksiyon: Generic Word raporu oluştur
 */
async function generateGenericWord(rapor, isEmri, options = {}) {
    const sablonKodu = rapor.sablonKodu;
    const config = loadConfig(sablonKodu);

    const templatePath = path.join(__dirname, '..', config.wordMapping.templatePath);
    if (!fs.existsSync(templatePath)) {
        throw new Error(`Word şablonu bulunamadı: ${config.wordMapping.templatePath}`);
    }

    const templateContent = fs.readFileSync(templatePath);
    const zip = await JSZip.loadAsync(templateContent);
    let docXml = await zip.file('word/document.xml').async('string');

    const firma = isEmri?.customer || {};
    const firmaBilgi = isEmri?.firmaBilgi || {};
    const formData = rapor.formData || {};

    // === 1. HEADER DOLDURMASI ===
    if (config.wordMapping.headerFile) {
        const headerFile = zip.file(config.wordMapping.headerFile);
        if (headerFile) {
            let headerXml = await headerFile.async('string');
            headerXml = fillFieldMappings(headerXml, config.wordMapping.headerFields || config.wordMapping.fields, rapor, formData, firma, firmaBilgi, options);
            headerXml = autoDetectAndFill(headerXml, rapor, formData, firma, firmaBilgi, options);
            zip.file(config.wordMapping.headerFile, headerXml);
        }
    }

    // === 2. DOCUMENT FIELD'LARI ===
    docXml = fillFieldMappings(docXml, config.wordMapping.fields, rapor, formData, firma, firmaBilgi, options);

    // === 3. KONTROL SORULARI ===
    if (config.wordMapping.controlQuestions) {
        const cq = config.wordMapping.controlQuestions;
        const questions = cq.questions || [];

        // Section'dan default değerleri topla
        const sectionDefaults = {};
        const kontrolSection = (config.sections || []).find(s => s.type === 'control-questions');
        if (kontrolSection && kontrolSection.questions) {
            for (const sq of kontrolSection.questions) {
                if (sq.default) sectionDefaults[sq.id] = sq.default;
            }
        }

        for (const q of questions) {
            let deger = getValue(q.field, rapor, formData, options);
            // Değer yoksa section default'unu veya config default'unu kullan
            if (!deger) {
                deger = q.default || sectionDefaults[q.field] || null;
            }
            // Değer yoksa "-" yaz (şablondaki ön-doldurulmuş değerin kalmasını engelle)
            if (!deger) deger = '-';
            const mode = q.mode || cq.mode || 'last';
            const exact = q.exact || false;
            docXml = setKontrolSorusu(docXml, q.text, deger, mode, exact);
        }
    }

    // === 3.5. PRE-FILLED DEĞER NORMALİZASYONU ===
    // Şablondaki önceden doldurulmuş "UYGUN"/"UYGULANAMAZ" gibi büyük harfli değerleri normalize et
    docXml = normalizePrefilledValues(docXml);

    // === 4. TEST SATIRLARI ===
    if (config.wordMapping.testRows) {
        for (const tr of config.wordMapping.testRows) {
            const tarih = formatValue(getValue(tr.dateField, rapor, formData, options), 'date');
            const deger = getValue(tr.valueField, rapor, formData, options);
            docXml = setTestRow(docXml, tr.text, tarih, deger);
        }
    }

    // === 5. CHECKBOX'LAR ===
    if (config.wordMapping.checkboxes) {
        docXml = fillCheckboxesFromConfig(docXml, formData, config.wordMapping.checkboxes);
    }

    // === 6. DİNAMİK TABLOLAR ===
    if (config.wordMapping.tables) {
        for (const tableConfig of config.wordMapping.tables) {
            if (tableConfig.type === 'single-cell') {
                const text = getValue(tableConfig.field, rapor, formData, options);
                docXml = fillSingleCellTable(docXml, tableConfig.findBy, text);
            } else {
                docXml = fillTableFromConfig(docXml, formData, tableConfig);
            }
        }
    }

    // === 6.5. REPEATABLE SECTIONS (Yangın Dolabı vb.) ===
    if (config.wordMapping.repeatableSections) {
        for (const repConfig of config.wordMapping.repeatableSections) {
            const entries = formData[repConfig.id] || [];
            docXml = fillRepeatableSection(docXml, entries, repConfig);
        }
    }

    // === 6.7. HAVALANDIRMA HESAPLAMA TABLOSU ===
    if (config.wordMapping.hesaplamaTable) {
        docXml = fillHesaplamaTable(docXml, formData, config.wordMapping.hesaplamaTable);
    }

    // === 7. KUSUR & NOTLAR (fallback - config'de tablo olarak da tanımlanabilir) ===
    const kusurText = getValue('kusurAciklama', rapor, formData, options);
    if (kusurText) docXml = fillKusurTable(docXml, kusurText);

    const notlarText = getValue('notlar', rapor, formData, options);
    if (notlarText) docXml = fillNotlarTable(docXml, notlarText);

    // İKAZ VE ÖNERİLER (form alanı: ikazOneriler) — şablonlardaki "İKAZ VE ÖNERİLER" satırına basılır
    const ikazText = getValue('ikazOneriler', rapor, formData, options)
        || getValue('kusurAciklama', rapor, formData, options);
    if (ikazText) docXml = fillIkazOneriler(docXml, ikazText);

    // === 8. SONUÇ (renkli) ===
    const genelSonuc = rapor.genelSonuc || formData.genelSonuc || options.genelSonuc;
    docXml = fillSonuc(docXml, genelSonuc, config.wordMapping.sonucPattern);

    // === 9. YETKİLİ KİŞİ ===
    if (options.tekniker) {
        docXml = setValueByLabel(docXml, 'Adı, Soyadı', options.tekniker.adSoyad);
        docXml = setValueByLabel(docXml, 'Unvanı', options.tekniker.unvan);
        docXml = setValueByLabel(docXml, 'Mesleği', options.tekniker.meslek);
        docXml = setValueByLabel(docXml, 'Diploma Tarihi', formatDate(options.tekniker.diplomaTarihi));
        docXml = setValueByLabel(docXml, 'Diploma Numarası', options.tekniker.diplomaNo);
        docXml = setValueByLabel(docXml, 'Ekipnet Kayıt No', options.tekniker.ekipnetNo);
    }

    // === 10. OTOMATİK ALAN ALGILAMA (Sözleşme ID vb.) ===
    docXml = autoDetectAndFill(docXml, rapor, formData, firma, firmaBilgi, options);

    zip.file('word/document.xml', docXml);

    return await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 9 }
    });
}

/**
 * Havalandırma hesaplama tablosunu doldur
 * Tablo yapısı: YER, MENFEZ satırları, TOPLAM DEBİ, HAVA M3, HACİM, KATSAYI, SONUÇ
 */
function fillHesaplamaTable(docXml, formData, hesaplamaConfig) {
    if (!hesaplamaConfig || !formData) return docXml;

    // Menfez verileri
    const menfezler = formData.menfezler || [];
    let toplamDebi = 0;

    // Her menfez için debi hesapla
    menfezler.forEach(m => {
        const hiz = parseFloat(m.menfezHiz) || 0;
        const kesit = parseFloat(m.menfezKesit) || 0;
        m.menfezDebi = hiz * kesit;
        toplamDebi += m.menfezDebi;
    });

    // Hacim hesapla
    const en = parseFloat(formData.hacimEn) || 0;
    const boy = parseFloat(formData.hacimBoy) || 0;
    const yukseklik = parseFloat(formData.hacimYukseklik) || 0;
    const hacim = en * boy * yukseklik;

    // Saatlik hava
    const havaM3 = toplamDebi * 3600;

    // Hava değişim katsayısı
    const havaDegisimKatsayisi = hacim > 0 ? havaM3 / hacim : 0;
    const gerekenKatsayi = parseFloat(formData.gerekenHavaDegisimKatsayisi) || 30;

    // Hesaplama tablosunu bul (findBy keyword ile)
    const findBy = hesaplamaConfig.findBy || 'HESAPLAMA';
    const tableRegex = /<w:tbl\b[^>]*>[\s\S]*?<\/w:tbl>/g;
    let tableMatch;
    let hesapTable = null;
    let hesapTableIndex = -1;

    while ((tableMatch = tableRegex.exec(docXml)) !== null) {
        if (tableMatch[0].includes(findBy)) {
            hesapTable = tableMatch[0];
            hesapTableIndex = tableMatch.index;
            break;
        }
    }

    if (!hesapTable) return docXml;

    let updatedTable = hesapTable;

    // YER alanını doldur
    if (formData.hesapYer) {
        updatedTable = updatedTable.replace(
            /(<w:t[^>]*>YER:\s*)<\/w:t>([\s\S]*?)<w:t[^>]*>([^<]*)<\/w:t>/,
            (match, prefix) => {
                return match.replace(/(<w:t[^>]*>)([^<]*?)(<\/w:t>)/, (m2, open, oldVal, close) => {
                    // İlk YER: label'ından sonraki değer hücresini bul
                    return m2;
                });
            }
        );
        // Basit yaklaşım: YER: satırındaki mevcut değeri değiştir
        const yerRowRegex = /<w:tr[^>]*>[\s\S]*?YER:[\s\S]*?<\/w:tr>/;
        const yerRow = updatedTable.match(yerRowRegex);
        if (yerRow) {
            const cells = yerRow[0].match(/<w:tc[^>]*>[\s\S]*?<\/w:tc>/g) || [];
            if (cells.length >= 2) {
                const oldCell = cells[0]; // YER: hücresindeki değeri güncelle
                const newCell = oldCell.replace(
                    /(<w:t[^>]*>YER:\s*)([^<]*)(<\/w:t>)/,
                    `$1${formData.hesapYer}$3`
                );
                updatedTable = updatedTable.replace(oldCell, newCell);
            }
        }
    }

    // Menfez satırlarını doldur
    if (menfezler.length > 0) {
        // Mevcut menfez satırını bul (örn: "1 NOLU")
        const menfezRowRegex = /<w:tr[^>]*>([\s\S]*?NOLU[\s\S]*?)<\/w:tr>/;
        const existingRow = updatedTable.match(menfezRowRegex);

        if (existingRow) {
            const templateRow = existingRow[0];
            let allMenfezRows = '';

            menfezler.forEach((m, idx) => {
                let newRow = templateRow;
                const cells = newRow.match(/<w:tc[^>]*>[\s\S]*?<\/w:tc>/g) || [];

                // Hücreleri sırayla doldur: No, Konumu, Hız, Kesit, Debi
                const values = [
                    m.menfezNo || `${idx + 1} NOLU`,
                    m.menfezKonumu || '',
                    m.menfezHiz ? String(m.menfezHiz).replace('.', ',') : '',
                    m.menfezKesit ? String(m.menfezKesit).replace('.', ',') : '',
                    m.menfezDebi ? m.menfezDebi.toFixed(5).replace('.', ',') : ''
                ];

                cells.forEach((cell, ci) => {
                    if (ci < values.length && values[ci]) {
                        const textMatch = cell.match(/<w:t[^>]*>[^<]*<\/w:t>/);
                        if (textMatch) {
                            const newCell = cell.replace(
                                /<w:t([^>]*)>[^<]*<\/w:t>/,
                                `<w:t$1>${values[ci]}</w:t>`
                            );
                            newRow = newRow.replace(cell, newCell);
                        }
                    }
                });

                allMenfezRows += newRow;
            });

            // Orijinal menfez satırını yeni satırlarla değiştir
            updatedTable = updatedTable.replace(templateRow, allMenfezRows);
        }
    }

    // Hesaplanan değerleri label'a göre doldur
    function setTableValue(table, label, value) {
        const rowRegex = new RegExp(`<w:tr[^>]*>[\\s\\S]*?${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?<\\/w:tr>`);
        const row = table.match(rowRegex);
        if (!row) return table;

        const cells = row[0].match(/<w:tc[^>]*>[\s\S]*?<\/w:tc>/g) || [];
        // Label hücresinden sonraki hücreyi bul (değer hücresi)
        let foundLabel = false;
        for (const cell of cells) {
            if (cell.includes(label)) {
                foundLabel = true;
                continue;
            }
            if (foundLabel) {
                const textMatch = cell.match(/<w:t([^>]*)>[^<]*<\/w:t>/);
                if (textMatch) {
                    const oldCell = cell;
                    const newCell = cell.replace(
                        /<w:t([^>]*)>[^<]*<\/w:t>/,
                        `<w:t$1>${String(value).replace('.', ',')}</w:t>`
                    );
                    return table.replace(oldCell, newCell);
                }
                break;
            }
        }
        return table;
    }

    updatedTable = setTableValue(updatedTable, 'TOPLAM DEBİ', toplamDebi.toFixed(5));
    updatedTable = setTableValue(updatedTable, 'HAVA M3 =', havaM3.toFixed(3));

    // HACİM= (ikinci occurrence - değer satırı)
    const hacimRows = updatedTable.match(/<w:tr[^>]*>[\s\S]*?HACİM=[\s\S]*?<\/w:tr>/g) || [];
    if (hacimRows.length >= 2) {
        // İkinci HACİM= satırı değer satırıdır
        const valueRow = hacimRows[1];
        const cells = valueRow.match(/<w:tc[^>]*>[\s\S]*?<\/w:tc>/g) || [];
        if (cells.length >= 2) {
            const oldCell = cells[1];
            const newCell = oldCell.replace(
                /<w:t([^>]*)>[^<]*<\/w:t>/,
                `<w:t$1>${hacim.toFixed(3).replace('.', ',')}</w:t>`
            );
            updatedTable = updatedTable.replace(oldCell, newCell);
        }
    }

    updatedTable = setTableValue(updatedTable, 'GEREKEN HAVA', String(gerekenKatsayi));
    updatedTable = setTableValue(updatedTable, 'TOPLAM HAVALANDIMA', havaDegisimKatsayisi.toFixed(2));

    return docXml.replace(hesapTable, updatedTable);
}

/**
 * Otomatik alan algılama - şablondaki "Sözleşme" içeren hücreleri bul ve doldur
 * Config'de tanımlanmamış olsa bile çalışır
 */
function autoDetectAndFill(docXml, rapor, formData, firma, firmaBilgi, options) {
    const autoRules = [
        {
            keyword: 'sozlesme',  // normalizeLabel sonrası
            value: () => joinIsgKatipIds(firmaBilgi, formData, rapor)
        }
    ];

    const rowRegex = /<w:tr[^>]*>[\s\S]*?<\/w:tr>/g;
    const rows = docXml.match(rowRegex) || [];

    for (const rule of autoRules) {
        const val = rule.value();
        if (!val) continue;

        for (const row of rows) {
            const cellRegex = /<w:tc[^>]*>[\s\S]*?<\/w:tc>/g;
            const cells = row.match(cellRegex) || [];

            for (let i = 0; i < cells.length; i++) {
                const cellText = getCellText(cells[i]);
                const normalized = normalizeLabel(cellText);

                if (normalized.includes(rule.keyword)) {
                    // Bu hücrenin yanındaki hücre boş mu kontrol et
                    if (i + 1 < cells.length) {
                        const nextCellText = getCellText(cells[i + 1]).trim();
                        // Sadece boş hücreleri doldur (zaten dolu ise dokunma)
                        if (!nextCellText || nextCellText === '-') {
                            const newCell = writeToCell(cells[i + 1], val);
                            const newRow = row.replace(cells[i + 1], newCell);
                            docXml = docXml.replace(row, newRow);
                            break; // Bu rule için ilk eşleşmeyi bulduk
                        }
                    }
                }
            }
        }
    }

    return docXml;
}

/**
 * İSG-KATİP Sözleşme ID'lerini (1-4) birleştirip döner, boşları atar.
 * Kullanıcı birden fazla ID girdiyse " / " ile ayırıp tek string halinde verir.
 */
function joinIsgKatipIds(firmaBilgi, formData, rapor) {
    const fb = firmaBilgi || {};
    const ids = [fb.isgKatipId, fb.isgKatipId2, fb.isgKatipId3, fb.isgKatipId4]
        .map(v => (v == null ? '' : String(v).trim()))
        .filter(v => v && v !== '-');
    if (ids.length) return ids.join(' / ');
    const fallback = (formData && formData.isgKatipNo) || (rapor && rapor.isgKatipNo) || null;
    return fallback || null;
}

/**
 * Field mapping'leri uygula
 */
function fillFieldMappings(xml, fields, rapor, formData, firma, firmaBilgi, options) {
    if (!fields) return xml;

    for (const mapping of fields) {
        let value = null;

        // Kaynak belirleme
        if (mapping.source === 'firmaBilgi.isgKatipId') {
            // Birden fazla Sözleşme ID girilebildiği için hepsini birleştir
            value = joinIsgKatipIds(firmaBilgi, formData, rapor);
        } else if (mapping.source) {
            value = resolveSource(mapping.source, { rapor, formData, firma, firmaBilgi, options });
        } else if (mapping.field) {
            value = getValue(mapping.field, rapor, formData, options);
        }

        // Formatlama
        if (mapping.format) {
            value = formatValue(value, mapping.format, mapping);
        }

        if (value !== null && value !== undefined) {
            xml = setValueByLabel(xml, mapping.label, String(value));
        }
    }

    return xml;
}

/**
 * Noktalı kaynak yolunu çöz: "firma.unvan", "firmaBilgi.sgkSicilNo" vb.
 */
function resolveSource(sourcePath, context) {
    const parts = sourcePath.split('.');
    let current = context;

    for (const part of parts) {
        if (current === null || current === undefined) return null;
        current = current[part];
    }

    return current;
}

/**
 * Sonuç metnini renkli olarak doldur
 */
function fillSonuc(docXml, genelSonuc, pattern) {
    const uygun = genelSonuc === 'UYGUN';

    // Regex pattern ile sonuç bul
    if (pattern === 'uppercase') {
        const sonucMetni = uygun ? 'UYGUNDUR' : 'UYGUN DEĞİLDİR';
        docXml = docXml.replace(
            /(kullanımı\s*\d*\s*yıl\s*süreyle[;:]*\s*)(UYGUNDUR|UYGUN DEĞİLDİR)/gi,
            `$1${sonucMetni}`
        );
    } else {
        // Varsayılan: "uygundur" veya "uygun değildir" kalıbını bul ve renklendir
        const sonucMetni = uygun ? 'uygundur' : 'uygun değildir';
        const sonucRenk = uygun ? '059669' : 'DC2626';

        docXml = docXml.replace(
            /(<w:r\b[^>]*>)([\s\S]*?)(<w:t[^>]*>)([^<]*?)(uygun\s+değildir|uygundur)([^<]*?)(<\/w:t>)/i,
            (match, rOpen, rContent, tOpen, before, oldPhrase, after, tClose) => {
                const colorTag = `<w:color w:val="${sonucRenk}"/>`;
                const boldTag = '<w:b/>';
                let newContent = rContent;
                if (newContent.includes('<w:rPr>')) {
                    if (newContent.includes('<w:color')) {
                        newContent = newContent.replace(/<w:color[^/]*\/>/g, colorTag);
                    } else {
                        newContent = newContent.replace('</w:rPr>', `${colorTag}${boldTag}</w:rPr>`);
                    }
                    return `${rOpen}${newContent}${tOpen}${before}${escapeXml(sonucMetni)}${after}${tClose}`;
                } else {
                    return `${rOpen}<w:rPr>${colorTag}${boldTag}</w:rPr>${newContent}${tOpen}${before}${escapeXml(sonucMetni)}${after}${tClose}`;
                }
            }
        );
    }

    return docXml;
}

/**
 * Şablondaki önceden doldurulmuş büyük harfli değerleri normalize et
 * "UYGUN" → "Uygun", "UYGUN DEĞİL" → "Uygun Değil", "UYGULANAMAZ" → "Uygulanamaz"
 * "EVET" → "Evet", "HAYIR" → "Hayır"
 */
function normalizePrefilledValues(xml) {
    const replacements = {
        'UYGUN DEĞİL': 'Uygun Değil',
        'UYGULANAMAZ': 'Uygulanamaz',
        'UYGUN': 'Uygun',
        'EVET': 'Evet',
        'HAYIR': 'Hayır'
    };

    // Önce uzun ifadeleri değiştir (kısa olan "UYGUN" sonra gelsin, "UYGUN DEĞİL"i bozmasın)
    const orderedKeys = Object.keys(replacements).sort((a, b) => b.length - a.length);
    for (const upper of orderedKeys) {
        const normal = replacements[upper];
        // Tam eşleşme: <w:t>UYGUN</w:t> veya <w:t xml:space="preserve">UYGUN</w:t>
        const regex = new RegExp(`(<w:t[^>]*>)\\s*${upper}\\s*(<\\/w:t>)`, 'g');
        xml = xml.replace(regex, `$1${normal}$2`);
    }

    return xml;
}

/**
 * Repeatable section (yangın dolabı vb.) - tablo klonlama ve doldurma
 * Word şablonundaki tekrarlanan tablo bloklarını bulur,
 * veri sayısına göre klonlar ve doldurur
 */
function fillRepeatableSection(docXml, entries, repConfig) {
    if (!entries || entries.length === 0) return docXml;

    // Tip belirleme: row-table (satır klonlama) veya block (çok-satırlı blok klonlama)
    if (repConfig.type === 'row-table') {
        return fillRowTable(docXml, entries, repConfig);
    }
    return fillBlockTable(docXml, entries, repConfig);
}

/**
 * row-table: Basit tablo satır klonlama (tüp listesi vb.)
 * Header satırları korunur, veri satırları entry sayısına göre klonlanır
 */
function fillRowTable(docXml, entries, repConfig) {
    const findBy = repConfig.findTableBy;
    const headerRows = repConfig.headerRows || 1;
    const columns = repConfig.columns || [];

    // Tabloyu bul
    const tblRegex = /<w:tbl\b[\s\S]*?<\/w:tbl>/g;
    let tblMatch;
    let targetTable = null;
    while ((tblMatch = tblRegex.exec(docXml)) !== null) {
        if (tblMatch[0].includes(findBy)) {
            targetTable = { start: tblMatch.index, end: tblMatch.index + tblMatch[0].length, xml: tblMatch[0] };
            break;
        }
    }

    if (!targetTable) {
        console.warn(`row-table: "${findBy}" içeren tablo bulunamadı`);
        return docXml;
    }

    // Satırları ayır
    const rowRegex = /<w:tr\b[\s\S]*?<\/w:tr>/g;
    const allRows = [];
    let rm;
    while ((rm = rowRegex.exec(targetTable.xml)) !== null) {
        allRows.push(rm[0]);
    }

    // Header ve data satırlarını ayır
    const headers = allRows.slice(0, headerRows);
    const templateDataRow = allRows[headerRows]; // İlk veri satırı şablon olarak kullanılır

    if (!templateDataRow) {
        console.warn('row-table: Veri satırı bulunamadı');
        return docXml;
    }

    // Her entry için yeni satır oluştur
    const newDataRows = [];
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        let row = templateDataRow;

        // Satırdaki tüm hücrelerin text değerlerini bul
        const cellTexts = [];
        const cellRegex = /<w:tc\b[\s\S]*?<\/w:tc>/g;
        let cellMatch;
        while ((cellMatch = cellRegex.exec(row)) !== null) {
            cellTexts.push({ start: cellMatch.index, end: cellMatch.index + cellMatch[0].length, xml: cellMatch[0] });
        }

        // Her kolonu doldur
        let offset = 0;
        for (let ci = 0; ci < columns.length && ci < cellTexts.length; ci++) {
            const colName = columns[ci];
            let value = '';

            if (colName === '_siraNo') {
                value = String(i + 1);
            } else {
                value = entry[colName] || '';
            }

            if (value !== '') {
                const cell = cellTexts[ci];
                const cellXml = row.substring(cell.start + offset, cell.end + offset);
                // Hücre içindeki ilk text'i değiştir
                const newCellXml = replaceCellText(cellXml, escapeXml(String(value)));
                row = row.substring(0, cell.start + offset) + newCellXml + row.substring(cell.end + offset);
                offset += newCellXml.length - cellXml.length;
            }
        }

        newDataRows.push(row);
    }

    // Tablo properties'i al
    const tblPrMatch = targetTable.xml.match(/<w:tblPr\b[\s\S]*?<\/w:tblPr>/);
    const tblGridMatch = targetTable.xml.match(/<w:tblGrid\b[\s\S]*?<\/w:tblGrid>/);
    const tblProps = (tblPrMatch ? tblPrMatch[0] : '') + (tblGridMatch ? tblGridMatch[0] : '');

    // Yeni tablo oluştur
    const newTableXml = `<w:tbl>${tblProps}${headers.join('')}${newDataRows.join('')}</w:tbl>`;

    // Eski tabloyu yenisiyle değiştir
    return docXml.substring(0, targetTable.start) + newTableXml + docXml.substring(targetTable.end);
}

/**
 * Hücre içindeki ilk text değerini değiştir
 */
function replaceCellText(cellXml, newValue) {
    // İlk <w:t> etiketini bul ve içeriğini değiştir
    const textMatch = cellXml.match(/<w:t[^>]*>[^<]*<\/w:t>/);
    if (textMatch) {
        return cellXml.replace(textMatch[0], textMatch[0].replace(/(<w:t[^>]*>)[^<]*(<\/w:t>)/, `$1${newValue}$2`));
    }
    return cellXml;
}

/**
 * block: Çok-satırlı blok klonlama (yangın dolabı vb.)
 * Bir entry = birden fazla satır, tablo içinde tekrarlanan bloklar
 */
function fillBlockTable(docXml, entries, repConfig) {
    const findBy = repConfig.findTableBy;
    const rowsPerEntry = repConfig.rowsPerEntry || 10;

    // Şablondaki tüm tabloları bul (findBy text'i içerenleri)
    const tblRegex = /<w:tbl\b[\s\S]*?<\/w:tbl>/g;
    const allTables = [];
    let tblMatch;
    while ((tblMatch = tblRegex.exec(docXml)) !== null) {
        if (tblMatch[0].includes(findBy)) {
            allTables.push({ start: tblMatch.index, end: tblMatch.index + tblMatch[0].length, xml: tblMatch[0] });
        }
    }

    if (allTables.length === 0) {
        console.warn(`block-table: "${findBy}" içeren tablo bulunamadı`);
        return docXml;
    }

    // İlk tablodan bir entry bloğu (rowsPerEntry satır) çıkar
    const firstTable = allTables[0].xml;
    const rowRegex = /<w:tr\b[\s\S]*?<\/w:tr>/g;
    const templateRows = [];
    let rowMatch;
    while ((rowMatch = rowRegex.exec(firstTable)) !== null) {
        templateRows.push(rowMatch[0]);
    }

    const templateBlock = templateRows.slice(0, rowsPerEntry);
    if (templateBlock.length < rowsPerEntry) {
        console.warn(`block-table: Beklenen ${rowsPerEntry} satır, bulunan ${templateBlock.length}`);
        return docXml;
    }

    // Tablo properties
    const tblPrMatch = firstTable.match(/<w:tblPr\b[\s\S]*?<\/w:tblPr>/);
    const tblGridMatch = firstTable.match(/<w:tblGrid\b[\s\S]*?<\/w:tblGrid>/);
    const tblProps = (tblPrMatch ? tblPrMatch[0] : '') + (tblGridMatch ? tblGridMatch[0] : '');

    // Her entry için yeni satırlar oluştur
    const newRows = [];
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        let block = templateBlock.join('');

        // Field'ları doldur
        if (repConfig.fields) {
            for (const [fieldId, fieldConfig] of Object.entries(repConfig.fields)) {
                const value = entry[fieldId] || '';
                if (value) {
                    block = replaceValueAfterLabel(block, fieldConfig.label, escapeXml(String(value)));
                }
            }
        }

        // Check'leri doldur (√ veya X)
        if (repConfig.checks && entry._checks) {
            const checkSymbol = repConfig.checkSymbol || '√';
            const uncheckSymbol = 'X';

            const checkRegex = new RegExp(`(<w:t[^>]*>)\\s*${escapeRegex(checkSymbol)}\\s*(<\\/w:t>)`, 'g');
            let checkPositions = [];
            let cm;
            while ((cm = checkRegex.exec(block)) !== null) {
                checkPositions.push({ index: cm.index, match: cm[0], pre: cm[1], post: cm[2] });
            }

            let offset = 0;
            for (let ci = 0; ci < repConfig.checks.length && ci < checkPositions.length; ci++) {
                const checkId = repConfig.checks[ci];
                const isChecked = entry._checks[checkId] !== false;
                if (!isChecked) {
                    const pos = checkPositions[ci];
                    const actualIdx = pos.index + offset;
                    const replacement = `${pos.pre}${uncheckSymbol}${pos.post}`;
                    block = block.substring(0, actualIdx) + replacement + block.substring(actualIdx + pos.match.length);
                    offset += replacement.length - pos.match.length;
                }
            }
        }

        newRows.push(block);
    }

    // Yeni tablolar oluştur (3 entry/tablo)
    const entriesPerTable = 3;
    const newTables = [];
    for (let i = 0; i < newRows.length; i += entriesPerTable) {
        const chunk = newRows.slice(i, i + entriesPerTable);
        newTables.push(`<w:tbl>${tblProps}${chunk.join('')}</w:tbl>`);
    }

    // Eski tabloları sil ve yenilerini koy (sondan başa)
    let result = docXml;
    for (let i = allTables.length - 1; i >= 0; i--) {
        const tbl = allTables[i];
        if (i === 0) {
            result = result.substring(0, tbl.start) + newTables.join('') + result.substring(tbl.end);
        } else {
            result = result.substring(0, tbl.start) + result.substring(tbl.end);
        }
    }

    return result;
}

/**
 * Label'dan sonraki hücredeki değeri değiştir (tablo satırı içinde)
 */
function replaceValueAfterLabel(xml, label, newValue) {
    // Label'ı bul
    const labelIdx = xml.indexOf(label);
    if (labelIdx === -1) return xml;

    // Label'dan sonraki ilk <w:tc> içindeki text'i bul ve değiştir
    // Pattern: label'dan sonra gelen bir sonraki hücredeki değer
    const afterLabel = xml.substring(labelIdx);

    // Label'ın bulunduğu hücrenin kapanışını bul
    const tcCloseIdx = afterLabel.indexOf('</w:tc>');
    if (tcCloseIdx === -1) return xml;

    // Sonraki hücreyi bul
    const afterFirstTc = afterLabel.substring(tcCloseIdx + 7);
    const nextTcStart = afterFirstTc.indexOf('<w:tc');
    if (nextTcStart === -1) return xml;

    const nextTcEnd = afterFirstTc.indexOf('</w:tc>', nextTcStart);
    if (nextTcEnd === -1) return xml;

    const nextTcContent = afterFirstTc.substring(nextTcStart, nextTcEnd + 7);

    // Hücre içindeki text'i değiştir
    let newTcContent = nextTcContent;
    const textMatch = nextTcContent.match(/<w:t[^>]*>[^<]*<\/w:t>/);
    if (textMatch) {
        newTcContent = nextTcContent.replace(
            textMatch[0],
            textMatch[0].replace(/(<w:t[^>]*>)[^<]*(<\/w:t>)/, `$1${newValue}$2`)
        );
    }

    // Global pozisyona geri çevir ve değiştir
    const absolutePos = labelIdx + tcCloseIdx + 7 + nextTcStart;
    xml = xml.substring(0, absolutePos) + newTcContent + xml.substring(absolutePos + nextTcContent.length);

    return xml;
}

/**
 * Regex özel karakterlerini escape et
 */
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
    generateGenericWord,
    loadConfig,
    clearConfigCache
};
