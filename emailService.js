/**
 * Email Gönderim Servisi
 * Teklif PDF'lerini müşterilere gönderir
 */

const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

// Font yolları
const FONT_REGULAR = path.join(__dirname, 'fonts', 'DejaVuSans.ttf');
const FONT_BOLD = path.join(__dirname, 'fonts', 'DejaVuSans-Bold.ttf');

// 19 Maddelik Genel ve Ticari Şartlar
const GENEL_SARTLAR = `GENEL VE TİCARİ ŞARTLAR

1) Ölçüm / Numune alma işleminin gerçekleştirileceği alan ile ilgili, çalışma alanının iş sağlığı ve güvenliği kurallarına uygun olarak hazırlanması, numune alınacak bacanın bünyesinde numune alma deliğinin açılmasından ve numune alma noktasına yetişmek için gerekli olan iş ekipmanının standartlara ve mevzuata uygun olması tarafınızca karşılanacaktır. Firmanız bünyesinde ölçüm / numune alma işlemi için kişisel iş güvenliği malzemeleri laboratuvarımız sorumluluğundadır.

2) Ölçüm / Numune Alma noktasının ve/veya platformun hazır olmaması nedeniyle ölçüm / numune alma işleminin gerçekleştirilememesi halinde sorumluluk tarafınıza ait olacaktır.

3) Teklif onayı; Teklifin her sayfası incelenerek "sözleşme onayı" bölümü müşteri tarafından kaşe-imza ile onaylanarak fatura bilgileri eksiksiz şekilde doldurulmalıdır. Onaylı teklifin tarafımıza ulaşması itibari ile planlama ve/veya ölçüm/numune alma sürecine başlanacaktır. Onay aşamasından sonra ölçüm/numune alma tarihi ile ilgili müşteri tarafından istenen bir tarih var ise önceden tarafımıza bildirmesi gerekmektedir. Karşılıklı mutabık kalınan ölçüm/numune alma tarihlerinde herhangi bir değişiklik talebiniz olacak ise ölçüm/numune alma tarihinden iki hafta önce tarafımıza bildirim yapılması gerekmektedir.

4) Ücretin %50 si teklif onayı ile birlikte, kalanı ise raporların hazırlanıp tarafınıza bilgi verilmesini takiben ödenecektir. Ölçüm/numune alma / analiz işlemleri tarafınızca sonlandırıldığında teklif onayında alınan ücret iade edilmeyecektir.

5) Tarafınızca onayı iletilmiş hizmet teklifi dahilinde numune alımı gerçekleştirilmiş, resmi kurumlardan ölçüm tarihi alınmış/örneklemesi yapılmış, analize başlanmış veya belirtilen aşamalardan herhangi biri ya da birkaçının gerçekleştiği durumlarda hizmet alımınız tarafınızca sonlandırıldığında; hali hazırda gerçekleştirilmiş işlem için yapılan işlem tutarı kadar tazminat bedeli fatura edilecektir. İşin iptali için yalnızca yazılı olarak talep gelmesi durumunda iptal işlemi uygulanacaktır. Hizmet alımınız bizim tarafımızdan sonlandırıldığında; teklif onayında alınan ücretin tamamı iade edilecektir.

6) Ölçüm / Numune alma esnasında başka bir kaynağın/parametrenin tespit edilmesi durumunda ölçüm/numune alma/analiz gerçekleştirilecek olup belirtilen birim fiyata göre ilave ücretlendirme yapılacaktır.

7) Rapor teslimi, ölçüm / numune alma / analiz tamamlandıktan sonra, 20 iş günü içerisinde tarafınıza gönderilecektir.

8) Ölçüm/Analiz raporları, ölçümlerin tamamlanmasını takiben sözleşmede belirtilen ücretin "ödendi belgesi"nin tarafımıza iletilmesinden sonra 15 gün içerisinde (1) nüsha halinde teslim edilir. Bunun dışında ilave ölçüm/analiz raporu ekstra ücretlendirilecektir.

9) Ölçüm süresi parametre sayısına göre değişmektedir. Ölçüm birim süreleri Toz: 2 saat, Ortam Gürültü: 15 dk, Kişisel Gürültü seçilecek metoda göre: 15 dk-5 gün, Anlık Gaz: 5 dk, Aydınlatma: 2 dk, Termal Konfor: 1-2 saat şeklindedir. Raporlarda sunulan ölçüm/analiz sonuçlarına itiraz süresi rapor tarihi itibari ile en fazla 15 gündür. Analiz numuneleri, raporun teslim tarihinden itibaren ilgili standarda uygun olduğu süre dikkate alınarak en fazla iki hafta süre ile saklanacak, bu sürenin bitiminde imha edilecektir. Bu süreden sonraki itirazlar değerlendirmeye alınmayacaktır.

10) Ölçüm/Analiz sonuçlarının uygun çıkmaması ve tarafınızdan kaynaklanacak sebeplerden ötürü ölçüm/numune alma/analiz işlemlerinin tekrarlanması durumunda gerçekleştirilecek ölçüm/numune alma/analiz işlemi sözleşmede belirtilen birim fiyat üzerinden tekrar fatura edilir.

11) Teklifte belirtilen hükümler, teklifin verildiği tarihten itibaren 1 ay süre için geçerlidir. 1 ayı geçen durumlarda teklif revize edilecektir.

12) Ulaşım ve konaklama giderleri firmamıza aittir. Ancak tarafınızdan kaynaklanan sebeplerden ötürü gidiş-geliş ulaşım ve konaklama giderleri tarafınıza fatura edilecektir.

13) Müşteri tarafından verilecek bilgi ve belgeler ile tarafımızca hazırlanan sonuç raporu 3. şahıslar ile kesinlikle paylaşılmayacak ve gizlilik prensibine uygun işleyiş sürdürülecektir. Kanunen zorunlu olduğu durumlarda müşteri bilgilendirilir.

14) Bir ihtilaf söz konusu olduğunda ÖNDER MUAYENE, Müşteri/Firma Temsilcisinin deneye tanıklık etmesini taahhüt eder. Böyle bir durumda Müşteri/Firma Temsilcisi ÖNDER MUAYENE'nin müsaade ettiği alanlar içerisinde deneye tanıklık edebilir.

15) Bu teklif, karşılıklı onaylandıktan sonra sözleşme yerine geçer. Periyodik hizmetler için yıllık sözleşme yapılacak olup, hizmetin periyodik olarak yapılacağı işveren tarafından bildirilecektir.

16) Müşteri talebiyle deney sonuçlarında hiçbir şekilde değişiklik yapılmayacaktır.

17) Bu anlaşma kapsamındaki her türlü ihtilaf durumunda Konya Mahkemeleri yetkilidir.

18) Onay için Teklifin son sayfasını onaylayarak firma yetkililerimize; Elden teslim edebilir, 0332 300 00 20 numaralı faksa gönderebilir veya info@ondermuayene.com.tr elektronik posta adresine ulaştırabilirsiniz.

19) Banka Hesap Bilgilerimiz;
    Önder Muayene Test ve Ölçüm
    Ziraat Bankası / Buğday Pazarı / Konya
    TR80 0001 0025 2894 1001 5650 01`;

