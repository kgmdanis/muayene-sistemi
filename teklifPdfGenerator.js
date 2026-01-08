const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Türkçe karakter desteği için font
const FONT_PATH = path.join(__dirname, 'fonts', 'DejaVuSans.ttf');
const FONT_BOLD_PATH = path.join(__dirname, 'fonts', 'DejaVuSans-Bold.ttf');

// Sabit firma bilgileri
const FIRMA = {
    unvan: 'ÖNDER MUAYENE TEST VE ÖLÇÜM LABORATUVARI MÜH. İNŞ.SAN. VE TİC. LTD. ŞTİ.',
    adres: 'Akabe Mahallesi Aslanlı Kışla Caddesi No:144S/1 Karatay/KONYA',
    telefon: '0332 300 00 20',
    web: 'www.ondermuayene.com.tr',
    email: 'info@ondermuayene.com.tr',
    banka: 'Ziraat Bankası / Buğday Pazarı / Konya',
    iban: 'TR80 0001 0025 2894 1001 5650 01'
};

// 19 Madde - Genel ve Ticari Şartlar
const SARTLAR = [
    'Ölçüm / Numune alma işleminin gerçekleştirileceği alan ile ilgili, çalışma alanının iş sağlığı ve güvenliği kurallarına uygun olarak hazırlanması, numune alınacak bacanın bünyesinde numune alma deliğinin açılmasından ve numune alma noktasına yetişmek için gerekli olan iş ekipmanının standartlara ve mevzuata uygun olması tarafınızca karşılanacaktır.',
    'Ölçüm / Numune Alma noktasının ve/veya platformun hazır olmaması nedeniyle ölçüm / numune alma işleminin gerçekleştirilememesi halinde sorumluluk tarafınıza ait olacaktır.',
    'Teklif onayı; Teklifin her sayfası incelenerek "sözleşme onayı" bölümü müşteri tarafından kaşe-imza ile onaylanarak fatura bilgileri eksiksiz şekilde doldurulmalıdır.',
    'Ücretin %50 si teklif onayı ile birlikte, kalanı ise raporların hazırlanıp tarafınıza bilgi verilmesini takiben ödenecektir.',
    'Tarafınızca onayı iletilmiş hizmet teklifi dahilinde numune alımı gerçekleştirilmiş durumlarda tazminat bedeli fatura edilecektir.',
    'Ölçüm / Numune alma esnasında başka bir kaynağın tespit edilmesi durumunda ilave ücretlendirme yapılacaktır.',
    'Rapor teslimi, ölçüm / numune alma / analiz tamamlandıktan sonra, 20 iş günü içerisinde tarafınıza gönderilecektir.',
    'Ölçüm/Analiz raporları, ödendi belgesinin tarafımıza iletilmesinden sonra 15 gün içerisinde teslim edilir.',
    'Ölçüm süresi parametre sayısına göre değişmektedir.',
    'Ölçüm/Analiz sonuçlarının uygun çıkmaması durumunda tekrar fatura edilir.',
    'Teklifte belirtilen hükümler, teklifin verildiği tarihten itibaren 1 ay süre için geçerlidir.',
    'Ulaşım ve konaklama giderleri firmamıza aittir.',
    'Müşteri tarafından verilecek bilgi ve belgeler gizlilik prensibine uygun işlenecektir.',
    'Bir ihtilaf söz konusu olduğunda ÖNDER MUAYENE deneye tanıklık etmeyi taahhüt eder.',
    'Bu teklif, karşılıklı onaylandıktan sonra sözleşme yerine geçer.',
    'Müşteri talebiyle deney sonuçlarında hiçbir şekilde değişiklik yapılmayacaktır.',
    'Bu anlaşma kapsamındaki her türlü ihtilaf durumunda Konya Mahkemeleri yetkilidir.',
    'Onay için Teklifin son sayfasını onaylayarak firma yetkililerimize iletebilirsiniz. Tel: 0332 300 00 20',
    'Banka Hesap Bilgilerimiz: Önder Muayene Test ve Ölçüm - Ziraat Bankası / Buğday Pazarı / Konya / TR80 0001 0025 2894 1001 5650 01'
];

