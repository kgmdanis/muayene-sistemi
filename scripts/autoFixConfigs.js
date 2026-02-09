const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const CONFIGS_DIR = path.join(__dirname, '..', 'services', 'templateConfigs');
const BASE_DIR = path.join(__dirname, '..');

function extractText(xml) {
    const matches = xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
    return matches.map(t => t.replace(/<[^>]+>/g, '')).join('').trim();
}

function findTextInRows(xml, searchText) {
    const rowRegex = /<w:tr[^>]*>[\s\S]*?<\/w:tr>/g;
    const rows = xml.match(rowRegex) || [];
    const results = [];

    rows.forEach((row, rowIdx) => {
        const cells = row.match(/<w:tc[^>]*>[\s\S]*?<\/w:tc>/g) || [];
        cells.forEach((cell, colIdx) => {
            const cellText = extractText(cell);
            if (cellText.includes(searchText)) {
                results.push({
                    rowIdx, colIdx,
                    colCount: cells.length,
                    cellText: cellText.substring(0, 100),
                    exactMatch: cellText.trim() === searchText.trim()
                });
            }
        });
    });
    return results;
}

async function fixConfig(configFile) {
    const configPath = path.join(CONFIGS_DIR, configFile);
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const sablonKodu = config.sablonKodu;
    let changed = false;
    const changes = [];

    if (!config.wordMapping || !config.wordMapping.templatePath) return null;

    const templatePath = path.join(BASE_DIR, config.wordMapping.templatePath);
    if (!fs.existsSync(templatePath)) return null;

    let docXml;
    try {
        const zip = await JSZip.loadAsync(fs.readFileSync(templatePath));
        docXml = await zip.file('word/document.xml').async('string');
        if (config.wordMapping.headerFile) {
            const hf = zip.file(config.wordMapping.headerFile);
            if (hf) {
                const headerXml = await hf.async('string');
                docXml = headerXml + docXml;
            }
        }
    } catch (e) {
        return null;
    }

    // === FIX 1: controlQuestions - exact:true ekle ve mode düzelt ===
    if (config.wordMapping.controlQuestions) {
        const cq = config.wordMapping.controlQuestions;
        const questions = cq.questions || [];

        for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            const occs = findTextInRows(docXml, q.text);

            // Birden fazla yerde bulunuyorsa exact:true ekle
            if (occs.length > 1 && !q.exact) {
                const hasExactMatch = occs.some(o => o.exactMatch);
                if (hasExactMatch) {
                    questions[i] = { ...q, exact: true };
                    changed = true;
                    changes.push(`  [${sablonKodu}] exact:true eklendi: "${q.text}" (${occs.length} çakışma)`);
                }
            }

            // 4+ sütunlu tabloda mode:"next" ise → mode kontrol et
            // Eğer sorunun bulunduğu satır 4+ sütunluysa ve global mode "next" ise
            // ve soru field'ı "_adet" ile bitmiyorsa → mode:"last" olmalı
            if (occs.length > 0) {
                const firstOcc = occs.find(o => o.exactMatch) || occs[0];
                const effectiveMode = q.mode || cq.mode || 'last';

                if (firstOcc.colCount >= 4 && effectiveMode === 'next' && !q.field.includes('_adet')) {
                    // Bu soru 4 sütunlu tabloda ve next mode ile adet sütununa yazıyor
                    // mode'u last'e çevir
                    questions[i] = { ...q, mode: 'last' };
                    if (questions[i].exact === undefined && occs.length > 1) {
                        questions[i].exact = true;
                    }
                    changed = true;
                    changes.push(`  [${sablonKodu}] mode:"last" yapıldı: "${q.text}" (${firstOcc.colCount} sütunlu tablo)`);
                }
            }
        }
    }

    // === FIX 2: "Sözleşme ID" label'ını şablondaki gerçek label ile değiştir ===
    if (config.wordMapping.fields) {
        for (let i = 0; i < config.wordMapping.fields.length; i++) {
            const field = config.wordMapping.fields[i];
            if (field.label === 'Sözleşme ID' || field.label === 'Sözlesme ID') {
                // Şablonda gerçek label ne?
                const alternatives = ['Sözleşme ID', 'Sözlesme ID', 'İSG Katip No', 'ISG Katip', 'Sözleşme No'];
                let found = false;
                for (const alt of alternatives) {
                    const occs = findTextInRows(docXml, alt);
                    if (occs.length > 0) {
                        config.wordMapping.fields[i] = { ...field, label: alt };
                        changed = true;
                        changes.push(`  [${sablonKodu}] Label düzeltildi: "Sözleşme ID" → "${alt}"`);
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    // Header'da "Sözlesme" geçen herhangi bir text ara
                    const sozlesmeOccs = findTextInRows(docXml, 'özle');
                    if (sozlesmeOccs.length > 0) {
                        changes.push(`  [${sablonKodu}] ⚠️ "Sözleşme ID" bulunamadı ama şablonda "${sozlesmeOccs[0].cellText}" var - manuel kontrol gerekli`);
                    } else {
                        changes.push(`  [${sablonKodu}] ⚠️ "Sözleşme ID" şablonda hiç bulunamadı - alan şablonda yok olabilir`);
                    }
                }
            }
        }
    }

    // === FIX 3: Tekrarlanan label'lar için uyarı ===
    if (config.wordMapping.fields) {
        for (const field of config.wordMapping.fields) {
            if (!field.label) continue;
            if (['Seri No', 'Deneme Basıncı'].some(s => field.label.includes(s))) {
                const occs = findTextInRows(docXml, field.label);
                if (occs.length > 1) {
                    changes.push(`  [${sablonKodu}] ⚠️ MANUEL: "${field.label}" ${occs.length} yerde - ilk eşleşmeye yazıyor, doğru mu kontrol et`);
                }
            }
        }
    }

    // Kaydet
    if (changed) {
        // Backup
        const backupPath = configPath + '.backup';
        if (!fs.existsSync(backupPath)) {
            fs.copyFileSync(configPath, backupPath);
        }
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    }

    return { sablonKodu, changed, changes };
}

