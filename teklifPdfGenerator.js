const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Türkçe karakter desteği için font
const FONT_PATH = path.join(__dirname, 'fonts', 'DejaVuSans.ttf');
const FONT_BOLD_PATH = path.join(__dirname, 'fonts', 'DejaVuSans-Bold.ttf');

// Sabit metinler (19 madde)
const TEKLIF_SARTLARI = [
    'Bu teklif, firmanıza özel olarak hazırlanmış olup başka firmalarla paylaşılmaması gerekmektedir.',
    'Teklif geçerlilik süresi, teklif tarihinden itibaren 30 gündür.',
    'Ödeme, hizmet tamamlandıktan sonra 15 gün içinde nakden veya hesaba havale şeklinde yapılacaktır.',
    'Çek ile ödeme kabul edilmemektedir.',
    'Fiyatlara KDV dahil değildir.',
    'Muayene ve kontrol hizmetleri, ilgili mevzuat ve standartlara uygun olarak gerçekleştirilecektir.',
    'Muayene sırasında ekipmanların çalışır durumda olması gerekmektedir.',
    'Muayene için gerekli ortam ve güvenlik koşullarının sağlanması müşteri sorumluluğundadır.',
    'Muayene raporları, yasal süreler içinde teslim edilecektir.',
    'Uygunsuzluk tespit edilen ekipmanlar için düzeltici faaliyet önerileri sunulacaktır.',
    'Periyodik muayene ve kontrol hizmetleri, aksi belirtilmedikçe yılda bir kez yapılacaktır.',
    'Acil durumlarda ek muayene talepleri değerlendirilecektir.',
    'Muayene esnasında oluşabilecek hasarlardan firmamız sorumlu tutulamaz.',
    'Müşteri, muayene öncesi ekipmanların bakım ve temizliğini yapmış olmalıdır.',
    'Muayene yapılacak ekipmanların listesi ve konumu önceden bildirilmelidir.',
    'Firmamız, zorunlu hallerde muayene tarihini değiştirme hakkını saklı tutar.',
    'Bu teklifteki fiyatlar, belirtilen hizmet kapsamı için geçerlidir.',
    'Ek hizmet talepleri ayrıca fiyatlandırılacaktır.',
    'Her türlü anlaşmazlıkta Konya Mahkemeleri yetkilidir.'
];

/**
 * Teklif PDF'i oluşturur
 * @param {Object} teklif - Teklif verisi (detaylar, customer, firma dahil)
 * @returns {Promise<Buffer>} PDF buffer
 */
