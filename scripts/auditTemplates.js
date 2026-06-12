const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

// Gerçek Word motorunun eşleştirme mantığını birebir kullan (Türkçe karakter +
// boşluk normalize). Naif includes() kullanıldığında "Sözlesme ID", trailing-space
// vb. farklarda sahte "bulunamadı" hataları üretiliyordu.
const { normalizeLabel, labelsMatch, getCellText } = require('../services/wordCellOperations');

const CONFIGS_DIR = path.join(__dirname, '..', 'services', 'templateConfigs');
const BASE_DIR = path.join(__dirname, '..');

// XML'den text çıkar
function extractText(xml) {
    const matches = xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
    return matches.map(t => t.replace(/<[^>]+>/g, '')).join('').trim();
}

// Tablo yapısını analiz et
function analyzeTable(tableXml) {
    const rows = tableXml.match(/<w:tr[^>]*>[\s\S]*?<\/w:tr>/g) || [];
    return rows.map((row, rowIdx) => {
        const cells = row.match(/<w:tc[^>]*>[\s\S]*?<\/w:tc>/g) || [];
        return {
            rowIdx,
            colCount: cells.length,
            cells: cells.map(c => extractText(c))
        };
    });
}

// Text'in belgede kaç yerde geçtiğini bul
function findTextOccurrences(xml, searchText) {
    const rowRegex = /<w:tr[^>]*>[\s\S]*?<\/w:tr>/g;
    const rows = xml.match(rowRegex) || [];
    const occurrences = [];

    rows.forEach((row, rowIdx) => {
        const cells = row.match(/<w:tc[^>]*>[\s\S]*?<\/w:tc>/g) || [];
        cells.forEach((cell, colIdx) => {
            const cellText = extractText(cell);
            if (cellText.includes(searchText)) {
                occurrences.push({
                    rowIdx,
                    colIdx,
                    colCount: cells.length,
                    cellText: cellText.substring(0, 80),
                    exactMatch: cellText.trim() === searchText.trim()
                });
            }
        });
    });
    return occurrences;
}

// Field label'ı gerçek motorun yaptığı gibi HÜCRE bazında, normalize ederek ara.
// (setValueByLabel ile aynı labelsMatch mantığı — sahte uyumsuzlukları önler.)
function findLabelCells(xml, label) {
    const rows = xml.match(/<w:tr[^>]*>[\s\S]*?<\/w:tr>/g) || [];
    const occurrences = [];
    rows.forEach((row, rowIdx) => {
        const cells = row.match(/<w:tc[^>]*>[\s\S]*?<\/w:tc>/g) || [];
        cells.forEach((cell, colIdx) => {
            const cellText = getCellText(cell);
            if (cellText && labelsMatch(cellText, label)) {
                occurrences.push({ rowIdx, colIdx, colCount: cells.length, cellText: cellText.substring(0, 80) });
            }
        });
    });
    return occurrences;
}

// autoDetectAndFill tarafından otomatik doldurulan alanlar (Sözleşme ID) statik
// label eşleşmesi gerektirmez; "bulunamadı" sahte hatası üretmesinler.
function isAutoDetectedField(field) {
    if (field.source && /isgKatipId/i.test(field.source)) return true;
    if (field.label && normalizeLabel(field.label).includes('sozlesme')) return true;
    return false;
}

