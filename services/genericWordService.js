/**
 * Generic Word Rapor Servisi
 * Tüm şablon tiplerini config-driven olarak doldurur
 */

const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');
const { formatDate, formatDateTime, getNextYearDate, escapeXml } = require('./wordHelpers');
const { setValueByLabel, setKontrolSorusu, setTestRow, fillKusurTable, fillNotlarTable } = require('./wordCellOperations');
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
            zip.file(config.wordMapping.headerFile, headerXml);
        }
    }

    // === 2. DOCUMENT FIELD'LARI ===
    docXml = fillFieldMappings(docXml, config.wordMapping.fields, rapor, formData, firma, firmaBilgi, options);

    // === 3. KONTROL SORULARI ===
    if (config.wordMapping.controlQuestions) {
        const cq = config.wordMapping.controlQuestions;
        const questions = cq.questions || [];
        for (const q of questions) {
            const deger = getValue(q.field, rapor, formData, options);
            if (deger) {
                const mode = q.mode || cq.mode || 'last';
                const exact = q.exact || false;
                docXml = setKontrolSorusu(docXml, q.text, deger, mode, exact);
            }
        }
    }

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

    // === 7. KUSUR & NOTLAR (fallback - config'de tablo olarak da tanımlanabilir) ===
    const kusurText = getValue('kusurAciklama', rapor, formData, options);
    if (kusurText) docXml = fillKusurTable(docXml, kusurText);

    const notlarText = getValue('notlar', rapor, formData, options);
    if (notlarText) docXml = fillNotlarTable(docXml, notlarText);

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

    zip.file('word/document.xml', docXml);

    return await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 9 }
    });
}

/**
 * Field mapping'leri uygula
 */
function fillFieldMappings(xml, fields, rapor, formData, firma, firmaBilgi, options) {
    if (!fields) return xml;

    for (const mapping of fields) {
        let value = null;

        // Kaynak belirleme
        if (mapping.source) {
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
        // Varsayılan: "uygundur" kelimesini bul ve renklendir
        const sonucMetni = uygun ? 'uygundur' : 'uygun değildir';
        const sonucRenk = uygun ? '059669' : 'DC2626';

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
    }

    return docXml;
}

module.exports = {
    generateGenericWord,
    loadConfig,
    clearConfigCache
};
