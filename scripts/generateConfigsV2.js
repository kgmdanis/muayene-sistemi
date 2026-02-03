/**
 * V2 - Detaylı docx analizi ile doğru config JSON oluşturma
 * Her şablonun XML yapısını birebir okuyarak section/field/kontrol soruları çıkarır
 */
const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');

const SABLON_DIR = path.join(__dirname, '../templates/şablonlar');
const CONFIG_DIR = path.join(__dirname, '../services/templateConfigs');

// Manuel oluşturulan config'leri koru
const MANUAL_CONFIGS = ['FR7.2.21.json', 'FR7.2.156.json', 'FR7.2.36.json'];

const KATEGORI_MAP = {
    '1. Kaldırma İletme': { kategori: 'kaldırma iletme', altKategori: 'kaldırma iletme', prefix: 'Kİ', raporNoPrefix: 'KI' },
    '2. Basınçlı Kaplar': { kategori: 'basınçlı kaplar', altKategori: 'basınçlı kaplar', prefix: 'BK', raporNoPrefix: 'BK' },
    '3. İş Makinesi': { kategori: 'iş makineleri', altKategori: 'iş makineleri', prefix: 'İM', raporNoPrefix: 'IM' },
    '6- Makine Tezgahlar': { kategori: 'makine tezgahlar', altKategori: 'makine tezgahlar', prefix: 'MT', raporNoPrefix: 'MT' },
    '7. Endüstriyel Raf ve Kapılar': { kategori: 'endüstriyel', altKategori: 'endüstriyel raf ve kapılar', prefix: 'ER', raporNoPrefix: 'ER' }
};

// Satır sınıf tespiti
const SECTION_TITLES = [
    'İŞ EKİPMANINA AİT TEKNİK ÖZELLİKLER', 'TEKNIK ÖZELLIKLER', 'TEKNİK ÖZELLİKLER',
    'ARACA AİT TEKNİK ÖZELLİKLER',
    'MOTOR BİLGİLERİ',
    'HALAT', 'ZİNCİR', 'KANCA',
    'ELEKTRİKSEL YAPI',
    'YARDIMCI DONANIMLAR', 'YARDIMCI DONANMLAR',
    'BASINÇ KAYNAĞI BİLGİLERİ', 'BASINÇ KAYNAĞI',
    'KULLANIM TİPİ',
    'KULLANILAN EKİPMANIN ÖZELLİKLERİ', 'KULLANILAN EKİPMAN',
    'PERİYODİK KONTROL METODU', 'PERIYODIK KONTROL',
    'TESPİT VE DEĞERLENDİRME', 'TESPIT VE DEGERLENDIRME',
    'TEST, DENEY VE MUAYENE', 'TEST DENEY',
    'İKAZ VE ÖNERİLER', 'IKAZ VE ONERILER',
    'SONUÇ VE KANAAT', 'SONUC VE KANAAT',
    'ONAY',
    'KUSUR', 'NOTLAR',
    'KAZAN DONANIMLARI', 'OTOKLAV DONANIMLARI',
    'BRÜLÖR BİLGİLERİ',
    'TEST DEĞERLERİ',
    'KONTROL KRİTERLERİ'
];

function extractRows(xml) {
    const rows = [];
    const rowRegex = /<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g;
    let m;
    while ((m = rowRegex.exec(xml)) !== null) {
        const cellTexts = [];
        const cellRegex = /<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g;
        let cm;
        while ((cm = cellRegex.exec(m[1])) !== null) {
            const tTexts = [];
            const tRegex = /<w:t[^>]*>([^<]+)<\/w:t>/g;
            let tm;
            while ((tm = tRegex.exec(cm[1])) !== null) {
                tTexts.push(tm[1]);
            }
            cellTexts.push(tTexts.join(''));
        }
        rows.push(cellTexts);
    }
    return rows;
}

function isSectionTitle(cells) {
    const text = cells.join(' ').toUpperCase().replace(/\s+/g, ' ').trim();
    if (!text) return null;
    for (const title of SECTION_TITLES) {
        if (text.includes(title.toUpperCase())) return title;
    }
    return null;
}