async function auditConfig(configFile) {
    const issues = [];
    const warnings = [];
    const configPath = path.join(CONFIGS_DIR, configFile);
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const sablonKodu = config.sablonKodu;

    // 1. Şablon dosyası var mı?
    if (!config.wordMapping || !config.wordMapping.templatePath) {
        issues.push(`[${sablonKodu}] wordMapping.templatePath tanımlı değil`);
        return { sablonKodu, issues, warnings };
    }

    const templatePath = path.join(BASE_DIR, config.wordMapping.templatePath);
    if (!fs.existsSync(templatePath)) {
        issues.push(`[${sablonKodu}] Şablon dosyası bulunamadı: ${config.wordMapping.templatePath}`);
        return { sablonKodu, issues, warnings };
    }

    // Word dosyasını aç
    let docXml, headerXml;
    try {
        const zip = await JSZip.loadAsync(fs.readFileSync(templatePath));
        docXml = await zip.file('word/document.xml').async('string');
        if (config.wordMapping.headerFile) {
            const hf = zip.file(config.wordMapping.headerFile);
            if (hf) headerXml = await hf.async('string');
        }
    } catch (e) {
        issues.push(`[${sablonKodu}] Word dosyası okunamadı: ${e.message}`);
        return { sablonKodu, issues, warnings };
    }

    const fullXml = (headerXml || '') + docXml;

    // 2. Tablo yapılarını analiz et
    const tables = docXml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) || [];
    const tableStructures = tables.map((t, i) => ({
        index: i,
        rows: analyzeTable(t)
    }));

    // 3. Field label eşleşme kontrolü (gerçek motor mantığı: hücre bazında labelsMatch)
    if (config.wordMapping.fields) {
        for (const field of config.wordMapping.fields) {
            if (!field.label) continue;
            const occs = findLabelCells(fullXml, field.label);
            if (occs.length === 0) {
                // autoDetectAndFill ile dolan alanlar statik label gerektirmez → sahte hata değil
                if (isAutoDetectedField(field)) continue;
                issues.push(`[${sablonKodu}] Label bulunamadı: "${field.label}" (field: ${field.field || field.source})`);
            } else if (occs.length > 1) {
                warnings.push(`[${sablonKodu}] Label birden fazla yerde: "${field.label}" (${occs.length} kez) - yanlış hücreye yazabilir`);
            }
        }
    }

    // 4. Control questions analizi
    if (config.wordMapping.controlQuestions) {
        const cq = config.wordMapping.controlQuestions;
        const globalMode = cq.mode || 'last';
        const questions = cq.questions || [];

        for (const q of questions) {
            const occs = findTextOccurrences(docXml, q.text);

            if (occs.length === 0) {
                issues.push(`[${sablonKodu}] Kontrol sorusu bulunamadı: "${q.text}" (field: ${q.field})`);
                continue;
            }

            if (occs.length > 1) {
                const exactCount = occs.filter(o => o.exactMatch).length;
                if (!q.exact) {
                    issues.push(`[${sablonKodu}] ⚠️ ÇAKIŞMA: "${q.text}" ${occs.length} yerde bulundu (exact:${exactCount}) - "exact":true gerekebilir (field: ${q.field})`);
                }
            }

            // Mode vs sütun sayısı kontrolü
            const mode = q.mode || globalMode;
            for (const occ of occs) {
                if (mode === 'next' && occ.colCount >= 4) {
                    // 4+ sütunlu tabloda next mode: sütun 1'e yazar (adet), sütun 3 (durum) boş kalır
                    warnings.push(`[${sablonKodu}] mode:"next" + ${occ.colCount} sütun: "${q.text}" → sütun ${occ.colIdx + 1}'e yazacak, son sütuna değil (field: ${q.field})`);
                }
                if (mode === 'last' && occ.colCount === 2 && occ.colIdx === 0) {
                    // 2 sütunlu tabloda last = next, sorun yok
                }
            }

            // Kısmi eşleşme riski: kısa text'ler başka uzun text'lerin içinde geçiyor mu?
            if (q.text.length < 25 && !q.exact) {
                const allOccs = findTextOccurrences(docXml, q.text);
                const nonExact = allOccs.filter(o => !o.exactMatch);
                if (nonExact.length > 0) {
                    warnings.push(`[${sablonKodu}] Kısmi eşleşme riski: "${q.text}" kısa text, ${nonExact.length} yerde kısmi eşleşme var - "exact":true önerilir (field: ${q.field})`);
                }
            }
        }
    }

    // 5. Büyük/küçük harf tutarsızlığı (şablondaki varsayılan değerler)
    const uygunOccs = findTextOccurrences(docXml, 'UYGUN');
    const uygunSmall = findTextOccurrences(docXml, 'Uygun');
    if (uygunOccs.length > 0 && uygunSmall.length > 0) {
        warnings.push(`[${sablonKodu}] Büyük/küçük harf karışık: "UYGUN" ${uygunOccs.length} yerde, "Uygun" ${uygunSmall.length} yerde`);
    }

    return { sablonKodu, issues, warnings, tableCount: tables.length };
}

