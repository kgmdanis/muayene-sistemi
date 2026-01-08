const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Dosya yolları
const LOGO_PATH = path.join(__dirname, 'public', 'images', 'logo.png');
const TURKAK_PATH = path.join(__dirname, 'public', 'images', 'türkak-logo.png');
const MUHUR_PATH = path.join(__dirname, 'public', 'images', 'mühür.jpg');

// Renkler
const MAVI = '#006699';
const ACIK_MAVI = '#e6f2ff';
const SARI = '#ffff00';

// 19 Madde
const MADDELER = [
    'Ölçüm / Numune alma işleminin gerçekleştirileceği alan ile ilgili, çalışma alanının iş sağlığı ve güvenliği kurallarına uygun olarak hazırlanması tarafınızca karşılanacaktır.',
    'Ölçüm / Numune Alma noktasının hazır olmaması nedeniyle işlemin gerçekleştirilememesi halinde sorumluluk tarafınıza aittir.',
    'Teklif onayı; "sözleşme onayı" bölümü müşteri tarafından kaşe-imza ile onaylanmalıdır.',
    'Ücretin %50\'si teklif onayı ile birlikte, kalanı raporların tesliminden sonra ödenecektir.',
    'Hizmet alımınız tarafınızca sonlandırıldığında yapılan işlem tutarı kadar tazminat fatura edilecektir.',
    'Ölçüm esnasında başka parametre tespit edilirse ilave ücretlendirme yapılacaktır.',
    'Rapor teslimi, işlem tamamlandıktan sonra 20 iş günü içinde yapılacaktır.',
    'Raporlar, ödendi belgesinin iletilmesinden sonra 15 gün içinde teslim edilir.',
    'Ölçüm/analiz sonuçlarına itiraz süresi rapor tarihinden itibaren 15 gündür.',
    'Uygunsuz sonuçlar nedeniyle tekrar ölçüm birim fiyat üzerinden fatura edilir.',
    'Teklif 1 ay geçerlidir, sonra revize edilir.',
    'Ulaşım ve konaklama firmamıza aittir, müşteri kaynaklı gecikmeler hariç.',
    'Müşteri bilgileri ve raporlar 3. şahıslarla paylaşılmaz.',
    'İhtilaf durumunda müşteri deneye tanıklık edebilir.',
    'Bu teklif onaylandıktan sonra sözleşme yerine geçer.',
    'Müşteri talebiyle deney sonuçlarında değişiklik yapılmaz.',
    'Her türlü ihtilafta Konya Mahkemeleri yetkilidir.',
    'Onay için son sayfayı imzalayarak elden, fax veya e-posta ile iletin.',
    'Banka: Ziraat Bankası Buğday Pazarı/Konya\nIBAN: TR80 0001 0025 2894 1001 5650 01'
];