function isUygunRow(cells) {
    return cells.some(c => c.trim() === 'UYGUN' || c.trim() === 'Uygun' || c.trim() === 'UYGUN DEĞİL' || c.trim() === 'Uygun Değil');
}

function slugify(text) {
    return text
        .toLowerCase()
        .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
        .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
        .replace(/İ/g, 'i').replace(/Ğ/g, 'g').replace(/Ü/g, 'u')
        .replace(/Ş/g, 's').replace(/Ö/g, 'o').replace(/Ç/g, 'c')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
}

function findHeaderFile(zip) {
    // header2.xml genelde daha çok alan içerir
    for (const hf of ['word/header2.xml', 'word/header1.xml']) {
        if (zip.files[hf]) return hf;
    }
    return null;
}

async function analyzeTemplate(filePath, katInfo) {
    const buf = fs.readFileSync(filePath);
    const zip = await JSZip.loadAsync(buf);
    const fileName = path.basename(filePath, '.docx');

    // FR kodu çıkar
    const frMatch = fileName.match(/FR[\d.]+/);
    if (!frMatch) return null;
    const frKodu = frMatch[0];

    // Şablon adını çıkar
    const sablonAdi = fileName
        .replace(/FR[\d.]+\s*/, '')
        .replace(/-\d+$/, '')
        .trim();

    // Header analizi
    const headerFile = findHeaderFile(zip);
    let headerRows = [];
    if (headerFile && zip.files[headerFile]) {
        const hXml = await zip.file(headerFile).async('string');
        headerRows = extractRows(hXml);
    }

    // Body analizi
    const docXml = await zip.file('word/document.xml').async('string');
    const bodyRows = extractRows(docXml);

    // Her satırı sınıflandır
    const classified = classifyRows(bodyRows);

    // Config oluştur
    const config = buildConfig(frKodu, sablonAdi, katInfo, headerFile, headerRows, classified, filePath);
    return config;
}

function classifyRows(rows) {
    const result = [];
    let currentSection = null;

    for (let i = 0; i < rows.length; i++) {
        const cells = rows[i];
        const nonEmpty = cells.filter(c => c.trim());
        if (nonEmpty.length === 0) continue;

        const sectionTitle = isSectionTitle(cells);
        if (sectionTitle) {
            currentSection = sectionTitle;
            result.push({ type: 'section-title', title: sectionTitle, cells, index: i });
            continue;
        }

        // Uygun/Uygun Değil satırı = kontrol sorusu
        if (isUygunRow(cells)) {
            result.push({ type: 'kontrol', section: currentSection, cells, index: i });
            continue;
        }

        // Label-value tespiti
        if (cells.length >= 2) {
            result.push({ type: 'field', section: currentSection, cells, index: i });
        } else if (cells.length === 1 && nonEmpty.length === 1) {
            result.push({ type: 'text', section: currentSection, cells, index: i });
        }
    }

    return result;
}

