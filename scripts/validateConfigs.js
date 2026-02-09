/**
 * Tüm config'leri Word şablonlarıyla karşılaştırıp doğrula
 */
const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(__dirname, '../services/templateConfigs');

function getRowText(rowXml) {
    const matches = rowXml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
    return matches.map(t => t.replace(/<[^>]+>/g, '')).join(' ').trim();
}

function getCellTexts(rowXml) {
    const cellRegex = /<w:tc[^>]*>[\s\S]*?<\/w:tc>/g;
    const cells = rowXml.match(cellRegex) || [];
    return cells.map(c => {
        const matches = c.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
        return matches.map(t => t.replace(/<[^>]+>/g, '')).join('').trim();
    });
}

async function extractLabelsFromDocx(docxPath) {
    try {
        const content = fs.readFileSync(docxPath);
        const zip = await JSZip.loadAsync(content);

        const labels = new Set();

        // Document body
        const docXml = await zip.file('word/document.xml').async('string');
        const rowRegex = /<w:tr[^>]*>[\s\S]*?<\/w:tr>/g;
        const rows = docXml.match(rowRegex) || [];

        for (const row of rows) {
            const cellTexts = getCellTexts(row);
            // 4 sütunlu tablolarda: label | value | label | value
            for (let i = 0; i < cellTexts.length; i += 2) {
                const text = cellTexts[i].trim();
                if (text && text.length > 1 && text.length < 80) {
                    labels.add(text);
                }
            }
            // 2 sütunlu tablolarda: label | value
            if (cellTexts.length === 2) {
                const text = cellTexts[0].trim();
                if (text && text.length > 1) {
                    labels.add(text);
                }
            }
        }

        // Header dosyası
        const headerFile = zip.file('word/header2.xml') || zip.file('word/header1.xml');
        if (headerFile) {
            const headerXml = await headerFile.async('string');
            const headerRows = headerXml.match(rowRegex) || [];
            for (const row of headerRows) {
                const cellTexts = getCellTexts(row);
                for (let i = 0; i < cellTexts.length; i += 2) {
                    const text = cellTexts[i].trim();
                    if (text && text.length > 1 && text.length < 80) {
                        labels.add(text);
                    }
                }
            }
        }

        return labels;
    } catch (e) {
        console.error(`  Hata: ${e.message}`);
        return new Set();
    }
}

function normalizeLabel(label) {
    return label
        .toLowerCase()
        .replace(/[()\/\-\.\,\:\;\s]+/g, '')
        .replace(/ı/g, 'i')
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ş/g, 's')
        .replace(/ö/g, 'o')
        .replace(/ç/g, 'c');
}

function findBestMatch(configLabel, docLabels) {
    const normalizedConfig = normalizeLabel(configLabel);

    // Tam eşleşme
    for (const docLabel of docLabels) {
        if (docLabel === configLabel) return { match: docLabel, type: 'exact' };
    }

    // İçerme kontrolü
    for (const docLabel of docLabels) {
        if (docLabel.includes(configLabel) || configLabel.includes(docLabel)) {
            return { match: docLabel, type: 'partial' };
        }
    }

    // Normalize edilmiş eşleşme
    for (const docLabel of docLabels) {
        const normalizedDoc = normalizeLabel(docLabel);
        if (normalizedDoc === normalizedConfig ||
            normalizedDoc.includes(normalizedConfig) ||
            normalizedConfig.includes(normalizedDoc)) {
            return { match: docLabel, type: 'normalized' };
        }
    }

    return null;
}

async function validateConfig(configPath) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const sablonKodu = config.sablonKodu;

    const templatePath = path.join(__dirname, '..', config.wordMapping.templatePath);
    if (!fs.existsSync(templatePath)) {
        return { sablonKodu, error: `Şablon bulunamadı: ${config.wordMapping.templatePath}` };
    }

    const docLabels = await extractLabelsFromDocx(templatePath);
    const docLabelsArray = Array.from(docLabels);

    const issues = [];
    const configLabels = config.wordMapping.fields || [];

    for (const field of configLabels) {
        if (!field.label) continue;

        const match = findBestMatch(field.label, docLabelsArray);

        if (!match) {
            issues.push({
                type: 'NOT_FOUND',
                configLabel: field.label,
                field: field.field || field.source,
                suggestion: docLabelsArray.filter(l =>
                    normalizeLabel(l).includes(normalizeLabel(field.label).substring(0, 5))
                ).slice(0, 3)
            });
        } else if (match.type !== 'exact') {
            issues.push({
                type: 'MISMATCH',
                configLabel: field.label,
                docLabel: match.match,
                field: field.field || field.source,
                matchType: match.type
            });
        }
    }

    return { sablonKodu, issues, docLabels: docLabelsArray };
}

async function main() {
    const configFiles = fs.readdirSync(CONFIG_DIR).filter(f => f.endsWith('.json'));

    console.log(`\n=== ${configFiles.length} config dosyası kontrol ediliyor ===\n`);

    const allIssues = [];
    let checkedCount = 0;
    let issueCount = 0;

    for (const configFile of configFiles) {
        const configPath = path.join(CONFIG_DIR, configFile);
        const result = await validateConfig(configPath);
        checkedCount++;

        if (result.error) {
            console.log(`❌ ${result.sablonKodu}: ${result.error}`);
            issueCount++;
        } else if (result.issues.length > 0) {
            console.log(`⚠️  ${result.sablonKodu}: ${result.issues.length} sorun`);
            for (const issue of result.issues) {
                if (issue.type === 'NOT_FOUND') {
                    console.log(`   ❌ "${issue.configLabel}" bulunamadı (field: ${issue.field})`);
                    if (issue.suggestion.length > 0) {
                        console.log(`      Öneri: ${issue.suggestion.join(', ')}`);
                    }
                } else {
                    console.log(`   ⚠️  "${issue.configLabel}" -> "${issue.docLabel}" (${issue.matchType})`);
                }
            }
            allIssues.push(result);
            issueCount++;
        } else {
            console.log(`✅ ${result.sablonKodu}: OK`);
        }
    }

    console.log(`\n========================================`);
    console.log(`Kontrol edilen: ${checkedCount}`);
    console.log(`Sorunlu: ${issueCount}`);

    // Özet rapor
    if (allIssues.length > 0) {
        console.log(`\n=== DÜZELTME GEREKTİREN CONFIG'LER ===\n`);
        for (const item of allIssues) {
            const mismatches = item.issues.filter(i => i.type === 'MISMATCH');
            const notFounds = item.issues.filter(i => i.type === 'NOT_FOUND');

            if (mismatches.length > 0 || notFounds.length > 0) {
                console.log(`${item.sablonKodu}:`);
                for (const m of mismatches) {
                    console.log(`  "${m.configLabel}" => "${m.docLabel}"`);
                }
                for (const n of notFounds) {
                    console.log(`  "${n.configLabel}" => BULUNAMADI`);
                }
            }
        }
    }
}

main().catch(console.error);
