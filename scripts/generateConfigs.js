/**
 * Tüm docx şablonlarını analiz edip otomatik config JSON oluştur
 */
const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');

const SABLON_DIR = path.join(__dirname, '../templates/şablonlar');
const CONFIG_DIR = path.join(__dirname, '../services/templateConfigs');

// Kategori -> raporNoPrefix mapping
const KATEGORI_MAP = {
    '1. Kaldırma İletme': { kategori: 'kaldirma-iletme', prefix: 'KI' },
    '2. Basınçlı Kaplar': { kategori: 'basinçli-kaplar', prefix: 'BK' },
    '3. İş Makinesi': { kategori: 'is-makinesi', prefix: 'IM' },
    '4. Elektrik': { kategori: 'elektrik', prefix: 'EL' },
    '5. Tesisat Kontrolü': { kategori: 'tesisat', prefix: 'TS' },
    '6- Makine Tezgahlar': { kategori: 'makine-tezgah', prefix: 'MT' },
    '7. Endüstriyel Raf ve Kapılar': { kategori: 'endustriyel', prefix: 'ER' }
};

function getRowText(rowXml) {
    const matches = rowXml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
    return matches.map(t => t.replace(/<[^>]+>/g, '')).join('').trim();
}

function getCellTexts(rowXml) {
    const cellRegex = /<w:tc[^>]*>[\s\S]*?<\/w:tc>/g;
    const cells = rowXml.match(cellRegex) || [];
    return cells.map(c => {
        const matches = c.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
        return matches.map(t => t.replace(/<[^>]+>/g, '')).join('').trim();
    });
}

async function analyzeTemplate(filePath) {
    const content = fs.readFileSync(filePath);
    const zip = await JSZip.loadAsync(content);
    const docXml = await zip.file('word/document.xml').async('string');

    const rowRegex = /<w:tr[^>]*>[\s\S]*?<\/w:tr>/g;
    const rows = docXml.match(rowRegex) || [];

    const sections = [];
    let currentSection = null;
    const ekipmanFields = [];
    const kontrolSorulari = [];
    const wordFields = [];
    let hasHeaderFile = false;

    // Header analizi
    const headerFile = zip.file('word/header2.xml') || zip.file('word/header1.xml');
    const headerFileName = zip.file('word/header2.xml') ? 'word/header2.xml' : (zip.file('word/header1.xml') ? 'word/header1.xml' : null);
    if (headerFile) {
        hasHeaderFile = true;
    }

    // Document body analizi
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowText = getRowText(row);
        const cellTexts = getCellTexts(row);
        const cellCount = cellTexts.length;

        if (!rowText || rowText.length < 2) continue;

        // Teknik Özellikler satırları: label | value | label | value pattern
        if (cellCount >= 4 && !rowText.includes('UYGUN') && !rowText.includes('Uygun')) {
            // Label-value çiftleri
            for (let j = 0; j < cellTexts.length - 1; j += 2) {
                const label = cellTexts[j].trim();
                if (label && label.length > 1 && label.length < 60 && !label.includes('GENEL') && !label.includes('TEKNİK') && !label.includes('Periyodik')) {
                    const fieldId = labelToFieldId(label);
                    if (fieldId && !ekipmanFields.find(f => f.id === fieldId)) {
                        ekipmanFields.push({ id: fieldId, label: label, type: 'text' });
                        wordFields.push({ label: label, field: fieldId });
                    }
                }
            }
        }

        // 2 sütunlu label-value
        if (cellCount === 2 && cellTexts[0].length > 2 && cellTexts[0].length < 60) {
            const label = cellTexts[0].trim();
            if (!label.includes('Sonuç') && !label.includes('SONUÇ') && !label.includes('UYGUN') && !label.includes('Kontrol Soru')) {
                const fieldId = labelToFieldId(label);
                if (fieldId && !ekipmanFields.find(f => f.id === fieldId)) {
                    ekipmanFields.push({ id: fieldId, label: label, type: 'text' });
                    wordFields.push({ label: label, field: fieldId });
                }
            }
        }

        // Kontrol soruları: UYGUN/UYGUN DEĞİL içeren satırlar
        if (rowText.includes('Uygun') || rowText.includes('UYGUN')) {
            // 6 sütunlu: [no][soru][sonuç][no][soru][sonuç]
            if (cellCount === 6) {
                for (let j = 0; j < cellCount; j += 3) {
                    const no = cellTexts[j].trim();
                    const soru = cellTexts[j + 1]?.trim();
                    if (soru && soru.length > 3 && /^\d+$/.test(no)) {
                        const soruId = 'soru' + no;
                        if (!kontrolSorulari.find(k => k.id === soruId)) {
                            kontrolSorulari.push({
                                id: soruId,
                                no: parseInt(no),
                                text: soru,
                                options: ['Uygun', 'Uygun Değil'],
                                default: 'Uygun'
                            });
                        }
                    }
                }
            }
            // 4 sütunlu: [no][soru][no/soru][sonuç]
            else if (cellCount === 4 || cellCount === 3) {
                const noMatch = cellTexts[0].match(/^\d+/);
                const soru = cellTexts[1]?.trim() || cellTexts[0].replace(/^\d+\.?\s*/, '').trim();
                if (soru && soru.length > 3 && noMatch) {
                    const soruId = 'soru' + noMatch[0];
                    if (!kontrolSorulari.find(k => k.id === soruId)) {
                        kontrolSorulari.push({
                            id: soruId,
                            no: parseInt(noMatch[0]),
                            text: soru,
                            options: ['Uygun', 'Uygun Değil'],
                            default: 'Uygun'
                        });
                    }
                }
            }
        }
    }

    return { ekipmanFields, kontrolSorulari, wordFields, hasHeaderFile, headerFileName };
}