/**
 * Para formatı
 */
function formatMoney(amount) {
    const num = parseFloat(amount) || 0;
    return num.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Email transporter oluştur
 */
function createTransporter(config) {
    return nodemailer.createTransport({
        host: config.host || 'smtp.gmail.com',
        port: config.port || 587,
        secure: config.secure || false,
        auth: {
            user: config.user,
            pass: config.pass
        }
    });
}

/**
 * Teklif PDF'ini buffer olarak oluştur
 */
async function createTeklifPDFBuffer(teklif) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        const doc = new PDFDocument({
            size: 'A4',
            margins: { top: 40, bottom: 40, left: 40, right: 40 },
            bufferPages: true
        });

        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Türkçe font kaydet
        if (fs.existsSync(FONT_REGULAR)) {
            doc.registerFont('Turkish', FONT_REGULAR);
            doc.registerFont('TurkishBold', FONT_BOLD);
        }

        const useFont = fs.existsSync(FONT_REGULAR) ? 'Turkish' : 'Helvetica';
        const useFontBold = fs.existsSync(FONT_BOLD) ? 'TurkishBold' : 'Helvetica-Bold';

        const pageWidth = doc.page.width - 80;
        const tableLeft = 40;
        const formatDate = (date) => new Date(date).toLocaleDateString('tr-TR');

        // ===== SAYFA 1: TEKLİF =====

        // LOGO (varsa)
        const logoPath = path.join(__dirname, 'public', 'images', 'logo.png');
        if (fs.existsSync(logoPath)) {
            try {
                doc.image(logoPath, 40, 25, { width: 60 });
            } catch (e) {}
        }

        // BAŞLIK
        doc.fontSize(14).font(useFontBold)
            .text(teklif.tenant?.name || 'ÖNDER MUAYENE', 110, 30);
        doc.fontSize(8).font(useFont)
            .text(teklif.tenant?.adres || '', 110, 48, { width: 300 });
        doc.text('Tel: ' + (teklif.tenant?.telefon || '') + ' | E-mail: ' + (teklif.tenant?.email || ''), 110, 60);

        // FİRMA BİLGİLERİ KUTUSU
        let y = 85;
        doc.rect(tableLeft, y, pageWidth, 90).stroke();

        // Başlık
        doc.rect(tableLeft, y, pageWidth, 18).fillAndStroke('#d9e2f3', '#000');
        doc.fillColor('#000').fontSize(10).font(useFontBold).text('FİRMA BİLGİLERİ', tableLeft + 5, y + 4);
        y += 18;

        // Bilgi satırları
        const bilgiSol = [
            ['TEKLİF TARİHİ', formatDate(teklif.tarih)],
            ['TEKLİF NO', teklif.teklifNo],
            ['FİRMA ADI', teklif.customer?.unvan || ''],
            ['FİRMA ADRESİ', teklif.customer?.adres || '']
        ];
        const bilgiSag = [
            ['FİRMA YETKİLİSİ', teklif.customer?.yetkili || '-'],
            ['TEL/FAX', teklif.customer?.telefon || '-'],
            ['E-Mail', teklif.customer?.email || '-'],
            ['KONU', 'PERİYODİK KONTROL VE İŞ HİJYENİ ÖLÇÜM']
        ];

        doc.fontSize(8);
        for (let i = 0; i < 4; i++) {
            const rowY = y + (i * 17);
            doc.font(useFontBold).text(bilgiSol[i][0], tableLeft + 5, rowY + 3);
            doc.font(useFont).text(bilgiSol[i][1], tableLeft + 85, rowY + 3, { width: 150 });
            doc.font(useFontBold).text(bilgiSag[i][0], tableLeft + 270, rowY + 3);
            doc.font(useFont).text(bilgiSag[i][1], tableLeft + 350, rowY + 3, { width: 160 });
        }
        y += 75;

        // ÜST YAZI
        const ustYazi = `Sayın Firma Yetkilisi;

Tarafımızdan talep etmiş olduğunuz ölçümlere ait fiyat teklifimiz ve ölçümlerde kullanılacak metotlar ekte bilginize sunulmuştur.

Firmamıza göstermiş olduğunuz ilgi ve güvene teşekkür eder, teklifimizin uygun bulunacağını umar, iyi çalışmalar dileriz.

Akredite kapsamında yapılan ölçümler, İŞ HİJYENİ (ORTAM ÖLÇÜMÜ) parametreleri ile yapılan ölçümlerdir.`;

        doc.fontSize(8).font(useFont).text(ustYazi, tableLeft + 5, y, { width: pageWidth - 10 });
        y = doc.y + 15;

        // HİZMETLER TABLOSU
        const groupedDetails = {};
        for (const detay of teklif.detaylar) {
            const kat = detay.hizmet?.kategori?.ad || 'DİĞER KONTROLLER';
            if (!groupedDetails[kat]) groupedDetails[kat] = [];
            groupedDetails[kat].push(detay);
        }

        const col1 = 150, col2 = 160, col3 = 35, col4 = 40, col5 = 55, col6 = 55;

        for (const [kat, detaylar] of Object.entries(groupedDetails)) {
            if (y > 720) { doc.addPage(); y = 40; }

            // Kategori başlığı
            doc.rect(tableLeft, y, pageWidth, 16).fillAndStroke('#1a5f7a', '#000');
            doc.fillColor('#fff').fontSize(9).font(useFontBold).text(kat, tableLeft + 5, y + 3);
            y += 16;

            // Tablo başlıkları
            doc.rect(tableLeft, y, pageWidth, 14).fillAndStroke('#e7e6e6', '#000');
            doc.fillColor('#000').fontSize(7).font(useFontBold);
            doc.text('Ölçüm Parametresi', tableLeft + 2, y + 3, { width: col1 });
            doc.text('Metod/Kapsam/Açıklama', tableLeft + col1 + 2, y + 3, { width: col2 });
            doc.text('Miktar', tableLeft + col1 + col2 + 2, y + 3, { width: col3, align: 'center' });
            doc.text('Birim', tableLeft + col1 + col2 + col3 + 2, y + 3, { width: col4, align: 'center' });
            doc.text('Birim Fiyat', tableLeft + col1 + col2 + col3 + col4 + 2, y + 3, { width: col5, align: 'right' });
            doc.text('Fiyat', tableLeft + col1 + col2 + col3 + col4 + col5 + 2, y + 3, { width: col6, align: 'right' });
            y += 14;

            // Satırlar
            for (const detay of detaylar) {
                if (y > 750) { doc.addPage(); y = 40; }

                const rowH = 18;
                doc.rect(tableLeft, y, pageWidth, rowH).stroke();
                doc.fontSize(7).font(useFont).fillColor('#000');
                doc.text(detay.hizmet?.ad || '', tableLeft + 2, y + 4, { width: col1 - 4 });

                const aciklama = (detay.hizmet?.aciklama || '').substring(0, 70);
                doc.fontSize(6).text(aciklama, tableLeft + col1 + 2, y + 4, { width: col2 - 4 });

                doc.fontSize(7);
                doc.text(detay.miktar.toString(), tableLeft + col1 + col2 + 2, y + 4, { width: col3, align: 'center' });
                doc.text(detay.hizmet?.birim || 'Adet', tableLeft + col1 + col2 + col3 + 2, y + 4, { width: col4, align: 'center' });
                doc.text(formatMoney(detay.birimFiyat), tableLeft + col1 + col2 + col3 + col4 + 2, y + 4, { width: col5, align: 'right' });
                doc.text(formatMoney(detay.toplam), tableLeft + col1 + col2 + col3 + col4 + col5 + 2, y + 4, { width: col6, align: 'right' });
                y += rowH;
            }
            y += 5;
        }

        // TOPLAM KUTUSU
        y += 10;
        if (y > 700) { doc.addPage(); y = 40; }

        const totX = tableLeft + pageWidth - 180;
        doc.rect(totX, y, 180, 55).stroke();

        doc.fontSize(9).font(useFontBold).fillColor('#000');
        doc.text('ARA TOPLAM:', totX + 10, y + 8);
        doc.font(useFont).text(formatMoney(teklif.toplamTutar) + ' TL', totX + 95, y + 8, { width: 75, align: 'right' });

        doc.font(useFontBold).text('KDV (%' + teklif.kdvOrani + '):', totX + 10, y + 22);
        doc.font(useFont).text(formatMoney(teklif.kdvTutar) + ' TL', totX + 95, y + 22, { width: 75, align: 'right' });

        doc.rect(totX, y + 35, 180, 20).fillAndStroke('#1a5f7a', '#000');
        doc.fontSize(10).font(useFontBold).fillColor('#fff');
        doc.text('GENEL TOPLAM:', totX + 10, y + 40);
        doc.text(formatMoney(teklif.genelToplam) + ' TL', totX + 95, y + 40, { width: 75, align: 'right' });

        y += 70;

        // SÖZLEŞME ONAYI
        if (y > 680) { doc.addPage(); y = 40; }

        doc.rect(tableLeft, y, pageWidth, 70).stroke();
        doc.rect(tableLeft, y, pageWidth, 18).fillAndStroke('#d9e2f3', '#000');
        doc.fillColor('#000').fontSize(10).font(useFontBold).text('SÖZLEŞME ONAYI', tableLeft + pageWidth/2 - 40, y + 4);

        const half = pageWidth / 2;
        doc.moveTo(tableLeft + half, y + 18).lineTo(tableLeft + half, y + 70).stroke();

        doc.fontSize(8).font(useFontBold);
        doc.text('FİRMA ONAYI (KAŞE / İMZA)', tableLeft + 10, y + 28);
        doc.text((teklif.tenant?.name || 'ÖNDER MUAYENE') + ' ONAYI', tableLeft + half + 10, y + 28);

        // İmza (varsa)
        const imzaPath = path.join(__dirname, 'public', 'images', 'imza.png');
        if (fs.existsSync(imzaPath)) {
            try {
                doc.image(imzaPath, tableLeft + half + 80, y + 35, { width: 60 });
            } catch (e) {}
        }

        doc.fontSize(7).font(useFont);
        doc.text(teklif.tenant?.yetkili || '', tableLeft + half + 10, y + 50);
        doc.text(teklif.tenant?.yetkiliUnvan || '', tableLeft + half + 10, y + 58);

        // ===== SAYFA 2: GENEL ŞARTLAR =====
        doc.addPage();
        y = 40;

        doc.fontSize(11).font(useFontBold).fillColor('#1a5f7a')
            .text('GENEL VE TİCARİ ŞARTLAR', tableLeft, y, { align: 'center', width: pageWidth });
        y += 25;

        // Şartları satır satır yaz
        const sartlar = GENEL_SARTLAR.split('\n\n').slice(1); // İlk satır başlık
        doc.fontSize(7).font(useFont).fillColor('#000');

        for (const sart of sartlar) {
            if (y > 750) { doc.addPage(); y = 40; }

            const height = doc.heightOfString(sart, { width: pageWidth - 10 });
            doc.text(sart, tableLeft + 5, y, { width: pageWidth - 10, align: 'justify' });
            y = doc.y + 6;
        }

        // Sayfa numaraları
        const pages = doc.bufferedPageRange();
        for (let i = 0; i < pages.count; i++) {
            doc.switchToPage(i);
            doc.fontSize(7).font(useFont).fillColor('#666')
                .text('Sayfa ' + (i + 1) + ' / ' + pages.count,
                    tableLeft, doc.page.height - 25,
                    { align: 'right', width: pageWidth });
        }

        doc.end();
    });
}

