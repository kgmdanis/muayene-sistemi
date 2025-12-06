const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

function generatePDF(teklif, musteri, db) {
  return new Promise((resolve, reject) => {
    try {
      // PDF oluştur
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });

      // Buffer'ları topla
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Logo ekle
      const logoPath = path.join(__dirname, 'public', 'images', 'logo.png');
      if (fs.existsSync(logoPath)) {
        try {
          doc.image(logoPath, 50, 40, { width: 100 });
        } catch (err) {
          console.log('Logo eklenemedi:', err);
        }
      }

      // Başlık
      doc.fontSize(18)
         .text('ÖNDER MUAYENE KURULUŞU', 170, 50, { width: 350 })
         .fontSize(12)
         .text('TEST VE ÖLÇÜM TALEP TEKLİF FORMU', 170, 75, { width: 350 });

      // Çizgi
      doc.moveTo(50, 110)
         .lineTo(545, 110)
         .stroke();

      // Teklif bilgileri
      doc.fontSize(10)
         .text(`Teklif No: ${teklif.teklifNo}`, 50, 130)
         .text(`Tarih: ${teklif.teklifTarihi}`, 450, 130);

      // Müşteri bilgileri
      doc.fontSize(12)
         .text('MÜŞTERİ BİLGİLERİ', 50, 160)
         .fontSize(10);

      let yPos = 180;
      doc.text(`Firma: ${musteri.unvan}`, 50, yPos);
      yPos += 15;
      doc.text(`Adres: ${musteri.adres}`, 50, yPos);
      yPos += 15;
      doc.text(`Telefon: ${musteri.telefon}`, 50, yPos);
      doc.text(`E-posta: ${musteri.email}`, 300, yPos);
      yPos += 15;
      if (musteri.yetkiliKisi) {
        doc.text(`Yetkili: ${musteri.yetkiliKisi}`, 50, yPos);
        yPos += 15;
      }

      // Hizmetler tablosu
      yPos += 20;
      doc.fontSize(12)
         .text('HİZMETLER', 50, yPos);
      
      yPos += 20;
      
      // Tablo başlıkları
      doc.fontSize(9);
      doc.text('Hizmet', 50, yPos, { width: 200 });
      doc.text('Birim', 260, yPos, { width: 60 });
      doc.text('Miktar', 330, yPos, { width: 60 });
      doc.text('B.Fiyat', 400, yPos, { width: 70 });
      doc.text('Toplam', 480, yPos, { width: 70 });
      
      // Başlık çizgisi
      yPos += 15;
      doc.moveTo(50, yPos)
         .lineTo(545, yPos)
         .stroke();
      
      yPos += 10;

      // Hizmetleri listele
      doc.fontSize(8);
      teklif.hizmetler.forEach(hizmet => {
        // Sayfa kontrolü
        if (yPos > 700) {
          doc.addPage();
          yPos = 50;
        }

        doc.text(hizmet.ad, 50, yPos, { width: 200 });
        doc.text(hizmet.birim, 260, yPos, { width: 60 });
        doc.text(hizmet.miktar.toString(), 330, yPos, { width: 60 });
        doc.text(`${hizmet.fiyat} TL`, 400, yPos, { width: 70 });
        doc.text(`${hizmet.toplam} TL`, 480, yPos, { width: 70 });
        
        yPos += 20;
      });

      // Toplam
      yPos += 10;
      doc.moveTo(350, yPos)
         .lineTo(545, yPos)
         .stroke();
      
      yPos += 10;
      doc.fontSize(10);
      doc.text('Ara Toplam:', 350, yPos);
      doc.text(`${teklif.araToplam} TL`, 480, yPos);
      
      yPos += 15;
      doc.text('KDV (%20):', 350, yPos);
      doc.text(`${teklif.kdv} TL`, 480, yPos);
      
      yPos += 15;
      doc.fontSize(11);
      doc.text('GENEL TOPLAM:', 350, yPos);
      doc.text(`${teklif.genelToplam} TL`, 480, yPos);

      // İmza alanları
      if (yPos < 600) {
        yPos = 650;
      } else {
        doc.addPage();
        yPos = 100;
      }

      doc.fontSize(10);
      doc.text('HAZIRLAYAN', 100, yPos);
      doc.text('ONAYLAYAN', 400, yPos);
      
      yPos += 60;
      doc.moveTo(100, yPos)
         .lineTo(200, yPos)
         .stroke();
      doc.moveTo(400, yPos)
         .lineTo(500, yPos)
         .stroke();

      // PDF'i bitir
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = { generatePDF };