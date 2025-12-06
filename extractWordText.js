const fs = require('fs');
const PizZip = require('pizzip');

const wordPath = '/mnt/c/Users/kadir/Desktop/1- MUAYENE ÖLÇÜM RAPORLARI/2. Basınçlı Kaplar/Buhar Kazanı/FR7.2.17 Buhar Kazanı Muayene ve Ölçüm Raporu.docx';

try {
    const content = fs.readFileSync(wordPath, 'binary');
    const zip = new PizZip(content);
    const documentXml = zip.files['word/document.xml'].asText();

    // XML'den text'leri çıkar
    const textMatches = documentXml.match(/<w:t[^>]*>([^<]+)<\/w:t>/g);

    if (textMatches) {
        console.log('=== WORD DOSYASI METİNLERİ ===\n');

        let allText = [];
        textMatches.forEach(match => {
            const text = match.replace(/<w:t[^>]*>/, '').replace(/<\/w:t>/, '');
            if (text.trim()) {
                allText.push(text);
            }
        });

        // Metinleri yazdır
        console.log(allText.join('\n'));

        console.log('\n\n=== TOPLAM METIN SAYISI: ' + allText.length + ' ===');
    }

} catch (error) {
    console.error('Hata:', error.message);
}