// Para formatı
function formatPara(deger) {
    const sayi = parseFloat(deger) || 0;
    return sayi.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Tarih formatı - DD.MM.YYYY
function formatTarih(tarih) {
    const d = tarih ? new Date(tarih) : new Date();
    if (isNaN(d.getTime())) return new Date().toLocaleDateString('tr-TR');
    const gun = String(d.getDate()).padStart(2, '0');
    const ay = String(d.getMonth() + 1).padStart(2, '0');
    const yil = d.getFullYear();
    return `${gun}.${ay}.${yil}`;
}

/**
 * Teklif PDF oluştur
 * @param {Object} teklif - Teklif verisi
 * @param {Array} tumKategoriler - Tüm kategoriler (opsiyonel)
 */
async function teklifPdfOlustur(teklif, tumKategoriler = []) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({
                size: 'A4',
                margins: { top: 40, bottom: 40, left: 40, right: 40 }
            });

            const buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => resolve(Buffer.concat(buffers)));
            doc.on('error', reject);

            // Font ayarları - Türkçe karakter desteği
            const hasCustomFont = fs.existsSync(FONT_PATH);
            let fontNormal = 'Helvetica';
            let fontBold = 'Helvetica-Bold';
            
            if (hasCustomFont) {
                doc.registerFont('Normal', FONT_PATH);
                doc.registerFont('Bold', fs.existsSync(FONT_BOLD_PATH) ? FONT_BOLD_PATH : FONT_PATH);
                fontNormal = 'Normal';
                fontBold = 'Bold';
            }

            const customer = teklif.customer || {};
            // SADECE miktar > 0 olan hizmetleri göster
            const detaylar = (teklif.detaylar || []).filter(d => d.miktar > 0);

            // Renkler
            const MAVI = '#006699';
            const ACIK_MAVI = '#e6f3ff';

            // Logo yolları
            const logoPath = path.join(__dirname, 'public', 'images', 'logo.png');
            const turkakPath = path.join(__dirname, 'public', 'images', 'türkak-logo.png');
            const muhurPath = path.join(__dirname, 'public', 'images', 'mühür.jpg');

            // ==================== SAYFA 1 - KAPAK ====================

            // Logo - Sol üst (büyük)
            if (fs.existsSync(logoPath)) {
                doc.image(logoPath, 40, 20, { width: 180 });
            } else {
                doc.fontSize(18).font(fontBold).text('ÖNDER MUAYENE', 40, 30);
            }

            // TÜRKAK Logo - Sağ üst
            if (fs.existsSync(turkakPath)) {
                doc.image(turkakPath, 480, 25, { width: 70 });
            }

            // Firma bilgileri - Sağ üst
            doc.fontSize(7).font(fontNormal);
            doc.text(FIRMA.unvan, 240, 20, { width: 230, align: 'right' });
            doc.text(FIRMA.adres, 240, 34, { width: 230, align: 'right' });
            doc.text('Tel-Fax: ' + FIRMA.telefon + '   ' + FIRMA.web, 240, 48, { width: 230, align: 'right' });

            // Başlık
            doc.fontSize(14).font(fontBold).fillColor(MAVI);
            doc.text('TEST VE ÖLÇÜM TALEP TEKLİF FORMU', 40, 100, { align: 'center', width: 515 });
            doc.fillColor('black');

            // Firma Bilgileri Tablosu
            let y = 130;
            
            // Başlık satırı
            doc.fillColor('white').rect(40, y, 515, 20).fill(MAVI);
            doc.fillColor('white').fontSize(10).font(fontBold);
            doc.text('FİRMA BİLGİLERİ', 45, y + 5);
            y += 20;

            // Tablo satırları
            const satirYuksekligi = 20;
            doc.fillColor('black').font(fontNormal).fontSize(9);

            // Satır 1
            doc.rect(40, y, 515, satirYuksekligi).stroke();
            doc.rect(40, y, 120, satirYuksekligi).stroke();
            doc.rect(280, y, 80, satirYuksekligi).stroke();
            doc.font(fontBold).text('TEKLİF TARİHİ', 45, y + 5);
            doc.font(fontNormal).text(formatTarih(teklif.teklifTarihi || teklif.createdAt), 165, y + 5);
            doc.font(fontBold).text('FİRMA YETKİLİSİ', 285, y + 5);
            doc.font(fontNormal).text(customer.yetkili || '-', 380, y + 5);
            y += satirYuksekligi;

            // Satır 2
            doc.rect(40, y, 515, satirYuksekligi).stroke();
            doc.rect(40, y, 120, satirYuksekligi).stroke();
            doc.rect(280, y, 80, satirYuksekligi).stroke();
            doc.font(fontBold).text('TEKLİF NO', 45, y + 5);
            doc.font(fontNormal).text(teklif.teklifNo || '-', 165, y + 5);
            doc.font(fontBold).text('TEL/FAX', 285, y + 5);
            doc.font(fontNormal).text(customer.telefon || '-', 380, y + 5);
            y += satirYuksekligi;

            // Satır 3
            doc.rect(40, y, 515, satirYuksekligi).stroke();
            doc.rect(40, y, 120, satirYuksekligi).stroke();
            doc.rect(280, y, 80, satirYuksekligi).stroke();
            doc.font(fontBold).text('FİRMA ADI', 45, y + 5);
            doc.font(fontNormal).text((customer.unvan || '-').substring(0, 25), 165, y + 5);
            doc.font(fontBold).text('E-Mail', 285, y + 5);
            doc.font(fontNormal).text(customer.email || '-', 380, y + 5);
            y += satirYuksekligi;

            // Satır 4
            doc.rect(40, y, 515, satirYuksekligi).stroke();
            doc.rect(40, y, 120, satirYuksekligi).stroke();
            doc.rect(280, y, 80, satirYuksekligi).stroke();
            doc.font(fontBold).text('FİRMA ADRESİ', 45, y + 5);
            doc.font(fontNormal).text((customer.adres || '-').substring(0, 25), 165, y + 5);
            doc.font(fontBold).text('KONU', 285, y + 5);
            doc.font(fontNormal).fontSize(7).text('PERİYODİK KONTROL VE İŞ HİJYENİ ÖLÇÜM', 380, y + 3, { width: 170 });
            y += satirYuksekligi + 15;

            // Açıklama metni
            doc.fontSize(10).font(fontBold);
            doc.text('Sayın Firma Yetkilisi;', 40, y);
            y += 18;

            doc.font(fontNormal).fontSize(9);
            doc.text('Tarafımızdan talep etmiş olduğunuz ölçümlere ait fiyat teklifimiz ve ölçümlerde kullanılacak metotlar ekte bilginize sunulmuştur.', 40, y, { width: 515, align: 'justify' });
            y += 25;
            doc.text('Firmamıza göstermiş olduğunuz ilgi ve güvene teşekkür eder, teklifimizin uygun bulunacağını umar, iyi çalışmalar dileriz.', 40, y, { width: 515, align: 'justify' });
            y += 25;
            doc.text('Akredite kapsamında yapılan ölçümler, İŞ HİJYENİ (ORTAM ÖLÇÜMÜ) parametreleri ile yapılan ölçümlerdir.', 40, y, { width: 515, align: 'justify' });
            y += 35;

            // ==================== HİZMET TABLOLARI ====================

            // Kategorilere göre grupla
            const kategoriler = {};
            detaylar.forEach(d => {
                const katAd = d.hizmet?.kategori?.ad || 'DİĞER';
                const katSira = d.hizmet?.kategori?.sira || 99;
                if (!kategoriler[katAd]) {
                    kategoriler[katAd] = { sira: katSira, hizmetler: [] };
                }
                kategoriler[katAd].hizmetler.push(d);
            });

            // Sırala
            const siraliKategoriler = Object.entries(kategoriler).sort((a, b) => a[1].sira - b[1].sira);

            // Sütun genişlikleri
            const col = [40, 180, 330, 380, 430, 480, 555]; // x pozisyonları
            const colW = [140, 150, 50, 50, 50, 75]; // genişlikler

            siraliKategoriler.forEach(([katAd, katData]) => {
                // Sayfa kontrolü
                if (y > 680) {
                    doc.addPage();
                    y = 50;
                }

                // Kategori başlığı
                doc.fillColor('white').rect(40, y, 515, 18).fill(MAVI);
                doc.fillColor('white').fontSize(9).font(fontBold);
                doc.text(katAd, 45, y + 4);
                y += 18;

                // Tablo header
                doc.fillColor('black').rect(40, y, 515, 15).fill(ACIK_MAVI);
                doc.fillColor('black').fontSize(7).font(fontBold);
                doc.text('Ölçüm Parametresi', col[0] + 2, y + 4, { width: colW[0] });
                doc.text('Metod/Kapsam/Açıklama', col[1] + 2, y + 4, { width: colW[1] });
                doc.text('Miktar', col[2] + 2, y + 4, { width: colW[2] });
                doc.text('Birim', col[3] + 2, y + 4, { width: colW[3] });
                doc.text('Birim Fiyat', col[4] + 2, y + 4, { width: colW[4] });
                doc.text('Fiyat', col[5] + 2, y + 4, { width: colW[5] });
                
                // Header kenarlıkları
                doc.rect(col[0], y, colW[0], 15).stroke();
                doc.rect(col[1], y, colW[1], 15).stroke();
                doc.rect(col[2], y, colW[2], 15).stroke();
                doc.rect(col[3], y, colW[3], 15).stroke();
                doc.rect(col[4], y, colW[4], 15).stroke();
                doc.rect(col[5], y, colW[5], 15).stroke();
                y += 15;

                // Hizmet satırları
                katData.hizmetler.forEach(detay => {
                    if (y > 750) {
                        doc.addPage();
                        y = 50;
                    }

                    const hizmet = detay.hizmet || {};
                    const miktar = detay.miktar || 0;
                    const birimFiyat = parseFloat(detay.birimFiyat) || 0;
                    const fiyat = miktar * birimFiyat;
                    const metod = hizmet.metodKapsam || hizmet.standartYonetmelik || '';

                    const satirH = 18;
                    doc.font(fontNormal).fontSize(7).fillColor('black');
                    
                    // Hücre içerikleri
                    doc.text((hizmet.ad || '').substring(0, 30), col[0] + 2, y + 4, { width: colW[0] - 4 });
                    doc.text(metod.substring(0, 35), col[1] + 2, y + 4, { width: colW[1] - 4 });
                    doc.text(miktar.toString(), col[2] + 2, y + 4, { width: colW[2] - 4 });
                    doc.text(hizmet.birim || 'Adet', col[3] + 2, y + 4, { width: colW[3] - 4 });
                    doc.text(formatPara(birimFiyat), col[4] + 2, y + 4, { width: colW[4] - 4 });
                    doc.text(formatPara(fiyat), col[5] + 2, y + 4, { width: colW[5] - 4 });

                    // Hücre kenarlıkları
                    doc.rect(col[0], y, colW[0], satirH).stroke();
                    doc.rect(col[1], y, colW[1], satirH).stroke();
                    doc.rect(col[2], y, colW[2], satirH).stroke();
                    doc.rect(col[3], y, colW[3], satirH).stroke();
                    doc.rect(col[4], y, colW[4], satirH).stroke();
                    doc.rect(col[5], y, colW[5], satirH).stroke();

                    y += satirH;
                });

                y += 10;
            });

            // ==================== TOPLAM BÖLÜMÜ ====================

            if (y > 650) {
                doc.addPage();
                y = 50;
            }

            y += 10;
            const toplamX = 380;

            // Ara toplam hesapla
            let araToplam = 0;
            detaylar.forEach(d => {
                araToplam += (d.miktar || 0) * (parseFloat(d.birimFiyat) || 0);
            });

            const iskontoTutar = parseFloat(teklif.iskontoTutar) || 0;
            const toplam = araToplam - iskontoTutar;
            const kdvTutar = toplam * 0.20;
            const genelToplam = toplam + kdvTutar;

            doc.fontSize(9).font(fontBold);

            // Ara Toplam
            doc.rect(toplamX, y, 175, 18).stroke();
            doc.text('ARA TOPLAM:', toplamX + 5, y + 4);
            doc.text(formatPara(araToplam) + ' TL', toplamX + 90, y + 4, { width: 80, align: 'right' });
            y += 18;

            // KDV
            doc.rect(toplamX, y, 175, 18).stroke();
            doc.text('KDV (%20):', toplamX + 5, y + 4);
            doc.text(formatPara(kdvTutar) + ' TL', toplamX + 90, y + 4, { width: 80, align: 'right' });
            y += 18;

            // Genel Toplam (sarı arka plan)
            doc.rect(toplamX, y, 175, 20).fillAndStroke('#ffff00', 'black');
            doc.fillColor('black').fontSize(10).font(fontBold);
            doc.text('GENEL TOPLAM:', toplamX + 5, y + 5);
            doc.text(formatPara(genelToplam) + ' TL', toplamX + 80, y + 5, { width: 90, align: 'right' });
            y += 35;

            // ==================== SÖZLEŞME ONAYI ====================

            if (y > 620) {
                doc.addPage();
                y = 50;
            }

            // Başlık
            doc.fillColor('white').rect(40, y, 515, 20).fill(MAVI);
            doc.fillColor('white').fontSize(10).font(fontBold);
            doc.text('SÖZLEŞME ONAYI', 40, y + 5, { align: 'center', width: 515 });
            y += 20;

            // İki sütun
            doc.fillColor('black');
            doc.rect(40, y, 257, 60).stroke();
            doc.rect(297, y, 258, 60).stroke();

            doc.fontSize(9).font(fontBold);
            doc.text('FİRMA ONAYI (KAŞE / İMZA)', 50, y + 8);
            doc.text('ÖNDER MUAYENE ONAYI', 310, y + 8);

            // Mühür
            if (fs.existsSync(muhurPath)) {
                doc.image(muhurPath, 420, y + 15, { width: 45 });
            }

            y += 70;

            // Onay checkboxları
            doc.fontSize(9).font(fontBold).fillColor('red');
            const checkTelefon = teklif.onayTelefon ? '☑' : '☐';
            const checkSahada = teklif.sahadaOnay ? '☑' : '☐';
            doc.text(checkTelefon + ' ONAY TELEFON İLE ALINMIŞTIR.', 40, y);
            y += 15;
            doc.text(checkSahada + ' SAHADA ONAYLANDI.', 40, y);

            // ==================== SAYFA 2 - ŞARTLAR ====================

            doc.addPage();

            // Header
            if (fs.existsSync(logoPath)) {
                doc.image(logoPath, 40, 20, { width: 100 });
            }
            doc.fontSize(7).font(fontNormal).fillColor('black');
            doc.text(FIRMA.unvan, 300, 20, { width: 250, align: 'right' });
            doc.text(FIRMA.adres, 300, 32, { width: 250, align: 'right' });

            // Başlık
            doc.fillColor(MAVI).fontSize(12).font(fontBold);
            doc.text('GENEL VE TİCARİ ŞARTLAR', 40, 70, { align: 'center', width: 515 });
            doc.fillColor('black');

            y = 95;
            doc.font(fontNormal).fontSize(8);

            SARTLAR.forEach((sart, idx) => {
                if (y > 750) {
                    doc.addPage();
                    y = 50;
                }
                doc.text((idx + 1) + ') ' + sart, 40, y, { width: 515, align: 'justify' });
                y += 28;
            });

            doc.end();

        } catch (error) {
            reject(error);
        }
    });
}

/**
 * PDF'i dosyaya kaydet
 */
async function teklifPdfKaydet(teklif, outputPath) {
    const buffer = await teklifPdfOlustur(teklif);
    fs.writeFileSync(outputPath, buffer);
    return outputPath;
}

module.exports = {
    teklifPdfOlustur,
    teklifPdfKaydet
};