function buildConfig(frKodu, sablonAdi, katInfo, headerFile, headerRows, classified, filePath) {
    const config = {
        sablonKodu: frKodu,
        sablonAdi: sablonAdi,
        kategori: katInfo.kategori,
        altKategori: katInfo.altKategori,
        raporNoPrefix: katInfo.raporNoPrefix,
        sections: [],
        wordMapping: {
            templatePath: path.relative(path.join(__dirname, '..'), filePath).replace(/\\/g, '/'),
            headerFile: headerFile || 'word/header2.xml',
            fields: [],
            controlQuestions: {
                mode: 'next',
                questions: []
            }
        }
    };

    // ===== HEADER FIELDS (firma bilgileri - her zaman aynı) =====
    config.sections.push({
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
    });

    // Word mapping - header fields
    config.wordMapping.fields.push(
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
        { label: 'Sözleşme ID', field: 'isgKatipNo' }
    );

    // ===== BODY SECTIONS =====
    let ekipmanFields = [];
    let motorFields = [];
    let halatFields = [];
    let elektrikselFields = [];
    let donaninFields = [];
    let brulurFields = [];
    let basincFields = [];
    let testFields = [];
    let kontrolSorulari = [];
    let sonucText = '';
    let currentBodySection = null;

    for (const item of classified) {
        if (item.type === 'section-title') {
            currentBodySection = item.title.toUpperCase();
            continue;
        }

        const cells = item.cells.filter(c => c.trim());
        if (cells.length === 0) continue;

        // Kontrol sorusu
        if (item.type === 'kontrol') {
            const questionCells = item.cells.filter(c => c.trim());
            // Soru metni UYGUN olmayan ilk hücre
            const questionText = questionCells.find(c => !c.match(/^(UYGUN|Uygun)(\s|$)/i)) || '';
            const resultValue = questionCells.find(c => c.match(/^(UYGUN|Uygun)/i)) || 'Uygun';
            if (questionText.trim()) {
                kontrolSorulari.push({
                    text: questionText.trim().replace(/^\d+[\.\)\-\s]+/, ''), // Numarayı kaldır
                    fullText: questionText.trim(),
                    defaultValue: resultValue.trim().includes('DEĞİL') || resultValue.trim().includes('DEGIL') ? 'Uygun Değil' : 'Uygun'
                });
            }
            continue;
        }

        if (item.type === 'text') {
            const text = cells[0];
            // Sonuç metni
            if (text.includes('uygundur') || text.includes('uygun değildir') || text.includes('mevcut şartlar')) {
                sonucText = text;
            }
            continue;
        }

        // Field satırları - hangi section'a ait?
        if (item.type === 'field') {
            const allCells = item.cells;

            // Teknik özellikler
            if (currentBodySection && (currentBodySection.includes('TEKNİK') || currentBodySection.includes('TEKNIK'))) {
                // ARACA AIT veya normal teknik
                if (currentBodySection.includes('ARACA')) {
                    // Araç teknik özellikleri (İş Makinesi)
                    extractLabelValuePairs(allCells, ekipmanFields, 'arac_');
                } else {
                    extractLabelValuePairs(allCells, ekipmanFields, '');
                }
            }
            // Motor bilgileri
            else if (currentBodySection && currentBodySection.includes('MOTOR')) {
                extractLabelValuePairs(allCells, motorFields, 'motor_');
            }
            // Halat/Zincir/Kanca
            else if (currentBodySection && (currentBodySection.includes('HALAT') || currentBodySection.includes('ZİNCİR') || currentBodySection.includes('KANCA'))) {
                extractLabelValuePairs(allCells, halatFields, 'halat_');
            }
            // Elektriksel yapı
            else if (currentBodySection && currentBodySection.includes('ELEKTRİK')) {
                extractLabelValuePairs(allCells, elektrikselFields, 'elektrik_');
            }
            // Donanımlar
            else if (currentBodySection && (currentBodySection.includes('DONANIM') || currentBodySection.includes('KAZAN DONANIM') || currentBodySection.includes('OTOKLAV'))) {
                extractLabelValuePairs(allCells, donaninFields, 'donanim_');
            }
            // Brülör
            else if (currentBodySection && currentBodySection.includes('BRÜLÖR')) {
                extractLabelValuePairs(allCells, brulurFields, 'brulor_');
            }
            // Basınç kaynağı
            else if (currentBodySection && currentBodySection.includes('BASIN')) {
                extractLabelValuePairs(allCells, basincFields, 'basinc_');
            }
            // Test değerleri
            else if (currentBodySection && (currentBodySection.includes('TEST') && !currentBodySection.includes('TESPİT'))) {
                extractLabelValuePairs(allCells, testFields, 'test_');
            }
        }
    }

    // ===== EKİPMAN SECTION =====
    if (ekipmanFields.length > 0) {
        const section = {
            id: 'ekipman',
            title: 'İş Ekipmanına Ait Teknik Özellikler',
            layout: ekipmanFields.length > 6 ? 'row-2' : 'row-2',
            fields: ekipmanFields.map(f => ({
                id: f.id,
                label: f.label,
                type: 'text',
                placeholder: f.placeholder || f.label
            }))
        };
        config.sections.push(section);

        // Word mapping
        ekipmanFields.forEach(f => {
            config.wordMapping.fields.push({ label: f.wordLabel || f.label, field: f.id });
        });
    }

    // ===== MOTOR BİLGİLERİ =====
    if (motorFields.length > 0) {
        config.sections.push({
            id: 'motor',
            title: 'Motor Bilgileri',
            layout: 'row-2',
            fields: motorFields.map(f => ({
                id: f.id, label: f.label, type: 'text', placeholder: f.label
            }))
        });
        motorFields.forEach(f => {
            config.wordMapping.fields.push({ label: f.wordLabel || f.label, field: f.id });
        });
    }

    // ===== HALAT/ZİNCİR/KANCA =====
    if (halatFields.length > 0) {
        config.sections.push({
            id: 'halat',
            title: 'Halat/Zincir ve Kanca Bilgileri',
            layout: 'row-2',
            fields: halatFields.map(f => ({
                id: f.id, label: f.label, type: 'text', placeholder: f.label
            }))
        });
        halatFields.forEach(f => {
            config.wordMapping.fields.push({ label: f.wordLabel || f.label, field: f.id });
        });
    }

    // ===== ELEKTRİKSEL YAPI =====
    if (elektrikselFields.length > 0) {
        config.sections.push({
            id: 'elektriksel',
            title: 'Elektriksel Yapı',
            layout: 'row-2',
            fields: elektrikselFields.map(f => ({
                id: f.id, label: f.label, type: 'text', placeholder: f.label
            }))
        });
        elektrikselFields.forEach(f => {
            config.wordMapping.fields.push({ label: f.wordLabel || f.label, field: f.id });
        });
    }

    // ===== DONANIMLAR =====
    if (donaninFields.length > 0) {
        config.sections.push({
            id: 'donanim',
            title: 'Yardımcı Donanımlar',
            layout: 'row-2',
            fields: donaninFields.map(f => ({
                id: f.id, label: f.label, type: 'text', placeholder: f.label
            }))
        });
        donaninFields.forEach(f => {
            config.wordMapping.fields.push({ label: f.wordLabel || f.label, field: f.id });
        });
    }

    // ===== BRÜLÖR =====
    if (brulurFields.length > 0) {
        config.sections.push({
            id: 'brulor',
            title: 'Brülör Bilgileri',
            layout: 'row-2',
            fields: brulurFields.map(f => ({
                id: f.id, label: f.label, type: 'text', placeholder: f.label
            }))
        });
        brulurFields.forEach(f => {
            config.wordMapping.fields.push({ label: f.wordLabel || f.label, field: f.id });
        });
    }

    // ===== BASINÇ KAYNAĞI =====
    if (basincFields.length > 0) {
        config.sections.push({
            id: 'basinc',
            title: 'Basınç Kaynağı Bilgileri',
            layout: 'row-2',
            fields: basincFields.map(f => ({
                id: f.id, label: f.label, type: 'text', placeholder: f.label
            }))
        });
        basincFields.forEach(f => {
            config.wordMapping.fields.push({ label: f.wordLabel || f.label, field: f.id });
        });
    }

    // ===== TEST DEĞERLERİ =====
    if (testFields.length > 0) {
        config.sections.push({
            id: 'test',
            title: 'Test Değerleri',
            layout: 'row-3',
            fields: testFields.map(f => ({
                id: f.id, label: f.label, type: 'text', placeholder: f.label
            }))
        });
        testFields.forEach(f => {
            config.wordMapping.fields.push({ label: f.wordLabel || f.label, field: f.id });
        });
    }

    // ===== KONTROL SORULARI =====
    if (kontrolSorulari.length > 0) {
        const questions = kontrolSorulari.map((q, i) => ({
            id: 'kriter' + (i + 1),
            no: i + 1,
            text: q.text,
            options: ['Uygun', 'Uygun Değil'],
            default: 'Uygun'
        }));

        config.sections.push({
            id: 'kontrol',
            title: 'Tespit ve Değerlendirme',
            type: 'control-questions',
            badge: questions.length + ' Kontrol',
            questions: questions
        });

        // Word mapping
        config.wordMapping.controlQuestions.questions = kontrolSorulari.map((q, i) => ({
            field: 'kriter' + (i + 1),
            text: findMatchWord(q.text)
        }));
    }

    // ===== KUSUR =====
    config.sections.push({
        id: 'kusur',
        title: 'İkaz ve Öneriler',
        fields: [
            { id: 'ikazOneriler', label: 'İkaz ve Öneriler', type: 'textarea', rows: 3, placeholder: 'Tespit edilen kusur ve önerileri açıklayın...' }
        ]
    });

    // ===== SONUÇ =====
    // Ekipman adını sonuç metnine koy
    const ekipmanAdi = sablonAdi.replace(/Muayene.*$/i, '').replace(/Raporu.*$/i, '').trim();
    config.sections.push({
        id: 'sonuc',
        title: 'Sonuç ve Kanaat',
        type: 'sonuc',
        sonucText: `Periyodik kontrol tarihi itibari ile yukarıda teknik özellikleri belirtilen "${ekipmanAdi}" mevcut şartlar altında`
    });

    return config;
}