// Para formatla
function formatPara(deger) {
    if (!deger && deger !== 0) return '';
    const sayi = parseFloat(deger) || 0;
    if (sayi === 0) return '';
    return sayi.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Tarih formatla - DD.MM.YYYY
function formatTarih(tarih) {
    if (!tarih) return new Date().toLocaleDateString('tr-TR');
    const d = new Date(tarih);
    if (isNaN(d.getTime())) return new Date().toLocaleDateString('tr-TR');
    const gun = String(d.getDate()).padStart(2, '0');
    const ay = String(d.getMonth() + 1).padStart(2, '0');
    const yil = d.getFullYear();
    return `${gun}.${ay}.${yil}`;
}

/**
 * Teklif PDF oluştur - SADECE SEÇİLEN HİZMETLER
 */
async function teklifPdfOlustur(teklif, tumKategoriler) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({
                size: 'A4',
                margins: { top: 30, bottom: 30, left: 40, right: 40 },
                bufferPages: true
            });

            const buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => resolve(Buffer.concat(buffers)));
            doc.on('error', reject);

            // Font ayarları
            const FONT_PATH = path.join(__dirname, 'fonts', 'DejaVuSans.ttf');
            const FONT_BOLD_PATH = path.join(__dirname, 'fonts', 'DejaVuSans-Bold.ttf');

            if (fs.existsSync(FONT_PATH)) {
                doc.registerFont('Normal', FONT_PATH);
                doc.registerFont('Bold', fs.existsSync(FONT_BOLD_PATH) ? FONT_BOLD_PATH : FONT_PATH);
            }
            const fontN = fs.existsSync(FONT_PATH) ? 'Normal' : 'Helvetica';
            const fontB = fs.existsSync(FONT_PATH) ? 'Bold' : 'Helvetica-Bold';

            const customer = teklif.customer || {};
            const firma = teklif.firma || {};
            const detaylar = teklif.detaylar || [];

            // Detayları kategorilere göre grupla
            const kategoriGruplari = {};
            detaylar.forEach(d => {
                if (d.miktar > 0) { // Sadece miktar > 0 olanlar
                    const katAd = d.hizmet?.kategori?.ad || 'Diğer';
                    const katSira = d.hizmet?.kategori?.sira || 99;
                    if (!kategoriGruplari[katAd]) {
                        kategoriGruplari[katAd] = { sira: katSira, detaylar: [] };
                    }
                    kategoriGruplari[katAd].detaylar.push(d);
                }
            });

            let sayfaNo = 1;

            // ========================================================
            // SAYFA 1 - KAPAK
            // ========================================================

            // Sol üst logo - BÜYÜK (180px)
            if (fs.existsSync(LOGO_PATH)) {
                doc.image(LOGO_PATH, 40, 20, { width: 180 });
            }

            // Sağ üst TÜRKAK logosu
            if (fs.existsSync(TURKAK_PATH)) {
                doc.image(TURKAK_PATH, 470, 20, { width: 85 });
            }

            // Başlık
            doc.font(fontB).fontSize(14).fillColor(MAVI);
            doc.text('TEST VE ÖLÇÜM TALEP TEKLİF FORMU', 40, 110, { align: 'center', width: 515 });
            doc.fillColor('black');

            // FİRMA BİLGİLERİ TABLOSU
            let y = 140;
            const tableW = 515;
            const col1W = 130;
            const rowH = 20;

            // Başlık
            doc.rect(40, y, tableW, rowH).fill(MAVI);
            doc.font(fontB).fontSize(10).fillColor('white');
            doc.text('FİRMA BİLGİLERİ', 45, y + 5, { width: tableW - 10, align: 'center' });
            doc.fillColor('black');
            y += rowH;

            const bilgiler = [
                ['TEKLİF TARİHİ', formatTarih(teklif.teklifTarihi || teklif.createdAt)],
                ['TEKLİF NO', teklif.teklifNo || '-'],
                ['FİRMA ADI', customer.unvan || '-'],
                ['ADRES', (customer.adres || '-').substring(0, 60)],
                ['YETKİLİ', customer.yetkili || '-'],
                ['TELEFON', customer.telefon || '-'],
                ['E-POSTA', customer.email || '-']
            ];

            bilgiler.forEach(([label, value]) => {
                doc.rect(40, y, col1W, rowH).stroke('#333');
                doc.rect(40 + col1W, y, tableW - col1W, rowH).stroke('#333');
                doc.font(fontB).fontSize(9).text(label, 45, y + 5, { width: col1W - 10 });
                doc.font(fontN).fontSize(9).text(value, 45 + col1W, y + 5, { width: tableW - col1W - 10 });
                y += rowH;
            });

            // Açıklama
            y += 20;
            doc.font(fontN).fontSize(10);
            doc.text('Sayın Firma Yetkilisi,', 40, y);
            y += 15;
            doc.text('Tarafımızdan talep etmiş olduğunuz ölçümlere ait fiyat teklifimiz aşağıda sunulmuştur.', 40, y, { width: 515 });
            y += 30;
            doc.font(fontB).fontSize(9).fillColor('#c00000');
            doc.text('* Akredite ölçümler İŞ HİJYENİ (ORTAM ÖLÇÜMÜ) parametreleri ile yapılmaktadır.', 40, y, { width: 515 });
            doc.fillColor('black');

            // İmza alanı
            doc.font(fontN).fontSize(10);
            doc.text('Saygılarımızla,', 380, 620);
            doc.font(fontB).text(firma.yetkili || 'ABDULVAHAP ÖNDER', 380, 635);
            doc.font(fontN).fontSize(9).text(firma.yetkiliUnvan || 'Şirket Müdürü', 380, 650);

            if (fs.existsSync(MUHUR_PATH)) {
                doc.image(MUHUR_PATH, 380, 670, { width: 70 });
            }

            // Footer
            doc.font(fontN).fontSize(8).fillColor('#666');
            doc.text('FRM.01/Rev:09', 40, 800);
            doc.text(`Sayfa ${sayfaNo}`, 500, 800);
            doc.fillColor('black');

            // ========================================================
            // SAYFA 2 - HİZMET TABLOSU (SADECE SEÇİLENLER)
            // ========================================================
            doc.addPage();
            sayfaNo++;

            // Header
            if (fs.existsSync(LOGO_PATH)) {
                doc.image(LOGO_PATH, 40, 20, { width: 100 });
            }
            if (fs.existsSync(TURKAK_PATH)) {
                doc.image(TURKAK_PATH, 480, 20, { width: 60 });
            }
            doc.moveTo(40, 55).lineTo(555, 55).stroke();

            y = 65;

            // Sütun genişlikleri
            const cols = [180, 140, 40, 40, 55, 60]; // toplam 515
            const colX = [40, 220, 360, 400, 440, 495];

            // Kategorileri sırala ve yaz
            const sortedKategoriler = Object.entries(kategoriGruplari).sort((a, b) => a[1].sira - b[1].sira);

            if (sortedKategoriler.length === 0) {
                doc.font(fontN).fontSize(12).text('Henüz hizmet seçilmemiş.', 40, y);
            } else {
                sortedKategoriler.forEach(([katAd, katData], idx) => {
                    // Sayfa kontrolü
                    if (y > 700) {
                        doc.font(fontN).fontSize(8).fillColor('#666');
                        doc.text('FRM.01/Rev:09', 40, 800);
                        doc.text(`Sayfa ${sayfaNo}`, 500, 800);
                        doc.addPage();
                        sayfaNo++;
                        if (fs.existsSync(LOGO_PATH)) doc.image(LOGO_PATH, 40, 20, { width: 100 });
                        doc.moveTo(40, 55).lineTo(555, 55).stroke();
                        y = 65;
                    }

                    // Kategori başlığı
                    const isHijyen = katAd.toUpperCase().includes('HİJYEN');
                    doc.rect(40, y, 515, 18).fill(MAVI);
                    doc.font(fontB).fontSize(9).fillColor('white');
                    doc.text(`${idx + 1}. ${katAd}${isHijyen ? ' (AKREDİTE)' : ''}`, 45, y + 4);
                    doc.fillColor('black');
                    y += 18;

                    // Tablo header
                    doc.rect(40, y, 515, 16).fill(ACIK_MAVI).stroke('#333');
                    // Dikey çizgiler
                    colX.forEach((x, i) => {
                        if (i > 0) doc.moveTo(x, y).lineTo(x, y + 16).stroke('#666');
                    });

                    doc.font(fontB).fontSize(7).fillColor('black');
                    doc.text('Ölçüm/Kontrol Parametresi', colX[0] + 2, y + 4, { width: cols[0] - 4 });
                    doc.text(isHijyen ? 'Metod/Kapsam' : 'Standart', colX[1] + 2, y + 4, { width: cols[1] - 4 });
                    doc.text('Mik.', colX[2] + 2, y + 4, { width: cols[2] - 4, align: 'center' });
                    doc.text('Birim', colX[3] + 2, y + 4, { width: cols[3] - 4, align: 'center' });
                    doc.text('B.Fiyat', colX[4] + 2, y + 4, { width: cols[4] - 4, align: 'right' });
                    doc.text('Toplam', colX[5] + 2, y + 4, { width: cols[5] - 4, align: 'right' });
                    y += 16;

                    // Hizmet satırları
                    katData.detaylar.forEach(detay => {
                        if (y > 750) {
                            doc.font(fontN).fontSize(8).fillColor('#666');
                            doc.text('FRM.01/Rev:09', 40, 800);
                            doc.text(`Sayfa ${sayfaNo}`, 500, 800);
                            doc.addPage();
                            sayfaNo++;
                            if (fs.existsSync(LOGO_PATH)) doc.image(LOGO_PATH, 40, 20, { width: 100 });
                            doc.moveTo(40, 55).lineTo(555, 55).stroke();
                            y = 65;
                        }

                        const hizmet = detay.hizmet || {};
                        const miktar = detay.miktar || 0;
                        const birimFiyat = parseFloat(detay.birimFiyat) || 0;
                        const toplam = miktar * birimFiyat;
                        const metod = hizmet.metodKapsam || hizmet.standartYonetmelik || '';

                        const satirH = 14;

                        // Satır çerçevesi
                        doc.rect(40, y, 515, satirH).stroke('#333');
                        // Dikey çizgiler
                        colX.forEach((x, i) => {
                            if (i > 0) doc.moveTo(x, y).lineTo(x, y + satirH).stroke('#999');
                        });

                        doc.font(fontN).fontSize(7).fillColor('black');
                        doc.text((hizmet.ad || '').substring(0, 40), colX[0] + 2, y + 3, { width: cols[0] - 4 });
                        doc.text(metod.substring(0, 35), colX[1] + 2, y + 3, { width: cols[1] - 4 });
                        doc.text(String(miktar), colX[2] + 2, y + 3, { width: cols[2] - 4, align: 'center' });
                        doc.text(hizmet.birim || 'Adet', colX[3] + 2, y + 3, { width: cols[3] - 4, align: 'center' });
                        doc.text(formatPara(birimFiyat), colX[4] + 2, y + 3, { width: cols[4] - 4, align: 'right' });
                        doc.text(formatPara(toplam), colX[5] + 2, y + 3, { width: cols[5] - 4, align: 'right' });

                        y += satirH;
                    });

                    y += 10;
                });
            }

            // TOPLAM KUTUSU
            if (y > 650) {
                doc.font(fontN).fontSize(8).fillColor('#666');
                doc.text('FRM.01/Rev:09', 40, 800);
                doc.text(`Sayfa ${sayfaNo}`, 500, 800);
                doc.addPage();
                sayfaNo++;
                y = 60;
            }

            y += 20;
            const topX = 350;
            const topW = 205;
            const topH = 20;

            // Ara Toplam
            doc.rect(topX, y, topW, topH).stroke('#333');
            doc.font(fontN).fontSize(10).text('ARA TOPLAM:', topX + 5, y + 5);
            doc.font(fontB).text(formatPara(teklif.araToplam) + ' TL', topX + 100, y + 5, { width: 100, align: 'right' });
            y += topH;

            // İskonto
            if (parseFloat(teklif.iskontoOran) > 0) {
                doc.rect(topX, y, topW, topH).stroke('#333');
                doc.font(fontN).fontSize(10).text(`İSKONTO (%${teklif.iskontoOran}):`, topX + 5, y + 5);
                doc.font(fontB).fillColor('#c00000').text('-' + formatPara(teklif.iskontoTutar) + ' TL', topX + 100, y + 5, { width: 100, align: 'right' });
                doc.fillColor('black');
                y += topH;
            }

            // Toplam
            doc.rect(topX, y, topW, topH).stroke('#333');
            doc.font(fontN).fontSize(10).text('TOPLAM:', topX + 5, y + 5);
            doc.font(fontB).text(formatPara(teklif.toplamTutar) + ' TL', topX + 100, y + 5, { width: 100, align: 'right' });
            y += topH;

            // KDV
            doc.rect(topX, y, topW, topH).stroke('#333');
            doc.font(fontN).fontSize(10).text(`KDV (%${teklif.kdvOrani || 20}):`, topX + 5, y + 5);
            doc.font(fontB).text(formatPara(teklif.kdvTutar) + ' TL', topX + 100, y + 5, { width: 100, align: 'right' });
            y += topH;

            // Genel Toplam
            doc.rect(topX, y, topW, topH + 4).fill(SARI).stroke('#333');
            doc.font(fontB).fontSize(11).fillColor('black');
            doc.text('GENEL TOPLAM:', topX + 5, y + 6);
            doc.text(formatPara(teklif.genelToplam) + ' TL', topX + 90, y + 6, { width: 110, align: 'right' });

            // Footer
            doc.font(fontN).fontSize(8).fillColor('#666');
            doc.text('FRM.01/Rev:09', 40, 800);
            doc.text(`Sayfa ${sayfaNo}`, 500, 800);
            doc.fillColor('black');

            // ========================================================
            // SAYFA 3 - ŞARTLAR VE SÖZLEŞME ONAYI
            // ========================================================
            doc.addPage();
            sayfaNo++;

            // Header
            if (fs.existsSync(LOGO_PATH)) {
                doc.image(LOGO_PATH, 40, 20, { width: 100 });
            }
            doc.font(fontB).fontSize(12).fillColor(MAVI);
            doc.text('GENEL VE TİCARİ ŞARTLAR', 200, 30, { width: 250, align: 'center' });
            doc.fillColor('black');
            doc.moveTo(40, 55).lineTo(555, 55).stroke();

            y = 65;

            // 19 Madde
            MADDELER.forEach((madde, idx) => {
                doc.font(fontB).fontSize(7.5).text(`${idx + 1}) `, 40, y, { continued: true });
                doc.font(fontN).text(madde, { width: 510, align: 'justify' });
                y = doc.y + 3;
            });

            // SÖZLEŞME ONAYI - ŞARTLARIN ALTINDA
            y = Math.max(doc.y + 20, 600);

            doc.rect(40, y, 515, 22).fill(MAVI);
            doc.font(fontB).fontSize(11).fillColor('white');
            doc.text('SÖZLEŞME ONAYI', 45, y + 5, { width: 505, align: 'center' });
            doc.fillColor('black');
            y += 24;

            // İki kutu
            const boxW = 250;
            const boxH = 70;

            // Sol - Müşteri
            doc.rect(40, y, boxW, boxH).stroke('#333');
            doc.font(fontB).fontSize(10).text('MÜŞTERİ ONAYI', 40, y + 8, { width: boxW, align: 'center' });
            doc.font(fontN).fontSize(9).text('Kaşe / İmza', 40, y + 25, { width: boxW, align: 'center' });
            doc.text('Tarih: ___/___/______', 55, y + 55);

            // Sağ - Önder Muayene
            doc.rect(305, y, boxW, boxH).stroke('#333');
            doc.font(fontB).fontSize(10).text('ÖNDER MUAYENE ONAYI', 305, y + 8, { width: boxW, align: 'center' });
            if (fs.existsSync(MUHUR_PATH)) {
                doc.image(MUHUR_PATH, 350, y + 25, { width: 50 });
            }

            y += boxH + 15;

            // Onay checkboxları
            const checkTelefon = teklif.onayTelefon ? '☑' : '☐';
            const checkSahada = teklif.sahadaOnay ? '☑' : '☐';
            doc.font(fontB).fontSize(10).fillColor('#c00000');
            doc.text(`${checkTelefon} TELEFON İLE ONAYLANDI     ${checkSahada} SAHADA ONAYLANDI`, 40, y, { width: 515, align: 'center' });

            // Footer
            doc.font(fontN).fontSize(8).fillColor('#666');
            doc.text('FRM.01/Rev:09', 40, 800);
            doc.text(`Sayfa ${sayfaNo}`, 500, 800);

            doc.end();

        } catch (error) {
            console.error('PDF oluşturma hatası:', error);
            reject(error);
        }
    });
}

module.exports = {
    teklifPdfOlustur,
    MADDELER
};
