const fs = require('fs');
const PizZip = require('pizzip');

// Word dosyasını oku
const wordPath = '/mnt/c/Users/kadir/Desktop/1- MUAYENE ÖLÇÜM RAPORLARI/2. Basınçlı Kaplar/Buhar Kazanı/FR7.2.17 Buhar Kazanı Muayene ve Ölçüm Raporu.docx';

try {
    const content = fs.readFileSync(wordPath, 'binary');
    const zip = new PizZip(content);

    // document.xml dosyasını çıkar (Word'ün ana içeriği burada)
    const documentXml = zip.files['word/document.xml'].asText();

    // XML'i konsola yazdır (ilk 5000 karakter)
    console.log('=== WORD DOSYASI İÇERİĞİ (İLK 5000 KARAKTER) ===');
    console.log(documentXml.substring(0, 5000));

    console.log('\n\n=== DOSYA YAPISI ===');
    Object.keys(zip.files).forEach(filename => {
        console.log(filename);
    });

} catch (error) {
    console.error('Hata:', error.message);
}
