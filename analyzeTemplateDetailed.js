/**
 * Detaylı Word Şablon Analizi
 * Tablo hücrelerini ve form alanlarını analiz eder
 */

const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');

const templateDir = path.join(__dirname, 'templates', 'elektrik');

// Tablo satırlarını ve hücrelerini ayrıştır
function parseTableRows(tableXml) {
    const rows = [];
    const rowMatches = tableXml.match(/<w:tr[^>]*>[\s\S]*?<\/w:tr>/g) || [];

    rowMatches.forEach(rowXml => {
        const cells = [];
        const cellMatches = rowXml.match(/<w:tc[^>]*>[\s\S]*?<\/w:tc>/g) || [];

        cellMatches.forEach(cellXml => {
            const textMatches = cellXml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
            const cellText = textMatches.map(m => m.replace(/<w:t[^>]*>/, '').replace(/<\/w:t>/, '')).join('');
            cells.push(cellText.trim());
        });

        if (cells.some(c => c.length > 0)) {
            rows.push(cells);
        }
    });

    return rows;
}

// Form alanlarını tespit et (label: value formatı)
function detectFormFields(rows) {
    const fields = [];

    rows.forEach(row => {
        if (row.length >= 2) {
            const label = row[0];
            const value = row.slice(1).join(' ').trim();

            // Label olabilecek hücreleri tespit et
            if (label && label.length > 2 && label.length < 100) {
                // Başlık satırları ve boş değerler dahil
                fields.push({
                    label: label,
                    value: value || '(boş)',
                    isEditable: value !== '' && !label.includes('Toplam') && !label.includes('Sonuç')
                });
            }
        }
    });

    return fields;
}

// Ortak alan şablonu oluştur
function createFieldTemplate(fields) {
    const template = {};
    const commonLabels = [
        'Firma Adı', 'Rapor Numarası', 'Periyodik Kontrol Adresi', 'Rapor Tarihi',
        'İSG-KATİP Sözleşme ID', 'Periyodik Kontrol Başlangıç Tarihi', 'Periyodik Kontrol Bitiş Tarihi',
        'SGK Sicil No', 'Vergi No', 'Vergi Dairesi', 'Muayene Tarihi', 'Kontrol Tarihi'
    ];

    fields.forEach(field => {
        // Ortak alanlara benzer olanları şablon alanı olarak işaretle
        const matchedLabel = commonLabels.find(cl =>
            field.label.toLowerCase().includes(cl.toLowerCase()) ||
            cl.toLowerCase().includes(field.label.toLowerCase())
        );

        if (matchedLabel || field.isEditable) {
            const key = field.label
                .replace(/[^a-zA-ZğüşıöçĞÜŞİÖÇ0-9]/g, '_')
                .replace(/_+/g, '_')
                .toLowerCase();
            template[key] = {
                label: field.label,
                placeholder: `{{${key}}}`,
                sampleValue: field.value
            };
        }
    });

    return template;
}

// Ana analiz fonksiyonu
function analyzeTemplateDetailed(filePath) {
    const content = fs.readFileSync(filePath);
    const zip = new PizZip(content);
    const documentXml = zip.file('word/document.xml').asText();

    // Tüm tabloları bul
    const tableMatches = documentXml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) || [];

    const analysis = {
        fileName: path.basename(filePath),
        tables: [],
        allFields: [],
        suggestedPlaceholders: {}
    };

    tableMatches.forEach((tableXml, index) => {
        const rows = parseTableRows(tableXml);
        const fields = detectFormFields(rows);

        analysis.tables.push({
            index: index + 1,
            rowCount: rows.length,
            fields: fields.slice(0, 10) // İlk 10 alan
        });

        analysis.allFields.push(...fields);
    });

    // Şablon önerisi oluştur
    analysis.suggestedPlaceholders = createFieldTemplate(analysis.allFields);

    return analysis;
}

// Tüm şablonları analiz et
console.log('📋 Detaylı Word Şablon Analizi\n' + '='.repeat(60) + '\n');

const files = fs.readdirSync(templateDir).filter(f => f.endsWith('.docx'));
const allAnalysis = [];

files.forEach(file => {
    console.log(`\n📄 ${file}`);
    console.log('-'.repeat(60));

    const filePath = path.join(templateDir, file);
    const analysis = analyzeTemplateDetailed(filePath);
    allAnalysis.push(analysis);

    console.log(`📊 Tablo Sayısı: ${analysis.tables.length}`);
    console.log(`📝 Tespit Edilen Alan Sayısı: ${analysis.allFields.length}`);

    // İlk tablonun alanlarını göster
    if (analysis.tables[0] && analysis.tables[0].fields.length > 0) {
        console.log('\n   İlk Tablodaki Alanlar:');
        analysis.tables[0].fields.slice(0, 8).forEach(f => {
            console.log(`   • ${f.label}: ${f.value.substring(0, 50)}${f.value.length > 50 ? '...' : ''}`);
        });
    }

    // Önerilen placeholder'lar
    const placeholders = Object.keys(analysis.suggestedPlaceholders);
    if (placeholders.length > 0) {
        console.log(`\n   Önerilen Placeholder'lar (${placeholders.length}):`);
        placeholders.slice(0, 8).forEach(key => {
            console.log(`   • {{${key}}} → ${analysis.suggestedPlaceholders[key].label}`);
        });
    }
});

// Tüm şablonlarda ortak alanları bul
console.log('\n' + '='.repeat(60));
console.log('📊 TÜM ŞABLONLARDA ORTAK ALANLAR');
console.log('='.repeat(60));

const allLabels = {};
allAnalysis.forEach(a => {
    a.allFields.forEach(f => {
        allLabels[f.label] = (allLabels[f.label] || 0) + 1;
    });
});

// En sık kullanılan alanlar
const commonFields = Object.entries(allLabels)
    .filter(([_, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

console.log('\nEn sık kullanılan alanlar:');
commonFields.forEach(([label, count]) => {
    console.log(`   ${count}x → ${label}`);
});

// JSON olarak kaydet
const output = {
    templates: allAnalysis,
    commonFields: commonFields.map(([label, count]) => ({ label, count })),
    suggestedSchema: {
        firmaAdi: { type: 'string', label: 'Firma Adı', required: true },
        raporNumarasi: { type: 'string', label: 'Rapor Numarası', required: true },
        raporTarihi: { type: 'date', label: 'Rapor Tarihi', required: true },
        kontrolAdresi: { type: 'string', label: 'Periyodik Kontrol Adresi', required: true },
        isgKatipId: { type: 'string', label: 'İSG-KATİP Sözleşme ID' },
        sgkSicilNo: { type: 'string', label: 'SGK Sicil No' },
        baslamaTarihi: { type: 'datetime', label: 'Kontrol Başlangıç Tarihi ve Saati' },
        bitisTarihi: { type: 'datetime', label: 'Kontrol Bitiş Tarihi ve Saati' },
        muayeneEden: { type: 'string', label: 'Muayene Eden' },
        kontrolSonucu: { type: 'enum', label: 'Kontrol Sonucu', options: ['UYGUN', 'UYGUN DEĞİL', 'ŞARTLI UYGUN'] }
    }
};

fs.writeFileSync(
    path.join(__dirname, 'template-detailed-analysis.json'),
    JSON.stringify(output, null, 2)
);

console.log('\n✅ Detaylı analiz template-detailed-analysis.json dosyasına kaydedildi.');
