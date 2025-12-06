const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Sertifika PDF'i oluşturur
 * @param {Object} sertifika - Sertifika verisi
 * @param {Object} muayene - Muayene verisi
 * @param {Object} musteri - Müşteri verisi
 * @param {Object} firmaBilgi - Firma bilgileri
 * @returns {Promise<Buffer>} PDF buffer
 */
async function generateSertifikaPDF(sertifika, muayene, musteri, firmaBilgi) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({
                size: 'A4',
                margins: { top: 50, bottom: 50, left: 50, right: 50 }
            });

            const chunks = [];
            doc.on('data', (chunk) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            // Başlık
            doc.fontSize(20)
               .font('Helvetica-Bold')
               .text('MUAYENE VE OLCUM RAPORU', { align: 'center' });

            doc.moveDown(0.5);

            // Firma bilgileri
            doc.fontSize(10)
               .font('Helvetica-Bold')
               .text(firmaBilgi.unvan || 'ONDER MUAYENE', { align: 'center' });

            doc.fontSize(9)
               .font('Helvetica')
               .text(firmaBilgi.adres || '', { align: 'center' })
               .text(`Tel: ${firmaBilgi.telefon || ''} | Email: ${firmaBilgi.email || ''}`, { align: 'center' });

            doc.moveDown(1);
            doc.strokeColor('#2C5F8D')
               .lineWidth(2)
               .moveTo(50, doc.y)
               .lineTo(545, doc.y)
               .stroke();
            doc.moveDown(1);

            // Sertifika bilgileri - 2 kolon
            const leftX = 50;
            const rightX = 300;
            const startY = doc.y;

            // Sol kolon
            doc.fontSize(10).font('Helvetica-Bold');
            doc.text('Sertifika No:', leftX, startY);
            doc.font('Helvetica');
            doc.text(sertifika.sertifikaNo || '-', leftX + 100, startY);

            doc.font('Helvetica-Bold');
            doc.text('Teklif No:', leftX, startY + 20);
            doc.font('Helvetica');
            doc.text(sertifika.teklifNo || '-', leftX + 100, startY + 20);

            doc.font('Helvetica-Bold');
            doc.text('Tarih:', leftX, startY + 40);
            doc.font('Helvetica');
            doc.text(new Date(sertifika.olusturmaTarihi).toLocaleDateString('tr-TR'), leftX + 100, startY + 40);

            // Sağ kolon
            doc.font('Helvetica-Bold');
            doc.text('Durum:', rightX, startY);
            doc.font('Helvetica');
            doc.text(sertifika.durum || '-', rightX + 100, startY);

            doc.font('Helvetica-Bold');
            doc.text('Sertifika Tipi:', rightX, startY + 20);
            doc.font('Helvetica');
            doc.text(sertifika.sertifikaTipi || '-', rightX + 100, startY + 20);

            doc.moveDown(4);

            // Müşteri bilgileri
            doc.fontSize(12)
               .font('Helvetica-Bold')
               .fillColor('#2C5F8D')
               .text('MUSTERI BILGILERI');

            doc.strokeColor('#2C5F8D')
               .lineWidth(1)
               .moveTo(50, doc.y)
               .lineTo(545, doc.y)
               .stroke();
            doc.moveDown(0.5);

            doc.fontSize(10)
               .fillColor('#000000')
               .font('Helvetica-Bold')
               .text('Firma Unvani: ', { continued: true })
               .font('Helvetica')
               .text(musteri?.unvan || '-');

            doc.font('Helvetica-Bold')
               .text('Adres: ', { continued: true })
               .font('Helvetica')
               .text(musteri?.adres || '-');

            doc.font('Helvetica-Bold')
               .text('Telefon: ', { continued: true })
               .font('Helvetica')
               .text(`${musteri?.telefon || '-'}    Email: ${musteri?.email || '-'}`);

            doc.moveDown(1);

            // Hizmet bilgileri
            doc.fontSize(12)
               .font('Helvetica-Bold')
               .fillColor('#2C5F8D')
               .text('HIZMET BILGILERI');

            doc.strokeColor('#2C5F8D')
               .lineWidth(1)
               .moveTo(50, doc.y)
               .lineTo(545, doc.y)
               .stroke();
            doc.moveDown(0.5);

            doc.fontSize(10)
               .fillColor('#000000')
               .font('Helvetica-Bold')
               .text('Hizmet: ', { continued: true })
               .font('Helvetica')
               .text(sertifika.hizmetAdi || '-');

            doc.font('Helvetica-Bold')
               .text('Kategori: ', { continued: true })
               .font('Helvetica')
               .text(sertifika.sertifikaTipi || '-');

            // Personel bilgisi
            const hizmet = muayene?.hizmetler?.find(h => h.id === sertifika.hizmetId);
            if (hizmet?.atananPersonel) {
                doc.font('Helvetica-Bold')
                   .text('Atanan Personel: ', { continued: true })
                   .font('Helvetica')
                   .text(hizmet.atananPersonel);
            }

            if (hizmet?.muayeneTarihi) {
                doc.font('Helvetica-Bold')
                   .text('Muayene Tarihi: ', { continued: true })
                   .font('Helvetica')
                   .text(new Date(hizmet.muayeneTarihi).toLocaleDateString('tr-TR'));
            }

            doc.moveDown(1);

            // Teknik özellikler
            if (sertifika.teknikOzellikler && Object.keys(sertifika.teknikOzellikler).length > 0) {
                doc.fontSize(12)
                   .font('Helvetica-Bold')
                   .fillColor('#2C5F8D')
                   .text('TEKNIK OZELLIKLER');

                doc.strokeColor('#2C5F8D')
                   .lineWidth(1)
                   .moveTo(50, doc.y)
                   .lineTo(545, doc.y)
                   .stroke();
                doc.moveDown(0.5);

                doc.fontSize(10).fillColor('#000000');
                Object.entries(sertifika.teknikOzellikler).forEach(([key, value]) => {
                    doc.font('Helvetica-Bold')
                       .text(`${key}: `, { continued: true })
                       .font('Helvetica')
                       .text(value || '-');
                });

                doc.moveDown(1);
            }

            // Test sonuçları
            if (sertifika.testSonuclari && Object.keys(sertifika.testSonuclari).length > 0) {
                doc.fontSize(12)
                   .font('Helvetica-Bold')
                   .fillColor('#2C5F8D')
                   .text('TEST VE DENEY SONUCLARI');

                doc.strokeColor('#2C5F8D')
                   .lineWidth(1)
                   .moveTo(50, doc.y)
                   .lineTo(545, doc.y)
                   .stroke();
                doc.moveDown(0.5);

                doc.fontSize(10).fillColor('#000000');
                Object.entries(sertifika.testSonuclari).forEach(([key, value]) => {
                    doc.font('Helvetica-Bold')
                       .text(`${key}: `, { continued: true })
                       .font('Helvetica')
                       .text(value || '-');
                });

                doc.moveDown(1);
            }

            // Sonuç
            doc.moveDown(2);
            doc.fontSize(12)
               .font('Helvetica-Bold')
               .fillColor('#2C5F8D')
               .text('SONUC VE KANAAT');

            doc.strokeColor('#2C5F8D')
               .lineWidth(1)
               .moveTo(50, doc.y)
               .lineTo(545, doc.y)
               .stroke();
            doc.moveDown(0.5);

            doc.fontSize(10)
               .fillColor('#000000')
               .font('Helvetica')
               .text('Yukarida muayene ozellikleri belirtilen ekipman, mevcut sartlar altinda, olcum tarihi itibariyle bir yil boyunca "kullanilmasi uygundur."');

            // Alt kısım - imza alanları
            doc.moveDown(3);
            const signatureY = doc.y;

            // Sol imza
            doc.fontSize(10)
               .font('Helvetica-Bold')
               .text('HAZIRLAYAN', 80, signatureY);
            doc.moveTo(80, signatureY + 50)
               .lineTo(200, signatureY + 50)
               .stroke();
            doc.fontSize(9)
               .font('Helvetica')
               .text(sertifika.olusturanKullanici || '', 80, signatureY + 55);

            // Sağ imza
            doc.fontSize(10)
               .font('Helvetica-Bold')
               .text('ONAYLAYAN', 350, signatureY);
            doc.moveTo(350, signatureY + 50)
               .lineTo(470, signatureY + 50)
               .stroke();
            doc.fontSize(9)
               .font('Helvetica')
               .text('Teknik Sorumlu', 350, signatureY + 55);

            // Footer
            doc.fontSize(8)
               .fillColor('#666666')
               .text(`Belge No: ${sertifika.sertifikaNo} | Olusturma: ${new Date(sertifika.olusturmaTarihi).toLocaleString('tr-TR')}`,
                     50,
                     doc.page.height - 30,
                     { align: 'center' });

            doc.end();

        } catch (error) {
            console.error('PDF oluşturma hatası:', error);
            reject(error);
        }
    });
}

module.exports = { generateSertifikaPDF };
