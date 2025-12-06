const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');

// E-posta ayarları (bunlar daha sonra bir config dosyasından veya environment variable'lardan okunabilir)
const emailConfig = {
    host: 'smtp.gmail.com', // E-posta sunucusu
    port: 587,
    secure: false,
    auth: {
        user: 'your-email@gmail.com', // Gerçek e-posta adresi ile değiştirilmeli
        pass: 'your-app-password' // Gerçek app password ile değiştirilmeli
    }
};

// E-posta şablonları
const emailTemplates = {
    teklifOlusturuldu: (teklif, musteri) => ({
        subject: `Yeni Teklif - ${teklif.teklifNo}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background-color: #2C5F8D; color: white; padding: 20px; text-align: center;">
                    <h1>ÖNDER MUAYENE KURULUŞU</h1>
                </div>
                <div style="padding: 30px;">
                    <h2>Sayın ${musteri.yetkiliKisi || musteri.unvan},</h2>
                    <p>Talebiniz doğrultusunda hazırladığımız ${teklif.teklifNo} numaralı teklifimiz oluşturulmuştur.</p>
                    
                    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <p><strong>Teklif No:</strong> ${teklif.teklifNo}</p>
                        <p><strong>Tarih:</strong> ${teklif.teklifTarihi}</p>
                        <p><strong>Konu:</strong> ${teklif.konu}</p>
                        <p><strong>Toplam Tutar:</strong> ₺${teklif.genelToplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</p>
                        <p><strong>Geçerlilik Süresi:</strong> ${teklif.gecerlilik} gün</p>
                    </div>
                    
                    <p>Teklifimizin detayları ekte sunulmuştur. Herhangi bir sorunuz olması durumunda bizimle iletişime geçebilirsiniz.</p>
                    
                    <p>Saygılarımızla,<br>
                    ÖNDER MUAYENE KURULUŞU</p>
                </div>
                <div style="background-color: #f8f9fa; padding: 15px; text-align: center; font-size: 12px; color: #666;">
                    <p>Konya, Türkiye | Tel: 0332 123 4567 | info@ondermuayene.com</p>
                </div>
            </div>
        `
    }),

    durumDegisti: (teklif, musteri, eskiDurum, yeniDurum, not) => ({
        subject: `Teklif Durum Güncellemesi - ${teklif.teklifNo}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background-color: #2C5F8D; color: white; padding: 20px; text-align: center;">
                    <h1>ÖNDER MUAYENE KURULUŞU</h1>
                </div>
                <div style="padding: 30px;">
                    <h2>Sayın ${musteri.yetkiliKisi || musteri.unvan},</h2>
                    <p>${teklif.teklifNo} numaralı teklifinizin durumu güncellenmiştir.</p>
                    
                    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <p><strong>Teklif No:</strong> ${teklif.teklifNo}</p>
                        <p><strong>Eski Durum:</strong> <span style="background-color: #e0e0e0; padding: 4px 8px; border-radius: 4px;">${eskiDurum}</span></p>
                        <p><strong>Yeni Durum:</strong> <span style="background-color: ${yeniDurum === 'Onaylandı' ? '#d4edda' : '#f8d7da'}; color: ${yeniDurum === 'Onaylandı' ? '#155724' : '#721c24'}; padding: 4px 8px; border-radius: 4px;">${yeniDurum}</span></p>
                        ${not ? `<p><strong>Not:</strong> ${not}</p>` : ''}
                    </div>
                    
                    ${yeniDurum === 'Onaylandı' ? 
                        '<p>Teklifinizin onaylandığını bildirmekten mutluluk duyarız. En kısa sürede sizinle iletişime geçeceğiz.</p>' : 
                        '<p>Teklifiniz ile ilgili görüşmek isterseniz bizimle iletişime geçebilirsiniz.</p>'
                    }
                    
                    <p>Saygılarımızla,<br>
                    ÖNDER MUAYENE KURULUŞU</p>
                </div>
                <div style="background-color: #f8f9fa; padding: 15px; text-align: center; font-size: 12px; color: #666;">
                    <p>Konya, Türkiye | Tel: 0332 123 4567 | info@ondermuayene.com</p>
                </div>
            </div>
        `
    })
};

// E-posta gönderme fonksiyonu
async function sendEmail(to, template, attachments = []) {
    // Varsayılan kimlik bilgileri kontrolü
    if (emailConfig.auth.user === 'your-email@gmail.com' || emailConfig.auth.pass === 'your-app-password') {
        console.warn('⚠️ E-posta gönderilemedi: Varsayılan kimlik bilgileri kullanılıyor. Lütfen e-posta ayarlarını yapılandırın.');
        return { success: false, error: 'E-posta ayarları yapılandırılmamış' };
    }

    try {
        // Transporter oluştur
        const transporter = nodemailer.createTransport(emailConfig);

        // E-posta gönder
        const info = await transporter.sendMail({
            from: '"ÖNDER MUAYENE" <noreply@ondermuayene.com>',
            to: to,
            subject: template.subject,
            html: template.html,
            attachments: attachments
        });

        console.log('E-posta gönderildi:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        // Auth hatalarını özel olarak yakala
        if (error.code === 'EAUTH') {
            console.warn('⚠️ E-posta kimlik doğrulama hatası: Kullanıcı adı veya şifre yanlış.');
            return { success: false, error: 'E-posta kimlik doğrulama hatası' };
        }
        
        console.error('E-posta gönderme hatası:', error.message);
        return { success: false, error: error.message };
    }
}

// E-posta ayarlarını güncelleme fonksiyonu
async function updateEmailConfig(newConfig) {
    Object.assign(emailConfig, newConfig);
    
    // Ayarları bir dosyaya kaydet
    try {
        await fs.writeFile(
            path.join(__dirname, 'emailConfig.json'),
            JSON.stringify(emailConfig, null, 2)
        );
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// E-posta ayarlarını yükleme fonksiyonu
async function loadEmailConfig() {
    try {
        const data = await fs.readFile(path.join(__dirname, 'emailConfig.json'), 'utf8');
        Object.assign(emailConfig, JSON.parse(data));
        return { success: true };
    } catch (error) {
        // Dosya yoksa veya hata varsa varsayılan ayarları kullan
        return { success: false, error: error.message };
    }
}

// E-posta gönderme kuyruğu (gelecekte kullanılabilir)
const emailQueue = [];

// Kuyruktan e-posta gönderme fonksiyonu
async function processEmailQueue() {
    if (emailQueue.length === 0) return;
    
    const email = emailQueue.shift();
    const result = await sendEmail(email.to, email.template, email.attachments);
    
    if (!result.success) {
        // Başarısız olanları tekrar kuyruğa ekle (max 3 deneme)
        if (!email.attempts) email.attempts = 0;
        email.attempts++;
        if (email.attempts < 3) {
            emailQueue.push(email);
        }
    }
    
    // Kuyrukta başka e-posta varsa devam et
    if (emailQueue.length > 0) {
        setTimeout(processEmailQueue, 5000); // 5 saniye bekle
    }
}

// Kuyruğa e-posta ekleme fonksiyonu
function queueEmail(to, template, attachments = []) {
    emailQueue.push({ to, template, attachments });
    
    // Kuyruk işleme başlamadıysa başlat
    if (emailQueue.length === 1) {
        processEmailQueue();
    }
}

module.exports = {
    sendEmail,
    queueEmail,
    emailTemplates,
    updateEmailConfig,
    loadEmailConfig,
    emailConfig
};