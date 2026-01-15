/**
 * Word Şablon Analiz Script'i
 * Şablonlardaki placeholder'ları ve yapıyı analiz eder
 */

const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');

// Şablon klasörü
const templateDir = path.join(__dirname, 'templates', 'elektrik');

// XML'den text içeriği çıkar
function extractTextFromXml(xmlContent) {
    // w:t etiketleri arasındaki metinleri al
    const textMatches = xmlContent.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
    return textMatches.map(match => {
        const text = match.replace(/<w:t[^>]*>/, '').replace(/<\/w:t>/, '');
        return text;
    }).join('');
}

// Placeholder'ları bul ({{...}} formatında)
function findPlaceholders(text) {
    const placeholders = [];
    const regex = /\{\{([^}]+)\}\}/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
        placeholders.push(match[1].trim());
    }
    return [...new Set(placeholders)]; // Tekrarları kaldır
}

// Tablo yapısını analiz et
function analyzeTableStructure(xmlContent) {
    const tables = [];
    const tableMatches = xmlContent.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) || [];

    tableMatches.forEach((table, index) => {
        const rows = table.match(/<w:tr>[\s\S]*?<\/w:tr>/g) || [];
        tables.push({
            tableIndex: index + 1,
            rowCount: rows.length,
            hasPlaceholders: /\{\{[^}]+\}\}/.test(table)
        });
    });

    return tables;
}

// Şablonu analiz et
function analyzeTemplate(filePath) {
    try {
        const content = fs.readFileSync(filePath);
        const zip = new PizZip(content);

        // document.xml dosyasını oku
        const documentXml = zip.file('word/document.xml');
        if (!documentXml) {
            return { error: 'document.xml bulunamadı' };
        }

        const xmlContent = documentXml.asText();
        const fullText = extractTextFromXml(xmlContent);
        const placeholders = findPlaceholders(fullText);
        const tables = analyzeTableStructure(xmlContent);

        // Header ve footer'ları kontrol et
        const files = Object.keys(zip.files);
        const headers = files.filter(f => f.includes('header'));
        const footers = files.filter(f => f.includes('footer'));

        return {
            fileName: path.basename(filePath),
            fileSize: fs.statSync(filePath).size,
            placeholders,
            placeholderCount: placeholders.length,
            tables,
            tableCount: tables.length,
            hasHeaders: headers.length > 0,
            hasFooters: footers.length > 0,
            textPreview: fullText.substring(0, 500) + '...'
        };

    } catch (error) {
        return { error: error.message };
    }
}

// Tüm şablonları analiz et
console.log('📋 Word Şablon Analizi\n' + '='.repeat(50) + '\n');

const files = fs.readdirSync(templateDir).filter(f => f.endsWith('.docx'));

const results = [];

files.forEach(file => {
    const filePath = path.join(templateDir, file);
    console.log(`\n📄 ${file}`);
    console.log('-'.repeat(50));

    const analysis = analyzeTemplate(filePath);
    results.push(analysis);

    if (analysis.error) {
        console.log(`❌ Hata: ${analysis.error}`);
    } else {
        console.log(`📊 Dosya Boyutu: ${(analysis.fileSize / 1024).toFixed(1)} KB`);
        console.log(`📋 Tablo Sayısı: ${analysis.tableCount}`);
        console.log(`🔖 Placeholder Sayısı: ${analysis.placeholderCount}`);

        if (analysis.placeholders.length > 0) {
            console.log(`\n   Bulunan Placeholder'lar:`);
            analysis.placeholders.forEach(p => console.log(`   - {{${p}}}`));
        }

        console.log(`\n   İçerik Önizleme:`);
        console.log(`   ${analysis.textPreview.substring(0, 200)}...`);
    }
});

// Özet
console.log('\n' + '='.repeat(50));
console.log('📊 ÖZET');
console.log('='.repeat(50));
console.log(`Toplam Şablon: ${files.length}`);

const allPlaceholders = [...new Set(results.flatMap(r => r.placeholders || []))];
console.log(`\nTüm Benzersiz Placeholder'lar (${allPlaceholders.length}):`);
allPlaceholders.forEach(p => console.log(`  - {{${p}}}`));

// JSON olarak kaydet
fs.writeFileSync(
    path.join(__dirname, 'template-analysis.json'),
    JSON.stringify(results, null, 2)
);
console.log('\n✅ Analiz sonuçları template-analysis.json dosyasına kaydedildi.');