async function main() {
    const configFiles = fs.readdirSync(CONFIGS_DIR).filter(f => f.endsWith('.json') && !f.endsWith('.backup'));

    console.log(`\n${'='.repeat(80)}`);
    console.log(`OTOMATİK FIX - ${configFiles.length} config işleniyor...`);
    console.log(`Backup'lar .backup uzantısıyla kaydediliyor.`);
    console.log(`${'='.repeat(80)}\n`);

    let fixedCount = 0;
    let manualCount = 0;
    const allChanges = [];

    for (const file of configFiles.sort()) {
        try {
            const result = await fixConfig(file);
            if (result && result.changes.length > 0) {
                allChanges.push(result);
                if (result.changed) fixedCount++;
                result.changes.forEach(c => {
                    if (c.includes('MANUEL')) manualCount++;
                });
            }
        } catch (e) {
            console.log(`[HATA] ${file}: ${e.message}`);
        }
    }

    console.log('🔧 OTOMATİK DÜZELTMELER:\n');
    for (const r of allChanges) {
        for (const c of r.changes) {
            if (!c.includes('MANUEL') && !c.includes('⚠️')) {
                console.log(c);
            }
        }
    }

    console.log('\n⚠️ MANUEL KONTROL GEREKLİ:\n');
    for (const r of allChanges) {
        for (const c of r.changes) {
            if (c.includes('MANUEL') || c.includes('⚠️')) {
                console.log(c);
            }
        }
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`ÖZET: ${fixedCount} config otomatik düzeltildi, ${manualCount} manuel kontrol gerekli`);
    console.log(`Backup'lar: services/templateConfigs/*.backup`);
    console.log(`Geri almak için: mv file.json.backup file.json`);
    console.log(`${'='.repeat(80)}\n`);
}

main().catch(console.error);