/**
 * Teklifi müşteriye email olarak gönder
 */
async function sendTeklifEmail(teklif, smtpConfig, customMessage = '') {
    const transporter = createTransporter(smtpConfig);
    const pdfBuffer = await createTeklifPDFBuffer(teklif);
    const formatDate = (date) => new Date(date).toLocaleDateString('tr-TR');

    const htmlContent = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
body{font-family:Arial,sans-serif;line-height:1.6;color:#333}
.header{background:#1a5f7a;color:white;padding:20px;text-align:center}
.content{padding:20px}
.info-box{background:#f5f5f5;padding:15px;border-radius:5px;margin:15px 0}
.footer{background:#333;color:white;padding:15px;text-align:center;font-size:12px}
table{width:100%;border-collapse:collapse;margin:15px 0}
th,td{border:1px solid #ddd;padding:10px;text-align:left}
th{background:#1a5f7a;color:white}
.total{font-weight:bold;font-size:18px;color:#1a5f7a}
</style></head>
<body>
<div class="header">
    <h1>${teklif.tenant?.name || 'ÖNDER MUAYENE'}</h1>
    <p>Periyodik Kontrol ve Muayene Hizmetleri</p>
</div>
<div class="content">
    <p>Sayın <strong>${teklif.customer?.yetkili || 'Yetkili'}</strong>,</p>
    <p>Tarafınızdan talep edilen periyodik kontrol ve muayene hizmetlerine ilişkin fiyat teklifimiz ekte sunulmuştur.</p>
    ${customMessage ? '<p>' + customMessage + '</p>' : ''}
    <div class="info-box">
        <p><strong>Teklif No:</strong> ${teklif.teklifNo}</p>
        <p><strong>Teklif Tarihi:</strong> ${formatDate(teklif.tarih)}</p>
        <p><strong>Geçerlilik Süresi:</strong> ${teklif.gecerlilikGunu} gün</p>
        <p><strong>Firma:</strong> ${teklif.customer?.unvan || ''}</p>
    </div>
    <h3>Teklif Özeti</h3>
    <table>
        <tr><th>Hizmet</th><th>Miktar</th><th>Birim Fiyat</th><th>Toplam</th></tr>
        ${teklif.detaylar.map(d => `<tr><td>${d.hizmet?.ad || ''}</td><td>${d.miktar}</td><td>${formatMoney(d.birimFiyat)} TL</td><td>${formatMoney(d.toplam)} TL</td></tr>`).join('')}
        <tr style="background:#f5f5f5;"><td colspan="3" style="text-align:right;"><strong>Ara Toplam:</strong></td><td><strong>${formatMoney(teklif.toplamTutar)} TL</strong></td></tr>
        <tr style="background:#f5f5f5;"><td colspan="3" style="text-align:right;"><strong>KDV (%${teklif.kdvOrani}):</strong></td><td><strong>${formatMoney(teklif.kdvTutar)} TL</strong></td></tr>
        <tr style="background:#1a5f7a;color:white;"><td colspan="3" style="text-align:right;"><strong>GENEL TOPLAM:</strong></td><td style="color:white;font-weight:bold;">${formatMoney(teklif.genelToplam)} TL</td></tr>
    </table>
    <p>Teklifimizin detayları ve genel şartlar ekteki PDF dosyasında mevcuttur.</p>
    <p>Teklifimizin uygun bulunması halinde bizimle iletişime geçmenizi rica ederiz.</p>
    <p>Saygılarımızla,<br><strong>${teklif.tenant?.yetkili || ''}</strong><br>${teklif.tenant?.yetkiliUnvan || ''}</p>
</div>
<div class="footer">
    <p>${teklif.tenant?.name || 'ÖNDER MUAYENE'}</p>
    <p>${teklif.tenant?.adres || ''}</p>
    <p>Tel: ${teklif.tenant?.telefon || ''} | E-mail: ${teklif.tenant?.email || ''}</p>
</div>
</body></html>`;

    const mailOptions = {
        from: `"${teklif.tenant?.name || 'ÖNDER MUAYENE'}" <${smtpConfig.user}>`,
        to: teklif.customer?.email,
        subject: `Fiyat Teklifi - ${teklif.teklifNo} | ${teklif.tenant?.name || 'ÖNDER MUAYENE'}`,
        html: htmlContent,
        attachments: [{
            filename: `Teklif-${teklif.teklifNo}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf'
        }]
    };

    const result = await transporter.sendMail(mailOptions);
    return { success: true, messageId: result.messageId, to: teklif.customer?.email };
}

/**
 * Test email gönder
 */
async function sendTestEmail(smtpConfig, toEmail) {
    const transporter = createTransporter(smtpConfig);
    const mailOptions = {
        from: smtpConfig.user,
        to: toEmail,
        subject: 'Test E-postası - ÖNDER MUAYENE',
        html: '<h2>E-posta Ayarları Test</h2><p>Bu bir test e-postasıdır.</p><p>E-posta ayarlarınız başarıyla yapılandırılmıştır.</p>'
    };
    const result = await transporter.sendMail(mailOptions);
    return { success: true, messageId: result.messageId };
}

module.exports = {
    createTransporter,
    createTeklifPDFBuffer,
    sendTeklifEmail,
    sendTestEmail,
    formatMoney,
    GENEL_SARTLAR
};