function extractLabelValuePairs(cells, fieldArray, prefix) {
    // 2-cell: [label, value]
    // 4-cell: [label1, value1, label2, value2]
    // 6-cell: [label1, value1, label2, value2, label3, value3]
    const seen = new Set(fieldArray.map(f => f.label));

    for (let i = 0; i < cells.length - 1; i += 2) {
        const label = cells[i]?.trim();
        const value = cells[i + 1]?.trim();

        if (!label) continue;
        // Skip section titles and non-label items
        if (label.length > 80) continue;
        if (label.match(/^(UYGUN|TESPİT|TEST|SONUÇ|İKAZ|KULLAN|PERİYODİK|ONAY)/i)) continue;
        // Skip purely numeric or empty labels
        if (label.match(/^\d+$/)) continue;

        // Duplicate check
        if (seen.has(label)) continue;
        seen.add(label);

        const id = prefix + slugify(label);
        if (!id || id.length < 2) continue;

        fieldArray.push({
            id: id,
            label: label,
            wordLabel: label,
            placeholder: value || label
        });
    }
}

function findMatchWord(text) {
    // Kontrol sorusundan Word'de eşleşecek anahtar kelimeyi bul
    // İlk 2-3 anlamlı kelimeyi al
    const cleaned = text
        .replace(/^\d+[\.\)\-\s]+/, '')
        .replace(/\s+/g, ' ')
        .trim();

    // Uzun soru ise ilk birkaç kelimeyi al
    const words = cleaned.split(/\s+/);
    if (words.length <= 3) return cleaned;

    // İlk 3-4 anlamlı kelimeyi al
    return words.slice(0, Math.min(4, words.length)).join(' ');
}