async function teklifPdfOlustur(teklif) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({
                size: 'A4',
                margins: { top: 40, bottom: 40, left: 40, right: 40 },
                bufferPages: true
            });

            const buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => resolve(Buffer.concat(buffers)));
            doc.on('error', reject);

            // Font ayarları
            const hasCustomFont = fs.existsSync(FONT_PATH);
            if (hasCustomFont) {
                doc.registerFont('Normal', FONT_PATH);
                doc.registerFont('Bold', fs.existsSync(FONT_BOLD_PATH) ? FONT_BOLD_PATH : FONT_PATH);
            }

            const firma = teklif.firma || {};
            const customer = teklif.customer || {};
            const detaylar = teklif.detaylar || [];

            // Kategorilere göre grupla
            const kategoriler = {};
            detaylar.forEach(d => {
                const katAd = d.hizmet?.kategori?.ad || 'Diğer';
                const katSira = d.hizmet?.kategori?.sira || 99;
                if (!kategoriler[katAd]) {
                    kategoriler[katAd] = { sira: katSira, hizmetler: [] };
                }
                kategoriler[katAd].hizmetler.push(d);
            });

            // ============ SAYFA 1: ANTET VE TEKLİF BİLGİLERİ ============

            // Logo (Sol üst)
            const logoPath = path.join(__dirname, 'public', 'images', 'logo.png');
            if (fs.existsSync(logoPath)) {
                doc.image(logoPath, 40, 30, { width: 120 });
            }

            // TÜRKAK Logo (Sağ üst) - sadece İş Hijyeni varsa
            const turkakPath = path.join(__dirname, 'public', 'images', 'turkak-logo.png');
            const hasIsHijyeni = Object.keys(kategoriler).some(k => k.includes('HİJYEN'));
            if (hasIsHijyeni && fs.existsSync(turkakPath)) {
                doc.image(turkakPath, 480, 30, { width: 70 });
            }

            // Firma bilgileri (ortada)
            doc.moveDown(5);
            const fontName = hasCustomFont ? 'Bold' : 'Helvetica-Bold';
            const fontNormal = hasCustomFont ? 'Normal' : 'Helvetica';

            doc.font(fontName).fontSize(14).text(firma.name || 'ÖNDER MUAYENE', { align: 'center' });
            doc.font(fontNormal).fontSize(9);
            doc.text(firma.adres || '', { align: 'center' });
            doc.text(`Tel: ${firma.telefon || ''} | E-posta: ${firma.email || ''}`, { align: 'center' });
            doc.moveDown(1.5);

            // Teklif başlığı
            doc.font(fontName).fontSize(12).fillColor('#1a5276')
               .text(teklif.konu || 'PERİYODİK KONTROL VE İŞ HİJYENİ ÖLÇÜM FİYAT TEKLİFİ', { align: 'center' });
            doc.fillColor('black');
            doc.moveDown(1);

            // Teklif bilgileri kutusu
            const boxY = doc.y;
            doc.rect(40, boxY, 250, 70).stroke();
            doc.rect(300, boxY, 250, 70).stroke();

            // Sol kutu - Müşteri bilgileri
            doc.font(fontName).fontSize(9).text('MÜŞTERİ BİLGİLERİ', 50, boxY + 5);
            doc.font(fontNormal).fontSize(8);
            doc.text(`Firma: ${customer.unvan || ''}`, 50, boxY + 20);
            doc.text(`Adres: ${(customer.adres || '').substring(0, 40)}`, 50, boxY + 32);
            doc.text(`Yetkili: ${customer.yetkili || '-'}`, 50, boxY + 44);
            doc.text(`Tel: ${customer.telefon || '-'}`, 50, boxY + 56);

            // Sağ kutu - Teklif bilgileri
            doc.font(fontName).fontSize(9).text('TEKLİF BİLGİLERİ', 310, boxY + 5);
            doc.font(fontNormal).fontSize(8);
            doc.text(`Teklif No: ${teklif.teklifNo}`, 310, boxY + 20);
            doc.text(`Tarih: ${new Date(teklif.teklifTarihi || teklif.createdAt).toLocaleDateString('tr-TR')}`, 310, boxY + 32);
            doc.text(`Geçerlilik: ${teklif.gecerlilikGun || 30} gün`, 310, boxY + 44);
            doc.text(`Durum: ${teklif.durum || 'TASLAK'}`, 310, boxY + 56);

            doc.y = boxY + 85;

            // ============ HİZMET TABLOLARI ============

            // Kategorileri sırala
            const sortedKategoriler = Object.entries(kategoriler)
                .sort((a, b) => a[1].sira - b[1].sira);

            sortedKategoriler.forEach(([katAd, katData], katIndex) => {
                // Sayfa kontrolü
                if (doc.y > 700) {
                    doc.addPage();
                }

                // Kategori başlığı
                const isAkpirediteli = katAd.includes('HİJYEN');
                doc.font(fontName).fontSize(10).fillColor('#1a5276');
                doc.text(`${katIndex + 1}. ${katAd}${isAkpirediteli ? ' (AKREDİTE)' : ''}`, 40, doc.y + 10);
                doc.fillColor('black');
                doc.moveDown(0.5);

                // Tablo başlıkları
                const tableTop = doc.y;
                const colWidths = [30, 200, 80, 50, 50, 60, 50];
                const colX = [40, 70, 270, 350, 400, 450, 510];

                // Başlık satırı
                doc.rect(40, tableTop, 520, 18).fill('#f0f0f0');
                doc.fillColor('black').font(fontName).fontSize(7);
                doc.text('S.N.', colX[0], tableTop + 5, { width: colWidths[0] });
                doc.text('Hizmet Adı', colX[1], tableTop + 5, { width: colWidths[1] });
                doc.text('Metod/Standart', colX[2], tableTop + 5, { width: colWidths[2] });
                doc.text('Birim', colX[3], tableTop + 5, { width: colWidths[3] });
                doc.text('Miktar', colX[4], tableTop + 5, { width: colWidths[4] });
                doc.text('B.Fiyat', colX[5], tableTop + 5, { width: colWidths[5] });
                doc.text('Tutar', colX[6], tableTop + 5, { width: colWidths[6] });

                let rowY = tableTop + 20;

                katData.hizmetler.forEach((detay, idx) => {
                    // Sayfa kontrolü
                    if (rowY > 750) {
                        doc.addPage();
                        rowY = 50;
                    }

                    const hizmet = detay.hizmet || {};
                    const rowHeight = 15;

                    // Alternatif satır rengi
                    if (idx % 2 === 1) {
                        doc.rect(40, rowY - 2, 520, rowHeight).fill('#fafafa');
                        doc.fillColor('black');
                    }

                    doc.font(fontNormal).fontSize(7);
                    doc.text((idx + 1).toString(), colX[0], rowY, { width: colWidths[0] });
                    doc.text((hizmet.ad || '').substring(0, 35), colX[1], rowY, { width: colWidths[1] });
                    doc.text((hizmet.metodKapsam || hizmet.standartYonetmelik || '-').substring(0, 20), colX[2], rowY, { width: colWidths[2] });
                    doc.text(hizmet.birim || 'Adet', colX[3], rowY, { width: colWidths[3] });
                    doc.text(detay.miktar.toString(), colX[4], rowY, { width: colWidths[4] });
                    doc.text(formatMoney(detay.birimFiyat), colX[5], rowY, { width: colWidths[5] });
                    doc.text(formatMoney(detay.tutar), colX[6], rowY, { width: colWidths[6] });

                    rowY += rowHeight;
                });

                // Tablo alt çizgisi
                doc.moveTo(40, rowY).lineTo(560, rowY).stroke();
                doc.y = rowY + 10;
            });

            // ============ TOPLAM TABLOSU ============

            if (doc.y > 650) {
                doc.addPage();
            }

            doc.moveDown(1);
            const totalY = doc.y;

            // Toplam kutusu
            doc.rect(350, totalY, 200, 80).stroke();

            doc.font(fontNormal).fontSize(9);
            doc.text('Ara Toplam:', 360, totalY + 8);
            doc.text(formatMoney(teklif.araToplam), 480, totalY + 8, { align: 'right', width: 60 });

            if (parseFloat(teklif.iskontoOran) > 0) {
                doc.text(`İskonto (%${teklif.iskontoOran}):`, 360, totalY + 22);
                doc.text(`-${formatMoney(teklif.iskontoTutar)}`, 480, totalY + 22, { align: 'right', width: 60 });
            }

            doc.text('Toplam:', 360, totalY + 36);
            doc.text(formatMoney(teklif.toplamTutar), 480, totalY + 36, { align: 'right', width: 60 });

            doc.text(`KDV (%${teklif.kdvOrani || 20}):`, 360, totalY + 50);
            doc.text(formatMoney(teklif.kdvTutar), 480, totalY + 50, { align: 'right', width: 60 });

            doc.font(fontName).fontSize(10).fillColor('#1a5276');
            doc.text('GENEL TOPLAM:', 360, totalY + 64);
            doc.text(formatMoney(teklif.genelToplam) + ' TL', 460, totalY + 64, { align: 'right', width: 80 });
            doc.fillColor('black');

            // ============ ŞARTLAR SAYFASI ============
            doc.addPage();

            doc.font(fontName).fontSize(12).fillColor('#1a5276');
            doc.text('TEKLİF ŞARTLARI VE KOŞULLARI', { align: 'center' });
            doc.fillColor('black');
            doc.moveDown(1);

            doc.font(fontNormal).fontSize(8);
            TEKLIF_SARTLARI.forEach((sart, idx) => {
                doc.text(`${idx + 1}. ${sart}`, { align: 'justify' });
                doc.moveDown(0.3);
            });

            // ============ İMZA ALANI ============
            doc.moveDown(2);

            // Banka bilgileri
            if (firma.bankaAdi) {
                doc.font(fontName).fontSize(9).text('BANKA BİLGİLERİ', 40);
                doc.font(fontNormal).fontSize(8);
                doc.text(`Banka: ${firma.bankaAdi || ''} - ${firma.bankaSube || ''}`);
                doc.text(`IBAN: ${firma.iban || ''}`);
                doc.moveDown(1);
            }

            // İmza kutuları
            const signY = doc.y + 20;

            // Sol - Firma imza
            doc.rect(40, signY, 200, 80).stroke();
            doc.font(fontName).fontSize(9).text('TEKLİFİ VEREN', 80, signY + 5);
            doc.font(fontNormal).fontSize(8);
            doc.text(firma.name || '', 50, signY + 20);
            doc.text(firma.yetkili || '', 50, signY + 32);
            doc.text(firma.yetkiliUnvan || '', 50, signY + 44);

            // Mühür/İmza
            const muhurPath = path.join(__dirname, 'public', 'images', 'mühür.jpg');
            const imzaPath = path.join(__dirname, 'public', 'images', 'imza-vahap.png');
            if (fs.existsSync(muhurPath)) {
                doc.image(muhurPath, 150, signY + 25, { width: 50 });
            }
            if (fs.existsSync(imzaPath)) {
                doc.image(imzaPath, 180, signY + 35, { width: 50 });
            }

            // Sağ - Müşteri imza
            doc.rect(350, signY, 200, 80).stroke();
            doc.font(fontName).fontSize(9).text('TEKLİFİ ALAN', 420, signY + 5);
            doc.font(fontNormal).fontSize(8);
            doc.text('Firma Kaşe ve İmza', 400, signY + 50);

            // Onay telefon
            if (teklif.onayTelefon) {
                doc.moveDown(2);
                doc.font(fontNormal).fontSize(8).fillColor('#666');
                doc.text('* Bu teklif telefon ile onay alınarak hazırlanmıştır.', { align: 'center' });
            }

            doc.end();

        } catch (error) {
            reject(error);
        }
    });
}

function formatMoney(value) {
    const num = parseFloat(value) || 0;
    return num.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Teklif PDF'ini dosyaya kaydet
 */
async function teklifPdfKaydet(teklif, outputPath) {
    const buffer = await teklifPdfOlustur(teklif);
    fs.writeFileSync(outputPath, buffer);
    return outputPath;
}

module.exports = {
    teklifPdfOlustur,
    teklifPdfKaydet,
    TEKLIF_SARTLARI
};
