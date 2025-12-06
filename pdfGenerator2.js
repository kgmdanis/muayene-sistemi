const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

function generatePDF(teklif, musteri, db) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({
                margin: 40,
                size: 'A4',
                bufferPages: true
            });

            // Buffer'ları topla
            const chunks = [];
            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            // Türkçe font
            try {
                const fontPath = path.join(__dirname, 'fonts');
                if (fs.existsSync(path.join(fontPath, 'DejaVuSans.ttf'))) {
                    doc.registerFont('Turkish', path.join(fontPath, 'DejaVuSans.ttf'));
                    doc.registerFont('Turkish-Bold', path.join(fontPath, 'DejaVuSans-Bold.ttf'));
                    doc.font('Turkish');
                } else {
                    // Varsayılan font
                    doc.font('Helvetica');
                }
            } catch (err) {
                console.log('Font yüklenemedi, varsayılan font kullanılacak');
                doc.font('Helvetica');
            }

            // Renkler
            const primaryColor = '#2C5F8D';
            const darkColor = '#1a3d5c';
            const lightBg = '#D9E2F3';
            const zebraColor = '#F2F2F2';

            // ==================== HEADER - RENKLI ARKA PLAN ====================
            doc.fillColor(lightBg).rect(40, 40, 515, 90).fill();

            // Logo
            const logoPath = path.join(__dirname, 'public', 'images', 'logo.png');
            if (fs.existsSync(logoPath)) {
                try {
                    doc.image(logoPath, 50, 50, { width: 120, height: 60, fit: [120, 60] });
                } catch (err) {
                    console.log('Logo eklenemedi');
                }
            }
            
            // TÜRKAK logosu - sağ üst köşe
            const turkakPath = path.join(__dirname, 'public', 'images', 'turkak-logo.png');
            if (fs.existsSync(turkakPath)) {
                try {
                    doc.image(turkakPath, 470, 50, { width: 80, height: 40, fit: [80, 40] });
                } catch (err) {
                    console.log('TÜRKAK logosu eklenemedi');
                }
            }

            // Şirket bilgileri (logo yanında)
            doc.fillColor('#000000');
            doc.fontSize(18).text(db.firmaBilgi.ad, 190, 55, { width: 300 });
            doc.fontSize(9);
            doc.text(db.firmaBilgi.adres, 190, 78);
            doc.text(`Tel: ${db.firmaBilgi.telefon}`, 190, 92);
            doc.text(`Email: ${db.firmaBilgi.email}`, 190, 106);

            // ==================== TEKLİF BAŞLIK ====================
            doc.fillColor(primaryColor).rect(40, 150, 515, 35).fill();
            doc.fillColor('#FFFFFF');
            doc.fontSize(16).text('TEST VE ÖLÇÜM TALEP TEKLİF FORMU', 0, 160, { align: 'center', width: 595 });

            // ==================== GİRİŞ METNİ ====================
            doc.fillColor('#000000').fontSize(10);
            doc.text('Sayın Firma Yetkilisi;', 40, 200);
            doc.moveDown(0.5);
            doc.text('Tarafınızdan talep etmiş olduğunuz ölçümlere ait fiyat teklifimiz ve ölçümlerde kullanılacak metotlar ekte bilginize sunulmuştur.', 40, 220, { 
                width: 515, 
                align: 'justify' 
            });

            // Teklif No ve Tarih - Kutucuklar
            doc.fillColor(zebraColor).rect(40, 250, 250, 30).fill();
            doc.fillColor(zebraColor).rect(305, 250, 250, 30).fill();

            doc.fillColor('#000000').fontSize(10);
            doc.text('Teklif No:', 50, 258);
            doc.text(teklif.teklifNo, 110, 258);

            doc.text('Tarih:', 315, 258);
            doc.text(new Date(teklif.teklifTarihi).toLocaleDateString('tr-TR'), 355, 258);

            doc.text('Geçerlilik:', 420, 258);
            doc.text(`${teklif.gecerlilik} gün`, 480, 258);

            // ==================== MÜŞTERİ BİLGİLERİ ====================
            let yPos = 300;

            doc.fillColor(primaryColor).rect(40, yPos, 515, 20).fill();
            doc.fillColor('#FFFFFF').fontSize(11);
            doc.text('MÜŞTERİ BİLGİLERİ', 50, yPos + 5);

            // Konu satırı
            doc.fillColor('#000000').fontSize(10);
            doc.text(`KONU: ${teklif.konu || 'Periyodik Kontrol ve İş Hijyeni Ölçüm Fiyat Teklifi'}`, 40, yPos - 15);

            yPos += 25;
            doc.fillColor('#000000').fontSize(9);
            doc.rect(40, yPos, 515, 60).stroke();

            doc.text(`Firma: ${musteri.unvan}`, 50, yPos + 8);
            doc.text(`Yetkili: ${musteri.yetkiliKisi || '-'}`, 50, yPos + 23);
            doc.text(`Adres: ${musteri.adres}`, 50, yPos + 38);
            doc.text(`Tel: ${musteri.telefon}`, 320, yPos + 38);
            if (musteri.email) {
                doc.text(`Email: ${musteri.email}`, 320, yPos + 23);
            }

            // ==================== HİZMETLER TABLOSU ====================
            yPos += 75;

            // Tablo başlık satırı - koyu mavi arka plan
            doc.fillColor(darkColor).rect(40, yPos, 515, 22).fill();
            doc.fillColor('#FFFFFF').fontSize(9);
            doc.text('Hizmet', 50, yPos + 6, { width: 220, lineBreak: false });
            doc.text('Miktar', 280, yPos + 6, { width: 40, align: 'center' });
            doc.text('Birim', 330, yPos + 6, { width: 50, align: 'center' });
            doc.text('Birim Fiyat', 390, yPos + 6, { width: 70, align: 'right' });
            doc.text('Toplam', 470, yPos + 6, { width: 75, align: 'right' });

            yPos += 22;

            // Hizmet satırları - zebra deseni
            doc.fillColor('#000000');
            
            // Hizmetleri kategoriye göre grupla
            let kategoriler = {};
            teklif.hizmetler.forEach(hizmet => {
                if (!kategoriler[hizmet.kategori]) {
                    kategoriler[hizmet.kategori] = [];
                }
                kategoriler[hizmet.kategori].push(hizmet);
            });

            let satir = 0;
            
            // Her kategori için
            Object.keys(kategoriler).forEach(kategori => {
                // Kategori başlığı
                doc.fillColor(primaryColor).fontSize(10).text(kategori, 45, yPos + 8);
                yPos += 25;
                
                // Kategorideki hizmetler
                kategoriler[kategori].forEach((h, index) => {
                    // Sayfa kontrolü
                    if (yPos > 700) {
                        doc.addPage();
                        yPos = 50;
                    }
                    
                    // Alternatif satır rengi
                    if (satir % 2 === 0) {
                        doc.fillColor(zebraColor).rect(40, yPos, 515, 25).fill();
                    }

                    // Kenarlıklar
                    doc.rect(40, yPos, 515, 25).stroke();
                    doc.moveTo(270, yPos).lineTo(270, yPos + 25).stroke();
                    doc.moveTo(320, yPos).lineTo(320, yPos + 25).stroke();
                    doc.moveTo(380, yPos).lineTo(380, yPos + 25).stroke();
                    doc.moveTo(460, yPos).lineTo(460, yPos + 25).stroke();

                    // İçerik
                    doc.fillColor('#000000').fontSize(9);
                    
                    // Uzun açıklamalar için wrap
                    const maxChars = 50;
                    const aciklama = h.ad.length > maxChars ? h.ad.substring(0, maxChars) + '...' : h.ad;
                    
                    doc.text(aciklama, 45, yPos + 8, { width: 220 });
                    doc.text(h.miktar.toString(), 280, yPos + 8, { width: 40, align: 'center' });
                    doc.text(h.birim, 325, yPos + 8, { width: 50, align: 'center' });
                    doc.text(`₺${h.fiyat.toLocaleString('tr-TR')}`, 385, yPos + 8, { width: 70, align: 'right' });
                    doc.text(`₺${h.toplam.toLocaleString('tr-TR')}`, 465, yPos + 8, { width: 75, align: 'right' });

                    yPos += 25;
                    satir++;
                });
            });

            // ==================== TOPLAM BÖLÜMÜ ====================
            yPos += 15;

            // Ara Toplam
            doc.fillColor(zebraColor).rect(380, yPos, 175, 18).fill();
            doc.fillColor('#000000').fontSize(10);
            doc.text('Ara Toplam:', 390, yPos + 4);
            doc.text(`₺${teklif.araToplam.toLocaleString('tr-TR', {minimumFractionDigits: 2})}`, 465, yPos + 4, { width: 85, align: 'right' });
            doc.rect(380, yPos, 175, 18).stroke();

            yPos += 18;

            // KDV
            doc.fillColor('#FFFFFF').rect(380, yPos, 175, 18).fill();
            doc.fillColor('#000000');
            doc.text('KDV %20:', 390, yPos + 4);
            doc.text(`₺${teklif.kdv.toLocaleString('tr-TR', {minimumFractionDigits: 2})}`, 465, yPos + 4, { width: 85, align: 'right' });
            doc.rect(380, yPos, 175, 18).stroke();

            yPos += 18;

            // Genel Toplam - koyu arka plan
            doc.fillColor(primaryColor).rect(380, yPos, 175, 20).fill();
            doc.fillColor('#FFFFFF').fontSize(11);
            doc.text('GENEL TOPLAM:', 390, yPos + 5);
            doc.text(`₺${teklif.genelToplam.toLocaleString('tr-TR', {minimumFractionDigits: 2})}`, 465, yPos + 5, { width: 85, align: 'right' });

            // ==================== KAPANIŞ METNİ ====================
            yPos += 30;
            doc.fillColor('#000000').fontSize(10);
            doc.text('Firmamıza göstermiş olduğunuz ilgi ve güvene teşekkür eder, teklifimizin uygun bulunacağını umar, iyi çalışmalar dileriz.', 40, yPos, {
                width: 515,
                align: 'justify'
            });
            
            // ==================== AÇIKLAMA NOTLARI ====================
            yPos += 30;
            doc.fillColor('#000000').fontSize(9);
            doc.text('NOT:', 40, yPos);
            yPos += 15;
            doc.fontSize(8);
            doc.text('• Akredite kapsamında yapılan ölçümler, İŞ HİJYENİ (ORTAM ÖLÇÜMÜ) parametreleri ile yapılan ölçümlerdir.', 50, yPos);
            yPos += 12;
            doc.text('• TS EN ISO/IEC 17025 standardına göre TÜRKAK tarafından akredite edilmiştir.', 50, yPos);
            yPos += 12;
            doc.text('• Akreditasyon kapsamı için www.turkak.org.tr adresini ziyaret ediniz.', 50, yPos);
            yPos += 12;
            doc.text('• Bu teklif yukarıda belirtilen süre içerisinde geçerlidir.', 50, yPos);
            yPos += 12;
            doc.text('• Fiyatlarımıza KDV dahil değildir.', 50, yPos);
            
            // ==================== İMZA ALANLARI ====================
            if (yPos < 500) {
                yPos = 550;
            } else {
                doc.addPage();
                yPos = 100;
            }

            doc.fillColor('#000000').fontSize(10);
            doc.text('HAZIRLAYAN', 100, yPos);
            doc.text('ONAYLAYAN', 400, yPos);
            
            // İmza resmi ekle
            const imzaPath = path.join(__dirname, 'public', 'images', 'imza-vahap.png');
            if (fs.existsSync(imzaPath)) {
                try {
                    doc.image(imzaPath, 100, yPos + 15, { width: 80, height: 40, fit: [80, 40] });
                } catch (err) {
                    console.log('İmza eklenemedi');
                }
            }
            
            // Yetkili ismi
            doc.fontSize(9);
            doc.text('ABDULVAHAP ÖNDER', 100, yPos + 60);
            doc.text('Firma Müdürü', 100, yPos + 75);
            
            // İmza çizgileri
            doc.moveTo(100, yPos + 55).lineTo(200, yPos + 55).stroke();
            doc.moveTo(400, yPos + 55).lineTo(500, yPos + 55).stroke();
            
            // ==================== DÖKÜMAN BİLGİLERİ ====================
            const bottomY = doc.page.height - 50;
            
            // Döküman bilgileri sağ alt
            doc.fontSize(7).fillColor('#666666');
            if (db.firmaBilgi.dokuman) {
                doc.text(`Döküman Kodu: ${db.firmaBilgi.dokuman.kod}`, 400, bottomY - 20);
                doc.text(`Revizyon No: ${db.firmaBilgi.dokuman.revizyon}`, 400, bottomY - 10);
                doc.text(`Yayın Tarihi: ${db.firmaBilgi.dokuman.tarih}`, 400, bottomY);
            }

            // PDF'i bitir
            doc.end();
        } catch (error) {
            reject(error);
        }
    });
}

module.exports = { generatePDF };