async function processCategory(catDir, catName) {
    const katInfo = KATEGORI_MAP[catName];
    if (!katInfo) {
        console.log(`  ⏩ Kategori atlandı (config yok): ${catName}`);
        return 0;
    }

    const fullCatDir = path.join(SABLON_DIR, catName);
    let count = 0;
    const seenFR = new Set();

    // Makine Tezgahlar - düz dizin (alt klasör yok)
    const items = fs.readdirSync(fullCatDir);
    const hasSubDirs = items.some(i => {
        const fullPath = path.join(fullCatDir, i);
        return fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory() && !i.startsWith('.');
    });

    if (hasSubDirs) {
        // Alt klasörlü yapı
        for (const subDir of items.sort()) {
            const subFullPath = path.join(fullCatDir, subDir);
            if (!fs.existsSync(subFullPath) || !fs.statSync(subFullPath).isDirectory() || subDir.startsWith('.')) continue;
            if (subDir.includes('Kopya') || subDir.includes('kopya')) continue;

            const docxFiles = fs.readdirSync(subFullPath)
                .filter(f => f.endsWith('.docx') && !f.startsWith('~') && !f.startsWith('.') && !f.includes('Kopya'));
            if (docxFiles.length === 0) continue;

            const file = docxFiles[0];
            const frMatch = file.match(/FR[\d.]+/);
            if (!frMatch) continue;
            if (seenFR.has(frMatch[0])) continue;
            seenFR.add(frMatch[0]);

            try {
                const config = await analyzeTemplate(path.join(subFullPath, file), katInfo);
                if (config) {
                    const configFile = path.join(CONFIG_DIR, config.sablonKodu + '.json');
                    // Manuel config varsa atla
                    if (MANUAL_CONFIGS.includes(config.sablonKodu + '.json')) {
                        console.log(`  ⏩ Manuel config korundu: ${config.sablonKodu}`);
                        continue;
                    }
                    fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf8');
                    console.log(`  ✅ ${config.sablonKodu} - ${config.sablonAdi} (${config.wordMapping.controlQuestions.questions.length} kontrol, ${config.sections.length - 3} özel section)`);
                    count++;
                }
            } catch (e) {
                console.log(`  ❌ ${subDir}/${file}: ${e.message}`);
            }
        }
    } else {
        // Düz dizin (Makine Tezgahlar)
        const docxFiles = items.filter(f => f.endsWith('.docx') && !f.startsWith('~') && !f.startsWith('.') && !f.includes('Kopya'));
        for (const file of docxFiles.sort()) {
            const frMatch = file.match(/FR[\d.]+/);
            if (!frMatch) continue;
            if (seenFR.has(frMatch[0])) continue;
            seenFR.add(frMatch[0]);

            try {
                const config = await analyzeTemplate(path.join(fullCatDir, file), katInfo);
                if (config) {
                    const configFile = path.join(CONFIG_DIR, config.sablonKodu + '.json');
                    if (MANUAL_CONFIGS.includes(config.sablonKodu + '.json')) {
                        console.log(`  ⏩ Manuel config korundu: ${config.sablonKodu}`);
                        continue;
                    }
                    fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf8');
                    console.log(`  ✅ ${config.sablonKodu} - ${config.sablonAdi} (${config.wordMapping.controlQuestions.questions.length} kontrol)`);
                    count++;
                }
            } catch (e) {
                console.log(`  ❌ ${file}: ${e.message}`);
            }
        }
    }

    return count;
}