async function main() {
    const configFiles = fs.readdirSync(CONFIGS_DIR).filter(f => f.endsWith('.json'));
    console.log(`\n${'='.repeat(80)}`);
    console.log(`ŞABLON AUDIT RAPORU - ${configFiles.length} config taranıyor...`);
    console.log(`${'='.repeat(80)}\n`);

    let totalIssues = 0;
    let totalWarnings = 0;
    const results = [];

    for (const file of configFiles.sort()) {
        try {
            const result = await auditConfig(file);
            results.push(result);
            totalIssues += result.issues.length;
            totalWarnings += result.warnings.length;
        } catch (e) {
            console.log(`[HATA] ${file}: ${e.message}`);
        }
    }

    // Sadece sorunlu olanları göster
    console.log('\n🔴 KRİTİK HATALAR (Yanlış hücreye yazma riski):\n');
    for (const r of results) {
        for (const issue of r.issues) {
            if (issue.includes('ÇAKIŞMA') || issue.includes('bulunamadı')) {
                console.log(`  ${issue}`);
            }
        }
    }

    console.log('\n🟡 UYARILAR (Potansiyel sorunlar):\n');
    for (const r of results) {
        for (const w of r.warnings) {
            console.log(`  ${w}`);
        }
    }

    console.log('\n🔵 EKSİK LABEL\'LAR:\n');
    for (const r of results) {
        for (const issue of r.issues) {
            if (issue.includes('Label bulunamadı')) {
                console.log(`  ${issue}`);
            }
        }
    }

    // Kategori bazlı özet — gerçek sinyali gürültüden ayır
    const allIssues = results.flatMap(r => r.issues);
    const allWarnings = results.flatMap(r => r.warnings);
    const cakisma = allIssues.filter(i => i.includes('ÇAKIŞMA')).length;
    const bulunamadi = allIssues.filter(i => i.includes('bulunamadı')).length;
    const kolonUyari = allWarnings.filter(w => w.includes('mode:"next"')).length;
    const tekrarUyari = allWarnings.filter(w => w.includes('birden fazla yerde')).length;
    const kismiUyari = allWarnings.filter(w => w.includes('Kısmi eşleşme')).length;
    const harfUyari = allWarnings.filter(w => w.includes('Büyük/küçük harf')).length;

    console.log(`\n${'='.repeat(80)}`);
    console.log(`ÖZET: ${configFiles.length} config | ${totalIssues} hata, ${totalWarnings} uyarı`);
    console.log(`${'-'.repeat(80)}`);
    console.log(`🔴 GERÇEK HATA:`);
    console.log(`     • Çakışma (yanlış hücre riski, exact:true gerek): ${cakisma}`);
    console.log(`     • Label/soru bulunamadı (gerçekten eksik):        ${bulunamadi}`);
    console.log(`🟡 İNCELENMELİ:`);
    console.log(`     • mode:"next" + 4 sütun (kolon kayması olabilir):  ${kolonUyari}`);
    console.log(`     • Label birden fazla yerde (çoğu zararsız):        ${tekrarUyari}`);
    console.log(`🔵 KOZMETİK / DÜŞÜK:`);
    console.log(`     • Kısmi eşleşme riski:                             ${kismiUyari}`);
    console.log(`     • Büyük/küçük harf karışık (UYGUN/Uygun):          ${harfUyari}`);
    console.log(`${'='.repeat(80)}\n`);
}

main().catch(console.error);