function labelToFieldId(label) {
    if (!label || label.length < 2) return null;

    // Temizle
    let id = label
        .replace(/[()\/\-\.\,\:\;]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    // Skip bazı label'lar
    if (/^(No|S\.No|Sıra|UYGUN|Uygun|Test|Deney)$/i.test(id)) return null;
    if (id.length > 50) return null;

    // Türkçe karakter dönüşümü
    const trMap = { 'ı': 'i', 'ğ': 'g', 'ü': 'u', 'ş': 's', 'ö': 'o', 'ç': 'c',
                    'İ': 'I', 'Ğ': 'G', 'Ü': 'U', 'Ş': 'S', 'Ö': 'O', 'Ç': 'C' };
    id = id.replace(/[ığüşöçİĞÜŞÖÇ]/g, c => trMap[c] || c);

    // CamelCase yap
    const words = id.split(' ').filter(w => w.length > 0);
    if (words.length === 0) return null;

    id = words[0].toLowerCase() + words.slice(1).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');

    // Geçersiz karakterleri temizle
    id = id.replace(/[^a-zA-Z0-9]/g, '');

    return id.length > 2 ? id : null;
}

function extractFRCode(filename) {
    const match = filename.match(/FR7\.2\.(\d+)/);
    return match ? `FR7.2.${match[1]}` : null;
}

function extractEkipmanAdi(filename) {
    const match = filename.match(/FR7\.2\.\d+\s+(.+?)(?:\s+Muayene|\s+Ölçüm|\s+Rapor|\s*-\s*\d+|\.\s*docx)/i);
    return match ? match[1].trim() : filename.replace(/\.docx$/, '');
}

async function processTemplate(filePath, kategoriDir) {
    const filename = path.basename(filePath);
    const frCode = extractFRCode(filename);
    if (!frCode) {
        console.log(`  SKIP (no FR code): ${filename}`);
        return null;
    }

    const ekipmanAdi = extractEkipmanAdi(filename);
    const kategoriInfo = KATEGORI_MAP[kategoriDir] || { kategori: 'diger', prefix: 'DG' };

    // Relative path from project root
    const relativePath = path.relative(path.join(__dirname, '..'), filePath);

    try {
        const analysis = await analyzeTemplate(filePath);

        // Firma section (ortak)
        const firmaSection = {
            id: 'firma',
            title: 'Firma & Rapor Bilgileri',
            layout: 'row-2',
            fields: [
                { id: 'firmaAdi', label: 'Firma Adı', type: 'text', source: 'customer.unvan', readonly: true, autoFill: true },
                { id: 'bolumu', label: 'Bölümü', type: 'text', placeholder: 'Üretim, Bakım vb.' },
                { id: 'firmaAdres', label: 'Adresi', type: 'text', source: 'customer.adres', readonly: true, autoFill: true },
                { id: 'kontrolTarihi', label: 'Kontrol Tarihi', type: 'date' },
                { id: 'firmaTelefon', label: 'Tel/Fax', type: 'text', source: 'customer.telefon', readonly: true, autoFill: true },
                { id: 'raporTarihi', label: 'Rapor Tarihi', type: 'date' },
                { id: 'firmaEmail', label: 'E-mail', type: 'text', source: 'customer.email', readonly: true, autoFill: true },
                { id: 'sonrakiKontrolTarihi', label: 'Sonraki Kontrol Tarihi', type: 'date' },
                { id: 'firmaWeb', label: 'Web', type: 'text', source: 'customer.web', readonly: true, autoFill: true },
                { id: 'raporNo', label: 'Rapor No', type: 'text', readonly: true, autoFill: true },
                { id: 'sgkSicilNo', label: 'SGK Sicil No', type: 'text', placeholder: 'SGK Sicil No' },
                { id: 'isgKatipNo', label: 'İSG-KATİP Sözleşme ID', type: 'text', placeholder: 'İSG-KATİP No' }
            ]
        };

        // Ekipman section
        const ekipmanSection = {
            id: 'ekipman',
            title: `${ekipmanAdi} Teknik Özellikleri`,
            layout: 'row-2',
            fields: analysis.ekipmanFields.length > 0 ? analysis.ekipmanFields : [
                { id: 'markasi', label: 'Markası', type: 'text' },
                { id: 'tip', label: 'Tip', type: 'text' },
                { id: 'seriNo', label: 'Seri No', type: 'text' },
                { id: 'imalatYili', label: 'İmalat Yılı', type: 'text' }
            ]
        };

        // Kontrol section
        const kontrolSection = {
            id: 'kontrol',
            title: 'Tespit ve Değerlendirme',
            type: 'control-questions',
            badge: `${analysis.kontrolSorulari.length || 10} Kontrol`,
            questions: analysis.kontrolSorulari.length > 0 ? analysis.kontrolSorulari : generateDefaultSorular()
        };

        const sections = [
            firmaSection,
            ekipmanSection,
            kontrolSection,
            {
                id: 'kusur',
                title: 'Kusur Açıklamaları',
                fields: [{ id: 'kusurAciklama', label: 'Kusur Açıklaması', type: 'textarea', rows: 3, placeholder: 'Tespit edilen kusurları açıklayın...' }]
            },
            {
                id: 'notlar',
                title: 'Notlar',
                fields: [{ id: 'notlar', label: 'Ek Notlar', type: 'textarea', rows: 3, placeholder: 'Varsa ek açıklamalar...' }]
            },
            {
                id: 'sonuc',
                title: 'Sonuç ve Kanaat',
                type: 'sonuc',
                sonucText: `Periyodik kontrol tarihi itibari ile yukarıda teknik özellikleri belirtilen "${ekipmanAdi}" mevcut şartlar altında`
            }
        ];

        // Word mapping
        const headerFields = [
            { label: 'Firma Adı', source: 'firma.unvan' },
            { label: 'Adresi', source: 'firma.adres' },
            { label: 'Tel/Fax', source: 'firma.telefon' },
            { label: 'E-mail', source: 'firma.email' },
            { label: 'Web', source: 'firma.web' },
            { label: 'Bölümü', field: 'bolumu' },
            { label: 'Kontrol Tarihi', field: 'kontrolTarihi', format: 'date' },
            { label: 'Rapor Tarihi', field: 'raporTarihi', format: 'date' },
            { label: 'Sonraki Kontrol Tarihi', field: 'sonrakiKontrolTarihi', format: 'date' },
            { label: 'Rapor No', source: 'rapor.raporNo' },
            { label: 'SGK Sicil No', field: 'sgkSicilNo' },
            { label: 'İSG-KATİP Sözleşme ID', field: 'isgKatipNo' }
        ];

        const controlQuestionMappings = analysis.kontrolSorulari.map(q => ({
            field: q.id,
            text: q.text.substring(0, 30) // İlk 30 karakter eşleşme için yeterli
        }));

        const config = {
            sablonKodu: frCode,
            sablonAdi: `${ekipmanAdi} Muayene ve Ölçüm Raporu`,
            kategori: kategoriInfo.kategori,
            raporNoPrefix: kategoriInfo.prefix,
            sections,
            wordMapping: {
                templatePath: relativePath,
                headerFile: analysis.headerFileName || null,
                headerFields: analysis.hasHeaderFile ? headerFields : undefined,
                fields: [
                    ...headerFields,
                    ...analysis.wordFields
                ],
                controlQuestions: controlQuestionMappings.length > 0 ? {
                    mode: 'last',
                    questions: controlQuestionMappings
                } : undefined
            }
        };

        return { frCode, config };
    } catch (e) {
        console.log(`  ERROR: ${filename} - ${e.message}`);
        return null;
    }
}

function generateDefaultSorular() {
    return Array.from({ length: 10 }, (_, i) => ({
        id: `soru${i + 1}`,
        no: i + 1,
        text: `Kontrol kriteri ${i + 1}`,
        options: ['Uygun', 'Uygun Değil'],
        default: 'Uygun'
    }));
}

async function main() {
    if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }

    // Sadece mekanik kategoriler (elektrik ve tesisat hariç)
    const targetCategories = [
        '1. Kaldırma İletme',
        '2. Basınçlı Kaplar',
        '3. İş Makinesi',
        '6- Makine Tezgahlar',
        '7. Endüstriyel Raf ve Kapılar'
    ];

    let totalGenerated = 0;
    let totalSkipped = 0;
    const generatedCodes = [];

    for (const kategoriDir of targetCategories) {
        const kategoriPath = path.join(SABLON_DIR, kategoriDir);
        if (!fs.existsSync(kategoriPath)) {
            console.log(`Kategori bulunamadı: ${kategoriDir}`);
            continue;
        }

        console.log(`\n=== ${kategoriDir} ===`);

        // Alt klasörlerde docx ara
        const findDocx = (dir) => {
            let results = [];
            const items = fs.readdirSync(dir);
            for (const item of items) {
                const fullPath = path.join(dir, item);
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                    results = results.concat(findDocx(fullPath));
                } else if (item.endsWith('.docx') && !item.startsWith('._') && !item.includes('Kopya') && !item.includes('BACKUP')) {
                    results.push(fullPath);
                }
            }
            return results;
        };

        const docxFiles = findDocx(kategoriPath);
        console.log(`${docxFiles.length} şablon bulundu`);

        for (const docxFile of docxFiles) {
            const result = await processTemplate(docxFile, kategoriDir);
            if (result) {
                // Aynı FR kodu varsa skip
                const configPath = path.join(CONFIG_DIR, `${result.frCode}.json`);
                if (fs.existsSync(configPath)) {
                    console.log(`  EXISTS: ${result.frCode} (skip)`);
                    totalSkipped++;
                    continue;
                }

                fs.writeFileSync(configPath, JSON.stringify(result.config, null, 2), 'utf8');
                console.log(`  OK: ${result.frCode} - ${result.config.sablonAdi}`);
                generatedCodes.push(result.frCode);
                totalGenerated++;
            }
        }
    }

    console.log(`\n========================================`);
    console.log(`Toplam: ${totalGenerated} config oluşturuldu, ${totalSkipped} atlandı`);
    console.log(`Oluşturulan kodlar: ${generatedCodes.join(', ')}`);
}

main().catch(console.error);