async function main() {
    console.log('🔧 Config V2 Generator - Detaylı Docx Analizi');
    console.log('================================================\n');

    // Eski auto-generated config'leri sil (manual olanları koru)
    const existingConfigs = fs.readdirSync(CONFIG_DIR).filter(f => f.endsWith('.json'));
    let deleted = 0;
    for (const f of existingConfigs) {
        if (!MANUAL_CONFIGS.includes(f)) {
            fs.unlinkSync(path.join(CONFIG_DIR, f));
            deleted++;
        }
    }
    console.log(`🗑️  ${deleted} eski config silindi (${MANUAL_CONFIGS.length} manuel config korundu)\n`);

    let total = 0;
    const categories = fs.readdirSync(SABLON_DIR).filter(d => {
        const full = path.join(SABLON_DIR, d);
        return fs.existsSync(full) && fs.statSync(full).isDirectory();
    }).sort();

    for (const cat of categories) {
        // Elektrik ve Tesisat'ı atla
        if (cat.includes('Elektrik') || cat.includes('Tesisat')) {
            console.log(`⏩ ${cat} - Atlandı (sonra yapılacak)`);
            continue;
        }

        console.log(`\n📂 ${cat}`);
        console.log('─'.repeat(50));
        const count = await processCategory(cat, cat);
        total += count;
        console.log(`   Toplam: ${count} config`);
    }

    console.log(`\n================================================`);
    console.log(`✅ Toplam: ${total} config oluşturuldu`);
    console.log(`📁 Dizin: ${CONFIG_DIR}`);
}

main().catch(e => console.error('Fatal error:', e));
