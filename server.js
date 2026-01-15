const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const auth = require('./auth');
const reportEngine = require('./reports');
const emailService = require('./emailService');

const app = express();
const PORT = process.env.PORT || 3001;

// Multer konfigürasyonu - şablon dosyaları için
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'templates');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});
const upload = multer({ storage: storage });

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

// Şablon dosyası yükleme endpoint'i
app.post('/api/upload-template', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, error: 'Dosya yüklenmedi' });
    }
    console.log('Şablon dosyası yüklendi:', req.file.originalname);
    res.json({
        success: true,
        filename: req.file.originalname,
        path: req.file.path
    });
});

// ============ AUTH API ============

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];
    if (!email || !password) return res.status(400).json({ error: 'Email ve şifre gerekli' });
    const result = await auth.login(email, password, ip, userAgent);
    if (result.success) res.json(result);
    else res.status(401).json({ error: result.error });
});

app.get('/api/auth/me', auth.authMiddleware(), async (req, res) => {
    res.json({ success: true, user: req.user });
});

app.post('/api/auth/logout', (req, res) => {
    res.json({ success: true });
});

// Personel Login (username ile)
app.post('/api/auth/personel-login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Kullanıcı adı ve şifre gerekli' });
    }
    const result = await auth.personelLogin(username, password);
    if (result.success) {
        res.json(result);
    } else {
        res.status(401).json({ error: result.error });
    }
});

// Personel şifre değiştir
app.put('/api/auth/personel-password/:id', auth.authMiddleware(), async (req, res) => {
    const { newPassword } = req.body;
    if (!newPassword) {
        return res.status(400).json({ error: 'Yeni şifre gerekli' });
    }
    const result = await auth.updatePersonelPassword(req.params.id, newPassword);
    res.json(result);
});

app.post('/api/auth/forgot-password', async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ error: 'E-posta adresi gerekli' });
    }

    const result = await auth.createResetToken(email);
    if (!result.success) {
        return res.status(400).json({ error: result.error });
    }

    // SMTP ayarlarını kontrol et
    const smtpConfig = {
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT) || 465,
        secure: process.env.SMTP_SECURE === 'true',
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    };

    // SMTP yapılandırılmamışsa hata ver
    if (!smtpConfig.user || !smtpConfig.pass) {
        return res.status(500).json({ error: 'E-posta servisi yapılandırılmamış. Lütfen yönetici ile iletişime geçin.' });
    }

    try {
        await emailService.sendPasswordResetEmail(smtpConfig, email, result.resetToken, result.user.name);
        res.json({ success: true, message: 'Şifre sıfırlama kodu e-posta adresinize gönderildi' });
    } catch (emailError) {
        console.error('Email gönderme hatası:', emailError);
        res.status(500).json({ error: 'E-posta gönderilemedi. Lütfen daha sonra tekrar deneyin.' });
    }
});

app.post('/api/auth/reset-password', async (req, res) => {
    const { email, token, newPassword } = req.body;
    const result = await auth.resetPassword(email, token, newPassword);
    if (result.success) res.json({ success: true, message: 'Şifre başarıyla değiştirildi' });
    else res.status(400).json({ error: result.error });
});

// ============ PROFİL API ============

// Kullanıcı profil bilgilerini getir
app.get('/api/auth/profile', auth.authMiddleware(), async (req, res) => {
    try {
        const user = await auth.prisma.user.findUnique({
            where: { id: req.user.id },
            select: {
                id: true,
                email: true,
                name: true,
                telefon: true,
                role: true,
                emailNotifications: true,
                systemNotifications: true,
                lastLogin: true,
                createdAt: true
            }
        });
        if (!user) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        }
        res.json(user);
    } catch (error) {
        console.error('Profil getirme hatası:', error);
        res.status(500).json({ error: 'Profil bilgileri alınamadı' });
    }
});

// Kullanıcı profil bilgilerini güncelle
app.put('/api/auth/profile', auth.authMiddleware(), async (req, res) => {
    try {
        const { name, email, telefon } = req.body;

        // Email değişiyorsa kontrol et
        if (email && email !== req.user.email) {
            const existing = await auth.prisma.user.findUnique({ where: { email } });
            if (existing) {
                return res.status(400).json({ error: 'Bu e-posta adresi zaten kullanımda' });
            }
        }

        const updatedUser = await auth.prisma.user.update({
            where: { id: req.user.id },
            data: {
                ...(name && { name }),
                ...(email && { email }),
                ...(telefon !== undefined && { telefon })
            },
            select: {
                id: true,
                email: true,
                name: true,
                telefon: true,
                role: true
            }
        });

        res.json({ success: true, user: updatedUser });
    } catch (error) {
        console.error('Profil güncelleme hatası:', error);
        res.status(500).json({ error: 'Profil güncellenemedi' });
    }
});

// Kullanıcı şifre değiştir
app.put('/api/auth/change-password', auth.authMiddleware(), async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Mevcut şifre ve yeni şifre gerekli' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'Yeni şifre en az 6 karakter olmalı' });
        }

        // Mevcut kullanıcıyı al
        const user = await auth.prisma.user.findUnique({
            where: { id: req.user.id }
        });

        // Mevcut şifreyi doğrula
        if (!auth.verifyPassword(currentPassword, user.password)) {
            return res.status(400).json({ error: 'Mevcut şifre hatalı' });
        }

        // Yeni şifreyi kaydet
        await auth.prisma.user.update({
            where: { id: req.user.id },
            data: {
                password: auth.hashPassword(newPassword),
                plainPassword: newPassword
            }
        });

        res.json({ success: true, message: 'Şifre başarıyla değiştirildi' });
    } catch (error) {
        console.error('Şifre değiştirme hatası:', error);
        res.status(500).json({ error: 'Şifre değiştirilemedi' });
    }
});

// Bildirim ayarlarını güncelle
app.put('/api/auth/notification-settings', auth.authMiddleware(), async (req, res) => {
    try {
        const { emailNotifications, systemNotifications } = req.body;

        const updatedUser = await auth.prisma.user.update({
            where: { id: req.user.id },
            data: {
                emailNotifications: emailNotifications ?? true,
                systemNotifications: systemNotifications ?? true
            },
            select: {
                emailNotifications: true,
                systemNotifications: true
            }
        });

        res.json({ success: true, settings: updatedUser });
    } catch (error) {
        console.error('Bildirim ayarları güncelleme hatası:', error);
        res.status(500).json({ error: 'Bildirim ayarları güncellenemedi' });
    }
});

// ============ PERSONEL PROFİL API ============

// Personel profil bilgilerini getir
app.get('/api/auth/personel-profile', auth.authMiddleware(), async (req, res) => {
    try {
        // Token'dan personelId'yi al (personel login'den)
        const token = req.headers['authorization']?.replace('Bearer ', '');
        const decoded = require('jsonwebtoken').decode(token);

        if (!decoded?.personelId) {
            return res.status(400).json({ error: 'Personel bilgisi bulunamadı' });
        }

        const personel = await auth.prisma.personel.findUnique({
            where: { id: decoded.personelId },
            select: {
                id: true,
                adSoyad: true,
                unvan: true,
                telefon: true,
                email: true,
                kategori: true,
                username: true,
                emailNotifications: true,
                systemNotifications: true,
                createdAt: true
            }
        });

        if (!personel) {
            return res.status(404).json({ error: 'Personel bulunamadı' });
        }

        res.json(personel);
    } catch (error) {
        console.error('Personel profil getirme hatası:', error);
        res.status(500).json({ error: 'Profil bilgileri alınamadı' });
    }
});

// Personel profil bilgilerini güncelle
app.put('/api/auth/personel-profile', auth.authMiddleware(), async (req, res) => {
    try {
        const token = req.headers['authorization']?.replace('Bearer ', '');
        const decoded = require('jsonwebtoken').decode(token);

        if (!decoded?.personelId) {
            return res.status(400).json({ error: 'Personel bilgisi bulunamadı' });
        }

        const { adSoyad, telefon, email } = req.body;

        const updatedPersonel = await auth.prisma.personel.update({
            where: { id: decoded.personelId },
            data: {
                ...(adSoyad && { adSoyad }),
                ...(telefon !== undefined && { telefon }),
                ...(email !== undefined && { email })
            },
            select: {
                id: true,
                adSoyad: true,
                telefon: true,
                email: true
            }
        });

        res.json({ success: true, personel: updatedPersonel });
    } catch (error) {
        console.error('Personel profil güncelleme hatası:', error);
        res.status(500).json({ error: 'Profil güncellenemedi' });
    }
});

// Personel şifre değiştir (kendi şifresi)
app.put('/api/auth/personel-change-password', auth.authMiddleware(), async (req, res) => {
    try {
        const token = req.headers['authorization']?.replace('Bearer ', '');
        const decoded = require('jsonwebtoken').decode(token);

        if (!decoded?.personelId) {
            return res.status(400).json({ error: 'Personel bilgisi bulunamadı' });
        }

        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Mevcut şifre ve yeni şifre gerekli' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'Yeni şifre en az 6 karakter olmalı' });
        }

        const personel = await auth.prisma.personel.findUnique({
            where: { id: decoded.personelId }
        });

        if (!personel.password || !auth.verifyPassword(currentPassword, personel.password)) {
            return res.status(400).json({ error: 'Mevcut şifre hatalı' });
        }

        await auth.prisma.personel.update({
            where: { id: decoded.personelId },
            data: { password: auth.hashPassword(newPassword) }
        });

        res.json({ success: true, message: 'Şifre başarıyla değiştirildi' });
    } catch (error) {
        console.error('Personel şifre değiştirme hatası:', error);
        res.status(500).json({ error: 'Şifre değiştirilemedi' });
    }
});

// Personel bildirim ayarlarını güncelle
app.put('/api/auth/personel-notification-settings', auth.authMiddleware(), async (req, res) => {
    try {
        const token = req.headers['authorization']?.replace('Bearer ', '');
        const decoded = require('jsonwebtoken').decode(token);

        if (!decoded?.personelId) {
            return res.status(400).json({ error: 'Personel bilgisi bulunamadı' });
        }

        const { emailNotifications, systemNotifications } = req.body;

        const updatedPersonel = await auth.prisma.personel.update({
            where: { id: decoded.personelId },
            data: {
                emailNotifications: emailNotifications ?? true,
                systemNotifications: systemNotifications ?? true
            },
            select: {
                emailNotifications: true,
                systemNotifications: true
            }
        });

        res.json({ success: true, settings: updatedPersonel });
    } catch (error) {
        console.error('Personel bildirim ayarları güncelleme hatası:', error);
        res.status(500).json({ error: 'Bildirim ayarları güncellenemedi' });
    }
});

// ============ KULLANICI API ============

app.get('/api/users', auth.authMiddleware('admin'), async (req, res) => {
    try {
        const users = await auth.listUsers();
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Kullanıcılar alınamadı' });
    }
});

app.post('/api/users', auth.authMiddleware('admin'), async (req, res) => {
    try {
        const existing = await auth.prisma.user.findUnique({ where: { email: req.body.email } });
        if (existing) return res.status(400).json({ error: 'Bu email zaten kullanımda' });
        const result = await auth.createUser(req.body);
        res.json(result.user);
    } catch (error) {
        res.status(500).json({ error: 'Kullanıcı eklenemedi' });
    }
});

app.put('/api/users/:id', auth.authMiddleware('admin'), async (req, res) => {
    try {
        const result = await auth.updateUser(req.params.id, req.body);
        res.json(result.user);
    } catch (error) {
        res.status(500).json({ error: 'Kullanıcı güncellenemedi' });
    }
});

app.delete('/api/users/:id', auth.authMiddleware('admin'), async (req, res) => {
    try {
        await auth.deleteUser(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Kullanıcı silinemedi' });
    }
});

// ============ MÜŞTERİ API ============

app.get('/api/customers', auth.authMiddleware(), async (req, res) => {
    try {
        const customers = await auth.prisma.customer.findMany({ orderBy: { createdAt: 'desc' } });
        res.json(customers);
    } catch (error) {
        res.status(500).json({ error: 'Müşteriler alınamadı' });
    }
});

app.post('/api/customers', auth.authMiddleware('admin'), async (req, res) => {
    try {
        const customer = await auth.prisma.customer.create({ data: req.body });
        res.json(customer);
    } catch (error) {
        console.error('Müşteri ekleme hatası:', error);
        res.status(500).json({ error: 'Müşteri eklenemedi: ' + error.message });
    }
});

app.put('/api/customers/:id', auth.authMiddleware('admin'), async (req, res) => {
    try {
        const customer = await auth.prisma.customer.update({ where: { id: parseInt(req.params.id) }, data: req.body });
        res.json(customer);
    } catch (error) {
        res.status(500).json({ error: 'Müşteri güncellenemedi' });
    }
});

app.delete('/api/customers/:id', auth.authMiddleware('admin'), async (req, res) => {
    try {
        await auth.prisma.customer.delete({ where: { id: parseInt(req.params.id) } });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Müşteri silinemedi' });
    }
});

// ============ KATEGORİ & HİZMET API ============

app.get('/api/kategoriler', auth.authMiddleware(), async (req, res) => {
    try {
        const kategoriler = await auth.prisma.kategori.findMany({
            include: { hizmetler: { where: { isActive: true }, orderBy: { sira: 'asc' } } },
            orderBy: { sira: 'asc' }
        });
        res.json(kategoriler);
    } catch (error) {
        res.status(500).json({ error: 'Kategoriler alınamadı' });
    }
});

app.get('/api/hizmetler', auth.authMiddleware(), async (req, res) => {
    try {
        const hizmetler = await auth.prisma.hizmet.findMany({
            where: { isActive: true },
            include: { kategori: true },
            orderBy: [{ kategori: { sira: 'asc' } }, { sira: 'asc' }]
        });
        res.json(hizmetler);
    } catch (error) {
        res.status(500).json({ error: 'Hizmetler alınamadı' });
    }
});

app.post('/api/hizmetler', auth.authMiddleware('admin'), async (req, res) => {
    try {
        const hizmet = await auth.prisma.hizmet.create({ data: req.body });
        res.json(hizmet);
    } catch (error) {
        res.status(500).json({ error: 'Hizmet eklenemedi' });
    }
});

app.put('/api/hizmetler/:id', auth.authMiddleware('admin'), async (req, res) => {
    try {
        const hizmet = await auth.prisma.hizmet.update({ where: { id: parseInt(req.params.id) }, data: req.body });
        res.json(hizmet);
    } catch (error) {
        res.status(500).json({ error: 'Hizmet güncellenemedi' });
    }
});

// Hizmet sil (soft delete - isActive = false)
app.delete('/api/hizmetler/:id', auth.authMiddleware('admin'), async (req, res) => {
    try {
        const hizmetId = parseInt(req.params.id);

        // Önce hizmetin kullanımda olup olmadığını kontrol et
        const kullaniliyor = await auth.prisma.teklifDetay.findFirst({
            where: { hizmetId: hizmetId }
        });

        if (kullaniliyor) {
            // Soft delete - hizmeti pasif yap
            const hizmet = await auth.prisma.hizmet.update({
                where: { id: hizmetId },
                data: { isActive: false }
            });
            res.json({ message: 'Hizmet pasif yapıldı (tekliflerde kullanılıyor)', hizmet });
        } else {
            // Hiç kullanılmamışsa tamamen sil
            await auth.prisma.hizmet.delete({
                where: { id: hizmetId }
            });
            res.json({ message: 'Hizmet silindi' });
        }
    } catch (error) {
        console.error('Hizmet silme hatası:', error);
        res.status(500).json({ error: 'Hizmet silinemedi: ' + error.message });
    }
});

// ============ TEKLİF API ============

// Teklif listesi
app.get('/api/teklifler', auth.authMiddleware(), async (req, res) => {
    try {
        const teklifler = await auth.prisma.teklif.findMany({
            include: {
                customer: true,
                olusturan: { select: { name: true } },
                _count: { select: { detaylar: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(teklifler);
    } catch (error) {
        res.status(500).json({ error: 'Teklifler alınamadı' });
    }
});

// Yeni teklif numarası oluştur (ÖNEMLİ: :id route'undan ÖNCE olmalı)
app.get('/api/teklifler/yeni-numara', auth.authMiddleware(), async (req, res) => {
    try {
        const yil = new Date().getFullYear().toString().slice(-2);
        const sonTeklif = await auth.prisma.teklif.findFirst({
            where: { teklifNo: { startsWith: yil + '-' } },
            orderBy: { teklifNo: 'desc' }
        });
        let sira = 1;
        if (sonTeklif) {
            const sonSira = parseInt(sonTeklif.teklifNo.split('-')[1]);
            sira = sonSira + 1;
        }
        const yeniNo = `${yil}-${sira.toString().padStart(3, '0')}`;
        res.json({ teklifNo: yeniNo });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Tek teklif detayı
app.get('/api/teklifler/:id', auth.authMiddleware(), async (req, res) => {
    try {
        const teklif = await auth.prisma.teklif.findUnique({
            where: { id: parseInt(req.params.id) },
            include: {
                customer: true,
                olusturan: { select: { name: true } },
                detaylar: {
                    include: { hizmet: { include: { kategori: true } } },
                    orderBy: { hizmet: { sira: 'asc' } }
                }
            }
        });
        if (!teklif) return res.status(404).json({ error: 'Teklif bulunamadı' });

        // Firma bilgilerini ekle
        const firma = await auth.prisma.firmaAyarlari.findFirst();
        res.json({ ...teklif, firma });
    } catch (error) {
        res.status(500).json({ error: 'Teklif detayı alınamadı' });
    }
});

// Teklif oluştur
app.post('/api/teklifler', auth.authMiddleware(), async (req, res) => {
    try {
        const { customerId, teklifNo, konu, detaylar, iskontoOran, kdvOrani: girilenKdvOrani, notlar, onayTelefon, sahadaOnay, gecerlilikGun } = req.body;

        if (!customerId) {
            return res.status(400).json({ error: 'Müşteri seçilmedi' });
        }

        // Teklif numarası oluştur (verilmediyse)
        let finalTeklifNo = teklifNo;
        if (!finalTeklifNo) {
            const yil = new Date().getFullYear().toString().slice(-2);
            const sonTeklif = await auth.prisma.teklif.findFirst({
                where: { teklifNo: { startsWith: yil + '-' } },
                orderBy: { teklifNo: 'desc' }
            });
            let sira = 1;
            if (sonTeklif) {
                const sonSira = parseInt(sonTeklif.teklifNo.split('-')[1]);
                sira = sonSira + 1;
            }
            finalTeklifNo = `${yil}-${sira.toString().padStart(3, '0')}`;
        }

        // Hesaplamalar
        let araToplam = 0;
        const detaylarData = (detaylar || []).filter(d => d.miktar > 0).map(d => {
            const tutar = d.miktar * parseFloat(d.birimFiyat || 0);
            araToplam += tutar;
            return {
                hizmetId: parseInt(d.hizmetId),
                miktar: d.miktar,
                birimFiyat: parseFloat(d.birimFiyat || 0),
                tutar: tutar
            };
        });

        const iskontoTutar = araToplam * (parseFloat(iskontoOran) || 0) / 100;
        const toplamTutar = araToplam - iskontoTutar;
        const kdvOrani = parseInt(girilenKdvOrani) || 20;
        const kdvTutar = toplamTutar * kdvOrani / 100;
        const genelToplam = toplamTutar + kdvTutar;

        const teklif = await auth.prisma.teklif.create({
            data: {
                teklifNo: finalTeklifNo,
                customerId: parseInt(customerId),
                konu: konu || 'PERİYODİK KONTROL VE İŞ HİJYENİ ÖLÇÜM FİYAT TEKLİFİ',
                gecerlilikGun: gecerlilikGun || 30,
                araToplam,
                iskontoOran: parseFloat(iskontoOran) || 0,
                iskontoTutar,
                toplamTutar,
                kdvOrani,
                kdvTutar,
                genelToplam,
                notlar: notlar || null,
                onayTelefon: onayTelefon || false,
                sahadaOnay: sahadaOnay || false,
                olusturanId: req.user.id,
                detaylar: { create: detaylarData }
            },
            include: { customer: true, detaylar: { include: { hizmet: true } } }
        });

        res.json(teklif);
    } catch (error) {
        console.error('Teklif oluşturma hatası:', error);
        res.status(500).json({ error: 'Teklif oluşturulamadı: ' + error.message });
    }
});

// Durum Türkçe → Enum dönüşümü
const teklifDurumMap = {
    'Taslak': 'TASLAK',
    'Gönderildi': 'GONDERILDI',
    'Onaylandı': 'ONAYLANDI',
    'Reddedildi': 'REDDEDILDI',
    'İptal': 'IPTAL',
    // Enum değerleri de kabul et
    'TASLAK': 'TASLAK',
    'GONDERILDI': 'GONDERILDI',
    'ONAYLANDI': 'ONAYLANDI',
    'REDDEDILDI': 'REDDEDILDI',
    'IPTAL': 'IPTAL'
};

// Teklif güncelle
app.put('/api/teklifler/:id', auth.authMiddleware(), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { customerId, konu, detaylar, iskontoOran, kdvOrani: girilenKdvOrani, notlar, onayTelefon, sahadaOnay, durum, gecerlilikGun } = req.body;

        // Önce mevcut detayları sil
        await auth.prisma.teklifDetay.deleteMany({ where: { teklifId: id } });

        // Hesaplamalar
        let araToplam = 0;
        const detaylarData = (detaylar || []).filter(d => d.miktar > 0).map(d => {
            const tutar = d.miktar * parseFloat(d.birimFiyat || 0);
            araToplam += tutar;
            return {
                teklifId: id,
                hizmetId: parseInt(d.hizmetId),
                miktar: d.miktar,
                birimFiyat: parseFloat(d.birimFiyat || 0),
                tutar: tutar
            };
        });

        const iskontoTutar = araToplam * (parseFloat(iskontoOran) || 0) / 100;
        const toplamTutar = araToplam - iskontoTutar;
        const kdvOrani = parseInt(girilenKdvOrani) || 20;
        const kdvTutar = toplamTutar * kdvOrani / 100;
        const genelToplam = toplamTutar + kdvTutar;

        // Detayları tekrar oluştur
        if (detaylarData.length > 0) {
            await auth.prisma.teklifDetay.createMany({ data: detaylarData });
        }

        // Durum dönüşümü
        const mappedDurum = durum ? teklifDurumMap[durum] : undefined;

        const teklif = await auth.prisma.teklif.update({
            where: { id },
            data: {
                customerId: customerId ? parseInt(customerId) : undefined,
                konu: konu || undefined,
                gecerlilikGun: gecerlilikGun || undefined,
                araToplam,
                iskontoOran: parseFloat(iskontoOran) || 0,
                iskontoTutar,
                toplamTutar,
                kdvOrani,
                kdvTutar,
                genelToplam,
                notlar: notlar || null,
                onayTelefon: onayTelefon || false,
                sahadaOnay: sahadaOnay || false,
                durum: mappedDurum
            },
            include: { customer: true, detaylar: { include: { hizmet: true } } }
        });

        res.json(teklif);
    } catch (error) {
        console.error('Teklif güncelleme hatası:', error);
        res.status(500).json({ error: 'Teklif güncellenemedi: ' + error.message });
    }
});

// Teklif durum güncelle
app.patch('/api/teklifler/:id/durum', auth.authMiddleware('admin'), async (req, res) => {
    try {
        const teklifId = parseInt(req.params.id);
        const mappedDurum = teklifDurumMap[req.body.durum] || req.body.durum;

        const teklif = await auth.prisma.teklif.update({
            where: { id: teklifId },
            data: { durum: mappedDurum }
        });

        // ONAYLANDI durumuna geçince otomatik iş emri oluştur
        if (mappedDurum === 'ONAYLANDI') {
            // Bu teklif için zaten iş emri var mı kontrol et
            const mevcutIsEmri = await auth.prisma.isEmri.findFirst({
                where: { teklifId: teklifId }
            });

            if (!mevcutIsEmri) {
                // İş emri numarası oluştur
                const yil = new Date().getFullYear().toString().slice(-2);
                const sonIsEmri = await auth.prisma.isEmri.findFirst({
                    where: { isEmriNo: { startsWith: `IE-${yil}-` } },
                    orderBy: { isEmriNo: 'desc' }
                });

                let siraNo = 1;
                if (sonIsEmri) {
                    const sonSira = parseInt(sonIsEmri.isEmriNo.split('-')[2]);
                    siraNo = sonSira + 1;
                }
                const isEmriNo = `IE-${yil}-${siraNo.toString().padStart(4, '0')}`;

                // Teklif detaylarını al
                const teklifDetay = await auth.prisma.teklif.findUnique({
                    where: { id: teklifId },
                    include: { detaylar: { include: { hizmet: { include: { kategori: true } } } } }
                });

                // Personelleri al
                const personeller = await auth.prisma.personel.findMany({ where: { isActive: true } });
                const kategoriPersonelMap = {};
                personeller.forEach(p => { kategoriPersonelMap[p.kategori] = p; });

                // Alt görevleri hazırla
                const altGorevler = [];
                for (const detay of teklifDetay.detaylar) {
                    const kategoriAdi = detay.hizmet.kategori?.ad || 'Diger';
                    let personelKategori = 'Mekanik';
                    if (kategoriAdi.includes('Elektrik')) personelKategori = 'Elektriksel';
                    else if (kategoriAdi.includes('Hijyen') || kategoriAdi.includes('Ölçüm')) personelKategori = 'IsHijyeni';

                    const atananPersonel = kategoriPersonelMap[personelKategori];

                    for (let i = 1; i <= detay.miktar; i++) {
                        altGorevler.push({
                            hizmetId: detay.hizmetId,
                            hizmetAdi: detay.hizmet.ad,
                            kategori: personelKategori,
                            siraNo: i,
                            ekipmanAdi: `${detay.hizmet.ad} - ${i}`,
                            durum: 'BEKLIYOR',
                            personelId: atananPersonel?.id || null,
                            personelAdi: atananPersonel?.adSoyad || null
                        });
                    }
                }

                // İş emri oluştur
                await auth.prisma.isEmri.create({
                    data: {
                        isEmriNo,
                        teklifId: teklif.id,
                        customerId: teklif.customerId,
                        durum: 'BEKLIYOR',
                        altGorevler: { create: altGorevler }
                    }
                });

                console.log(`✅ Otomatik iş emri oluşturuldu: ${isEmriNo}`);
            }
        }

        res.json(teklif);
    } catch (error) {
        console.error('Durum güncelleme hatası:', error);
        res.status(500).json({ error: 'Durum güncellenemedi' });
    }
});

// Teklif sil
app.delete('/api/teklifler/:id', auth.authMiddleware('admin'), async (req, res) => {
    try {
        await auth.prisma.teklif.delete({ where: { id: parseInt(req.params.id) } });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Teklif silinemedi' });
    }
});

// Teklif PDF oluştur
const teklifPdfGenerator = require('./teklifPdfGenerator');

app.get('/api/teklifler/:id/pdf', auth.authMiddleware(), async (req, res) => {
    try {
        const teklif = await auth.prisma.teklif.findUnique({
            where: { id: parseInt(req.params.id) },
            include: {
                customer: true,
                detaylar: {
                    include: { hizmet: { include: { kategori: true } } },
                    orderBy: { hizmet: { sira: 'asc' } }
                },
                olusturan: { select: { name: true } }
            }
        });

        if (!teklif) {
            return res.status(404).json({ error: 'Teklif bulunamadı' });
        }

        // Firma bilgilerini ekle
        const firma = await auth.prisma.firmaAyarlari.findFirst();
        teklif.firma = firma;

        // TÜM kategorileri ve hizmetleri çek (metodKapsam dahil)
        const tumKategoriler = await auth.prisma.kategori.findMany({
            include: {
                hizmetler: {
                    where: { isActive: true },
                    orderBy: { sira: 'asc' }
                }
            },
            orderBy: { sira: 'asc' }
        });

        // PDF oluştur (tüm kategorilerle birlikte)
        const pdfBuffer = await teklifPdfGenerator.teklifPdfOlustur(teklif, tumKategoriler);

        // Dosya adı: teklifNo_firmaAdi.pdf (ASCII karakterler)
        const firmaAdi = (teklif.customer?.unvan || 'Firma')
            .replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
            .replace(/ü/g, 'u').replace(/Ü/g, 'U')
            .replace(/ş/g, 's').replace(/Ş/g, 'S')
            .replace(/ı/g, 'i').replace(/İ/g, 'I')
            .replace(/ö/g, 'o').replace(/Ö/g, 'O')
            .replace(/ç/g, 'c').replace(/Ç/g, 'C')
            .replace(/[^a-zA-Z0-9 ]/g, '')
            .substring(0, 30).trim();
        const dosyaAdi = `${teklif.teklifNo}_${firmaAdi}.pdf`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${dosyaAdi}"`);
        res.send(pdfBuffer);

    } catch (error) {
        console.error('PDF oluşturma hatası:', error);
        res.status(500).json({ error: 'PDF oluşturulamadı: ' + error.message });
    }
});

// Teklif Excel oluştur
app.get('/api/teklifler/:id/excel', auth.authMiddleware(), async (req, res) => {
    try {
        const teklif = await auth.prisma.teklif.findUnique({
            where: { id: parseInt(req.params.id) },
            include: {
                customer: true,
                detaylar: { include: { hizmet: true } }
            }
        });

        if (!teklif) {
            return res.status(404).json({ error: 'Teklif bulunamadı' });
        }

        const XLSX = require('xlsx');
        const wb = XLSX.utils.book_new();

        const data = [
            ['TEKLİF FORMU'],
            [],
            ['Teklif No:', teklif.teklifNo],
            ['Tarih:', new Date(teklif.tarih).toLocaleDateString('tr-TR')],
            ['Müşteri:', teklif.customer.unvan],
            [],
            ['HİZMETLER'],
            ['Hizmet Adı', 'Miktar', 'Birim Fiyat', 'Toplam'],
            ...teklif.detaylar.map(d => [
                d.hizmet.ad,
                d.miktar,
                parseFloat(d.birimFiyat),
                parseFloat(d.toplam)
            ]),
            [],
            ['', '', 'Ara Toplam:', parseFloat(teklif.toplamTutar)],
            ['', '', `KDV (%${teklif.kdvOrani}):`, parseFloat(teklif.kdvTutar)],
            ['', '', 'GENEL TOPLAM:', parseFloat(teklif.genelToplam)]
        ];

        const ws = XLSX.utils.aoa_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, 'Teklif');

        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=Teklif-${teklif.teklifNo}.xlsx`);
        res.send(buffer);

    } catch (error) {
        console.error('Excel oluşturma hatası:', error);
        res.status(500).json({ error: 'Excel oluşturulamadı' });
    }
});

// ============ FİRMA AYARLARI ============

app.get('/api/firma-ayarlari', auth.authMiddleware(), async (req, res) => {
    try {
        let firma = await auth.prisma.firmaAyarlari.findFirst();
        if (!firma) {
            // Varsayılan firma ayarları oluştur
            firma = await auth.prisma.firmaAyarlari.create({
                data: {
                    name: 'ÖNDER MUAYENE',
                    email: 'info@ondermuayene.com.tr'
                }
            });
        }
        res.json(firma);
    } catch (error) {
        res.status(500).json({ error: 'Firma ayarları alınamadı' });
    }
});

app.put('/api/firma-ayarlari', auth.authMiddleware('admin'), async (req, res) => {
    try {
        let firma = await auth.prisma.firmaAyarlari.findFirst();
        if (firma) {
            firma = await auth.prisma.firmaAyarlari.update({ where: { id: firma.id }, data: req.body });
        } else {
            firma = await auth.prisma.firmaAyarlari.create({ data: req.body });
        }
        res.json(firma);
    } catch (error) {
        res.status(500).json({ error: 'Firma ayarları güncellenemedi' });
    }
});

// ============ İŞ EMRİ API ============

app.get('/api/workorders', auth.authMiddleware(), async (req, res) => {
    try {
        const workOrders = await auth.prisma.workOrder.findMany({
            include: {
                customer: true,
                teklif: { select: { teklifNo: true } },
                atanan: { select: { name: true } },
                fieldData: true
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(workOrders);
    } catch (error) {
        console.error('İş emirleri hatası:', error);
        res.status(500).json({ error: 'İş emirleri alınamadı' });
    }
});

app.get('/api/workorders/:id', auth.authMiddleware(), async (req, res) => {
    try {
        const workOrder = await auth.prisma.workOrder.findUnique({
            where: { id: parseInt(req.params.id) },
            include: {
                customer: true,
                teklif: { include: { detaylar: { include: { hizmet: true } } } },
                atanan: { select: { name: true } },
                fieldData: { include: { olcumYapan: { select: { name: true } } } }
            }
        });
        if (!workOrder) return res.status(404).json({ error: 'İş emri bulunamadı' });

        // Firma bilgilerini ekle
        const firma = await auth.prisma.firmaAyarlari.findFirst();
        res.json({ ...workOrder, firma });
    } catch (error) {
        res.status(500).json({ error: 'İş emri alınamadı' });
    }
});

app.post('/api/workorders', auth.authMiddleware('admin'), async (req, res) => {
    try {
        const { teklifId, customerId, planliTarih, atananUserId } = req.body;

        const year = new Date().getFullYear();
        const count = await auth.prisma.workOrder.count({
            where: { workOrderNo: { startsWith: `IE-${year}` } }
        });
        const workOrderNo = `IE-${year}-${String(count + 1).padStart(4, '0')}`;

        const workOrder = await auth.prisma.workOrder.create({
            data: {
                workOrderNo,
                teklifId: teklifId ? parseInt(teklifId) : null,
                customerId: parseInt(customerId),
                createdBy: req.user.id,
                planliTarih: planliTarih ? new Date(planliTarih) : null,
                atananUserId: atananUserId ? parseInt(atananUserId) : null,
                durum: atananUserId ? 'ATANDI' : 'BEKLEMEDE'
            },
            include: { customer: true }
        });
        res.json(workOrder);
    } catch (error) {
        console.error('İş emri oluşturma hatası:', error);
        res.status(500).json({ error: 'İş emri oluşturulamadı' });
    }
});

app.put('/api/workorders/:id', auth.authMiddleware('admin'), async (req, res) => {
    try {
        const workOrder = await auth.prisma.workOrder.update({
            where: { id: parseInt(req.params.id) },
            data: req.body
        });
        res.json(workOrder);
    } catch (error) {
        res.status(500).json({ error: 'İş emri güncellenemedi' });
    }
});

// ============ SAHA FORMU (FieldData) API ============

app.post('/api/workorders/:workOrderId/fielddata', auth.authMiddleware(), async (req, res) => {
    try {
        const { reportType, formData, olcumTarihi } = req.body;
        const workOrderId = parseInt(req.params.workOrderId);

        const workOrder = await auth.prisma.workOrder.findUnique({
            where: { id: workOrderId }
        });
        if (!workOrder) return res.status(404).json({ error: 'İş emri bulunamadı' });

        const existing = await auth.prisma.fieldData.findFirst({
            where: { workOrderId, reportType }
        });

        let fieldData;
        if (existing) {
            fieldData = await auth.prisma.fieldData.update({
                where: { id: existing.id },
                data: { formData, olcumTarihi: olcumTarihi ? new Date(olcumTarihi) : new Date() }
            });
        } else {
            fieldData = await auth.prisma.fieldData.create({
                data: {
                    workOrderId,
                    reportType,
                    formData,
                    olcumTarihi: olcumTarihi ? new Date(olcumTarihi) : new Date(),
                    olcumYapanId: req.user.id
                }
            });
        }

        await auth.prisma.workOrder.update({
            where: { id: workOrderId },
            data: { durum: 'SAHADA' }
        });

        res.json(fieldData);
    } catch (error) {
        console.error('Saha formu hatası:', error);
        res.status(500).json({ error: 'Saha formu kaydedilemedi' });
    }
});

// ============ RAPOR API ============

app.post('/api/reports/:reportType/:workOrderId/pdf', auth.authMiddleware(), async (req, res) => {
    try {
        const { reportType, workOrderId } = req.params;

        if (!reportEngine.SUPPORTED_TYPES.includes(reportType)) {
            return res.status(400).json({ error: `Desteklenmeyen rapor türü: ${reportType}` });
        }

        const workOrder = await auth.prisma.workOrder.findUnique({
            where: { id: parseInt(workOrderId) },
            include: {
                customer: true,
                fieldData: { where: { reportType } }
            }
        });

        if (!workOrder) return res.status(404).json({ error: 'İş emri bulunamadı' });

        // Firma bilgilerini ekle
        const firma = await auth.prisma.firmaAyarlari.findFirst();
        workOrder.firma = firma;

        const fieldData = workOrder.fieldData[0];
        if (!fieldData) {
            return res.status(400).json({ error: `Bu iş emri için ${reportType} saha formu bulunamadı` });
        }

        const result = await reportEngine.generate(reportType, workOrder, fieldData, req.user);

        await auth.prisma.fieldData.update({
            where: { id: fieldData.id },
            data: { sonuc: result.sonuc, pdfPath: result.pdfPath }
        });

        await auth.prisma.workOrder.update({
            where: { id: workOrder.id },
            data: { durum: 'TAMAMLANDI', tamamlanmaTarih: new Date() }
        });

        res.json(result);
    } catch (error) {
        console.error('Rapor üretim hatası:', error);
        res.status(500).json({ error: error.message || 'Rapor üretilemedi' });
    }
});

app.get('/api/reports/download/:filename', auth.authMiddleware(), async (req, res) => {
    try {
        const { filename } = req.params;
        const filePath = path.join(__dirname, 'storage', 'reports', filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Dosya bulunamadı' });
        }

        res.download(filePath, filename);
    } catch (error) {
        res.status(500).json({ error: 'Dosya indirilemedi' });
    }
});

// ============ DASHBOARD ============

app.get('/api/dashboard', auth.authMiddleware(), async (req, res) => {
    try {
        const thisMonth = new Date();
        thisMonth.setDate(1);
        thisMonth.setHours(0, 0, 0, 0);

        const [customerCount, teklifCount, monthlyTeklifCount, pendingTeklifCount] = await Promise.all([
            auth.prisma.customer.count(),
            auth.prisma.teklif.count(),
            auth.prisma.teklif.count({ where: { createdAt: { gte: thisMonth } } }),
            auth.prisma.teklif.count({ where: { durum: 'TASLAK' } })
        ]);

        const monthlyTotal = await auth.prisma.teklif.aggregate({
            where: { createdAt: { gte: thisMonth } },
            _sum: { genelToplam: true }
        });

        res.json({
            customers: customerCount,
            teklifler: teklifCount,
            monthlyTeklifler: monthlyTeklifCount,
            pendingTeklifler: pendingTeklifCount,
            monthlyTotal: monthlyTotal._sum.genelToplam || 0
        });
    } catch (error) {
        res.status(500).json({ error: 'Dashboard verileri alınamadı' });
    }
});

// ============ TÜRKÇE API ALİASLARI ============

app.get('/api/firma-bilgi', auth.authMiddleware(), async (req, res) => {
    try {
        let firma = await auth.prisma.firmaAyarlari.findFirst();
        if (!firma) {
            firma = await auth.prisma.firmaAyarlari.create({
                data: { name: 'ÖNDER MUAYENE' }
            });
        }
        res.json(firma);
    } catch (error) {
        res.status(500).json({ error: 'Firma bilgisi alınamadı' });
    }
});

app.get('/api/musteriler', auth.authMiddleware(), async (req, res) => {
    try {
        const customers = await auth.prisma.customer.findMany({ orderBy: { createdAt: 'desc' } });
        res.json(customers);
    } catch (error) {
        res.status(500).json({ error: 'Müşteriler alınamadı' });
    }
});

app.post('/api/musteriler', auth.authMiddleware(), async (req, res) => {
    try {
        // yetkiliKisi -> yetkili mapping
        const data = { ...req.body };
        if (data.yetkiliKisi !== undefined) {
            data.yetkili = data.yetkiliKisi;
            delete data.yetkiliKisi;
        }
        const customer = await auth.prisma.customer.create({ data });
        res.json(customer);
    } catch (error) {
        console.error('Müşteri ekleme hatası:', error);
        res.status(500).json({ error: 'Müşteri oluşturulamadı: ' + error.message });
    }
});

app.put('/api/musteriler/:id', auth.authMiddleware(), async (req, res) => {
    try {
        // yetkiliKisi -> yetkili mapping
        const data = { ...req.body };
        if (data.yetkiliKisi !== undefined) {
            data.yetkili = data.yetkiliKisi;
            delete data.yetkiliKisi;
        }
        const customer = await auth.prisma.customer.update({ where: { id: parseInt(req.params.id) }, data });
        res.json(customer);
    } catch (error) {
        console.error('Müşteri güncelleme hatası:', error);
        res.status(500).json({ error: 'Müşteri güncellenemedi: ' + error.message });
    }
});

app.delete('/api/musteriler/:id', auth.authMiddleware(), async (req, res) => {
    try {
        await auth.prisma.customer.delete({ where: { id: parseInt(req.params.id) } });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Müşteri silinemedi' });
    }
});

// Müşteri XLSX Şablon İndir
app.get('/api/musteriler/sablon', auth.authMiddleware(), (req, res) => {
    try {
        const XLSX = require('xlsx');
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([
            ['Ünvan', 'Vergi No', 'Telefon', 'Email', 'Adres', 'Yetkili Kişi', 'Notlar'],
            ['Örnek Firma A.Ş.', '1234567890', '0332 111 22 33', 'info@firma.com', 'Konya Merkez', 'Ahmet Yılmaz', 'Notlar buraya']
        ]);
        XLSX.utils.book_append_sheet(wb, ws, 'Müşteriler');

        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Disposition', 'attachment; filename="musteri_sablonu.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (error) {
        console.error('Şablon oluşturma hatası:', error);
        res.status(500).json({ error: 'Şablon oluşturulamadı' });
    }
});

// Müşteri XLSX Import
app.post('/api/musteriler/import', auth.authMiddleware('admin'), upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Dosya yüklenmedi' });
        }

        const XLSX = require('xlsx');
        const workbook = XLSX.readFile(req.file.path);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet);

        let eklenen = 0;
        let hatali = 0;

        for (const row of data) {
            try {
                const unvan = row['Ünvan'] || row['unvan'] || row['ÜNVAN'] || '';
                if (!unvan) continue;

                await auth.prisma.customer.create({
                    data: {
                        unvan: unvan,
                        vergiNo: String(row['Vergi No'] || row['vergiNo'] || row['VERGI NO'] || ''),
                        telefon: String(row['Telefon'] || row['telefon'] || row['TELEFON'] || ''),
                        email: String(row['Email'] || row['email'] || row['EMAIL'] || row['E-Mail'] || ''),
                        adres: String(row['Adres'] || row['adres'] || row['ADRES'] || ''),
                        yetkili: String(row['Yetkili Kişi'] || row['yetkili'] || row['YETKİLİ'] || row['Yetkili'] || ''),
                        notlar: String(row['Notlar'] || row['notlar'] || row['NOTLAR'] || '')
                    }
                });
                eklenen++;
            } catch (e) {
                hatali++;
            }
        }

        // Temp dosyayı sil
        const fs = require('fs');
        fs.unlinkSync(req.file.path);

        res.json({ success: true, eklenen, hatali, toplam: data.length });
    } catch (error) {
        console.error('Import hatası:', error);
        res.status(500).json({ error: 'Import başarısız: ' + error.message });
    }
});

// ==================== PERSONEL API ====================

// Personel listesi
app.get('/api/personeller', auth.authMiddleware(), async (req, res) => {
    try {
        const personeller = await auth.prisma.personel.findMany({
            where: { isActive: true },
            orderBy: { adSoyad: 'asc' }
        });
        res.json(personeller);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Kategoriye göre personel
app.get('/api/personeller/kategori/:kategori', auth.authMiddleware(), async (req, res) => {
    try {
        const personeller = await auth.prisma.personel.findMany({
            where: { kategori: req.params.kategori, isActive: true }
        });
        res.json(personeller);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== İŞ EMRİ API ====================

// Yeni iş emri numarası
app.get('/api/is-emirleri/yeni-numara', auth.authMiddleware(), async (req, res) => {
    try {
        const yil = new Date().getFullYear().toString().slice(-2);
        const sonIsEmri = await auth.prisma.isEmri.findFirst({
            where: { isEmriNo: { startsWith: `IE-${yil}-` } },
            orderBy: { isEmriNo: 'desc' }
        });

        let siraNo = 1;
        if (sonIsEmri) {
            const sonSira = parseInt(sonIsEmri.isEmriNo.split('-')[2]);
            siraNo = sonSira + 1;
        }

        const yeniNumara = `IE-${yil}-${siraNo.toString().padStart(4, '0')}`;
        res.json({ isEmriNo: yeniNumara });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// İş emri listesi
app.get('/api/is-emirleri', auth.authMiddleware(), async (req, res) => {
    try {
        const { durum } = req.query;
        const where = durum ? { durum } : {};

        const isEmirleri = await auth.prisma.isEmri.findMany({
            where,
            include: {
                customer: true,
                teklif: true,
                altGorevler: {
                    include: { personel: true, hizmet: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(isEmirleri);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Tek iş emri detay
app.get('/api/is-emirleri/:id', auth.authMiddleware(), async (req, res) => {
    try {
        const isEmri = await auth.prisma.isEmri.findUnique({
            where: { id: parseInt(req.params.id) },
            include: {
                customer: true,
                teklif: { include: { detaylar: { include: { hizmet: true } } } },
                altGorevler: {
                    include: { personel: true, hizmet: true },
                    orderBy: [{ kategori: 'asc' }, { siraNo: 'asc' }]
                }
            }
        });

        if (!isEmri) {
            return res.status(404).json({ error: 'İş emri bulunamadı' });
        }
        res.json(isEmri);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Tekliften iş emri oluştur
app.post('/api/is-emirleri/tekliften-olustur/:teklifId', auth.authMiddleware(), async (req, res) => {
    try {
        const teklifId = parseInt(req.params.teklifId);

        // Teklifi getir
        const teklif = await auth.prisma.teklif.findUnique({
            where: { id: teklifId },
            include: {
                customer: true,
                detaylar: { include: { hizmet: { include: { kategori: true } } } }
            }
        });

        if (!teklif) {
            return res.status(404).json({ error: 'Teklif bulunamadı' });
        }

        // Yeni iş emri numarası
        const yil = new Date().getFullYear().toString().slice(-2);
        const sonIsEmri = await auth.prisma.isEmri.findFirst({
            where: { isEmriNo: { startsWith: `IE-${yil}-` } },
            orderBy: { isEmriNo: 'desc' }
        });

        let siraNo = 1;
        if (sonIsEmri) {
            const sonSira = parseInt(sonIsEmri.isEmriNo.split('-')[2]);
            siraNo = sonSira + 1;
        }
        const isEmriNo = `IE-${yil}-${siraNo.toString().padStart(4, '0')}`;

        // Kategori -> Personel eşleştirmesi
        const personeller = await auth.prisma.personel.findMany({ where: { isActive: true } });
        const kategoriPersonelMap = {};
        personeller.forEach(p => {
            kategoriPersonelMap[p.kategori] = p;
        });

        // Alt görevleri hazırla (her hizmet miktarı kadar satır)
        const altGorevler = [];
        for (const detay of teklif.detaylar) {
            const kategoriAdi = detay.hizmet.kategori?.ad || 'Diger';

            // Kategori ismini personel kategorisine çevir
            let personelKategori = 'Mekanik';
            if (kategoriAdi.includes('ELEKTRİK')) personelKategori = 'Elektriksel';
            else if (kategoriAdi.includes('HİJYEN') || kategoriAdi.includes('ÖLÇÜM')) personelKategori = 'IsHijyeni';

            const atananPersonel = kategoriPersonelMap[personelKategori];

            // Miktar kadar alt görev oluştur
            for (let i = 1; i <= detay.miktar; i++) {
                altGorevler.push({
                    hizmetId: detay.hizmetId,
                    hizmetAdi: detay.hizmet.ad,
                    kategori: personelKategori,
                    siraNo: i,
                    ekipmanAdi: `${detay.hizmet.ad} - ${i}`,
                    durum: 'BEKLIYOR',
                    personelId: atananPersonel?.id || null,
                    personelAdi: atananPersonel?.adSoyad || null
                });
            }
        }

        // İş emri oluştur
        const isEmri = await auth.prisma.isEmri.create({
            data: {
                isEmriNo,
                teklifId: teklif.id,
                customerId: teklif.customerId,
                durum: 'BEKLIYOR',
                planliTarih: req.body.planliTarih ? new Date(req.body.planliTarih) : null,
                notlar: req.body.notlar || null,
                altGorevler: {
                    create: altGorevler
                }
            },
            include: {
                customer: true,
                teklif: true,
                altGorevler: { include: { personel: true } }
            }
        });

        // Teklif durumunu güncelle
        await auth.prisma.teklif.update({
            where: { id: teklifId },
            data: { durum: 'ONAYLANDI' }
        });

        res.json(isEmri);
    } catch (error) {
        console.error('İş emri oluşturma hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// İş emri durum güncelle
app.put('/api/is-emirleri/:id/durum', auth.authMiddleware(), async (req, res) => {
    try {
        const { durum } = req.body;
        const isEmri = await auth.prisma.isEmri.update({
            where: { id: parseInt(req.params.id) },
            data: {
                durum,
                ...(durum === 'SAHADA' ? { baslangicTarihi: new Date() } : {}),
                ...(durum === 'TAMAMLANDI' ? { bitisTarihi: new Date() } : {})
            }
        });
        res.json(isEmri);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// İş emri güncelle
app.put('/api/is-emirleri/:id', auth.authMiddleware(), async (req, res) => {
    try {
        const { planliTarih, notlar, durum } = req.body;
        const isEmri = await auth.prisma.isEmri.update({
            where: { id: parseInt(req.params.id) },
            data: {
                planliTarih: planliTarih ? new Date(planliTarih) : undefined,
                notlar,
                durum
            },
            include: { customer: true, altGorevler: true }
        });
        res.json(isEmri);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// İş emri sil
app.delete('/api/is-emirleri/:id', auth.authMiddleware(), async (req, res) => {
    try {
        await auth.prisma.isEmri.delete({
            where: { id: parseInt(req.params.id) }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== ALT GÖREV API ====================

// Tek alt görev getir
app.get('/api/alt-gorevler/:id', auth.authMiddleware(), async (req, res) => {
    try {
        const altGorev = await auth.prisma.altGorev.findUnique({
            where: { id: parseInt(req.params.id) },
            include: { personel: true, hizmet: true }
        });
        if (!altGorev) {
            return res.status(404).json({ error: 'Alt görev bulunamadı' });
        }
        res.json(altGorev);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Alt görev güncelle
app.put('/api/alt-gorevler/:id', auth.authMiddleware(), async (req, res) => {
    try {
        const { ekipmanAdi, ekipmanSeriNo, ekipmanKonum, ekipmanKapasite, ekipmanPlaka, durum, personelId, personelAdi, notlar, sahaFormu, raporNo } = req.body;

        // Personel adını belirle (gönderilmediyse veritabanından al)
        let finalPersonelAdi = personelAdi;
        if (personelId && !personelAdi) {
            const personel = await auth.prisma.personel.findUnique({ where: { id: personelId } });
            finalPersonelAdi = personel?.adSoyad || null;
        }

        const updateData = {
            ...(ekipmanAdi !== undefined && { ekipmanAdi }),
            ...(ekipmanSeriNo !== undefined && { ekipmanSeriNo }),
            ...(ekipmanKonum !== undefined && { ekipmanKonum }),
            ...(ekipmanKapasite !== undefined && { ekipmanKapasite }),
            ...(ekipmanPlaka !== undefined && { ekipmanPlaka }),
            ...(durum !== undefined && { durum }),
            ...(personelId !== undefined && { personelId }),
            ...(finalPersonelAdi !== undefined && { personelAdi: finalPersonelAdi }),
            ...(notlar !== undefined && { notlar }),
            ...(sahaFormu !== undefined && { sahaFormu }),
            ...(raporNo !== undefined && { raporNo }),
            ...(durum === 'TAMAMLANDI' ? { tamamlanmaTarihi: new Date() } : {})
        };

        const altGorev = await auth.prisma.altGorev.update({
            where: { id: parseInt(req.params.id) },
            data: updateData,
            include: { personel: true, hizmet: true }
        });
        res.json(altGorev);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Alt görev rapor numarası ata
app.put('/api/alt-gorevler/:id/rapor', auth.authMiddleware(), async (req, res) => {
    try {
        const { raporNo } = req.body;
        const altGorev = await auth.prisma.altGorev.update({
            where: { id: parseInt(req.params.id) },
            data: { raporNo, durum: 'RAPOR_YAZILDI' }
        });
        res.json(altGorev);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Alt görev saha formu kaydet (mobil için)
app.put('/api/alt-gorevler/:id/saha-formu', auth.authMiddleware(), async (req, res) => {
    try {
        const { sahaFormu, durum } = req.body;
        const altGorev = await auth.prisma.altGorev.update({
            where: { id: parseInt(req.params.id) },
            data: {
                sahaFormu: JSON.stringify(sahaFormu),
                durum: durum || 'TAMAMLANDI',
                tamamlanmaTarihi: new Date()
            }
        });
        res.json(altGorev);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Personelin görevleri (tekniker paneli için)
app.get('/api/personel/:personelId/gorevler', async (req, res) => {
    try {
        const { durum } = req.query; // Filtre: ATANDI, SAHADA, TAMAMLANDI veya hepsi için boş

        const whereClause = {
            personelId: parseInt(req.params.personelId)
        };

        // Durum filtresi
        if (durum && durum !== 'hepsi') {
            whereClause.durum = durum.toUpperCase();
        }

        const gorevler = await auth.prisma.altGorev.findMany({
            where: whereClause,
            include: {
                isEmri: {
                    include: {
                        customer: true,
                        teklif: { select: { teklifNo: true } }
                    }
                },
                hizmet: { include: { kategori: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(gorevler);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/dashboard/stats', auth.authMiddleware(), async (req, res) => {
    try {
        const thisMonth = new Date();
        thisMonth.setDate(1);
        thisMonth.setHours(0, 0, 0, 0);

        const [musteriSayisi, teklifSayisi, aylikTeklif, bekleyenTeklif, isEmriSayisi] = await Promise.all([
            auth.prisma.customer.count(),
            auth.prisma.teklif.count(),
            auth.prisma.teklif.count({ where: { createdAt: { gte: thisMonth } } }),
            auth.prisma.teklif.count({ where: { durum: 'TASLAK' } }),
            auth.prisma.workOrder.count().catch(() => 0)
        ]);

        const aylikCiro = await auth.prisma.teklif.aggregate({
            where: { createdAt: { gte: thisMonth } },
            _sum: { genelToplam: true }
        });

        res.json({
            musteriSayisi,
            teklifSayisi,
            aylikTeklif,
            bekleyenTeklif,
            isEmriSayisi,
            aylikCiro: aylikCiro._sum.genelToplam || 0
        });
    } catch (error) {
        res.status(500).json({ error: 'Dashboard verileri alınamadı' });
    }
});

app.get('/api/dashboard/son-teklifler', auth.authMiddleware(), async (req, res) => {
    try {
        const teklifler = await auth.prisma.teklif.findMany({
            orderBy: { createdAt: 'desc' },
            take: 5,
            include: { customer: { select: { unvan: true } } }
        });
        res.json(teklifler);
    } catch (error) {
        res.status(500).json({ error: 'Son teklifler alınamadı' });
    }
});

app.get('/api/personeller', auth.authMiddleware(), async (req, res) => {
    try {
        const users = await auth.prisma.user.findMany({
            select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true }
        });
        const personeller = users.map(u => ({
            id: u.id,
            adSoyad: u.name,
            email: u.email,
            unvan: u.role,
            aktif: u.isActive
        }));
        res.json(personeller);
    } catch (error) {
        console.error('Personel listesi hatası:', error);
        res.status(500).json({ error: 'Personeller alınamadı' });
    }
});

app.post('/api/personeller', auth.authMiddleware('admin'), async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        const hashedPassword = auth.hashPassword(password);
        const user = await auth.prisma.user.create({
            data: { name, email, password: hashedPassword, plainPassword: password, role: role || 'tekniker' }
        });
        res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
    } catch (error) {
        res.status(500).json({ error: 'Personel oluşturulamadı' });
    }
});

app.get('/api/sertifika-sablonlari', auth.authMiddleware(), async (req, res) => {
    try {
        res.json([
            { id: 1, ad: 'Elektrik Topraklama Raporu', kod: 'ET', aktif: true },
            { id: 2, ad: 'Mekanik Kontrol Raporu', kod: 'MEKANIK', aktif: true },
            { id: 3, ad: 'Yangın Söndürme Raporu', kod: 'YANGIN', aktif: false }
        ]);
    } catch (error) {
        res.status(500).json({ error: 'Şablonlar alınamadı' });
    }
});

// ============ TEKLİF EMAIL GÖNDERME ============

app.post('/api/teklifler/:id/send-email', auth.authMiddleware('admin'), async (req, res) => {
    try {
        const { customMessage, smtpConfig } = req.body;

        const teklif = await auth.prisma.teklif.findUnique({
            where: { id: parseInt(req.params.id) },
            include: {
                customer: true,
                detaylar: {
                    include: {
                        hizmet: {
                            include: { kategori: true }
                        }
                    }
                },
                olusturan: { select: { name: true } }
            }
        });

        if (!teklif) {
            return res.status(404).json({ error: 'Teklif bulunamadı' });
        }

        // Firma bilgilerini ekle
        const firma = await auth.prisma.firmaAyarlari.findFirst();
        teklif.firma = firma;

        if (!teklif.customer?.email || teklif.customer.email === '-') {
            return res.status(400).json({ error: 'Müşteri email adresi tanımlı değil' });
        }

        const smtp = smtpConfig || {
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.SMTP_PORT) || 587,
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        };

        if (!smtp.user || !smtp.pass) {
            return res.status(400).json({ error: 'Email ayarları yapılandırılmamış. Lütfen SMTP ayarlarını kontrol edin.' });
        }

        const result = await emailService.sendTeklifEmail(teklif, smtp, customMessage);

        await auth.prisma.teklif.update({
            where: { id: teklif.id },
            data: { durum: 'GONDERILDI' }
        });

        res.json({
            success: true,
            message: 'Teklif başarıyla gönderildi',
            to: result.to,
            messageId: result.messageId
        });

    } catch (error) {
        console.error('Email gönderme hatası:', error);
        res.status(500).json({ error: 'Email gönderilemedi: ' + error.message });
    }
});

app.post('/api/email/test', auth.authMiddleware('admin'), async (req, res) => {
    try {
        const { toEmail, smtpConfig } = req.body;

        const smtp = smtpConfig || {
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.SMTP_PORT) || 587,
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        };

        if (!smtp.user || !smtp.pass) {
            return res.status(400).json({ error: 'SMTP ayarları eksik' });
        }

        const result = await emailService.sendTestEmail(smtp, toEmail);
        res.json({ success: true, message: 'Test emaili gönderildi', messageId: result.messageId });

    } catch (error) {
        console.error('Test email hatası:', error);
        res.status(500).json({ error: 'Test emaili gönderilemedi: ' + error.message });
    }
});

app.get('/api/teklifler/:id/pdf-excel', auth.authMiddleware(), async (req, res) => {
    try {
        const teklif = await auth.prisma.teklif.findUnique({
            where: { id: parseInt(req.params.id) },
            include: {
                customer: true,
                detaylar: {
                    include: {
                        hizmet: {
                            include: { kategori: true }
                        }
                    }
                },
                olusturan: { select: { name: true } }
            }
        });

        if (!teklif) {
            return res.status(404).json({ error: 'Teklif bulunamadı' });
        }

        // Firma bilgilerini ekle
        const firma = await auth.prisma.firmaAyarlari.findFirst();
        teklif.firma = firma;

        const pdfBuffer = await emailService.createTeklifPDFBuffer(teklif);

        // Dosya adı: teklifNo_firmaAdi.pdf (ASCII karakterler)
        const firmaAdi2 = (teklif.customer?.unvan || 'Firma')
            .replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
            .replace(/ü/g, 'u').replace(/Ü/g, 'U')
            .replace(/ş/g, 's').replace(/Ş/g, 'S')
            .replace(/ı/g, 'i').replace(/İ/g, 'I')
            .replace(/ö/g, 'o').replace(/Ö/g, 'O')
            .replace(/ç/g, 'c').replace(/Ç/g, 'C')
            .replace(/[^a-zA-Z0-9 ]/g, '')
            .substring(0, 30).trim();
        const dosyaAdi2 = `${teklif.teklifNo}_${firmaAdi2}.pdf`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${dosyaAdi2}"`);
        res.send(pdfBuffer);

    } catch (error) {
        console.error('PDF oluşturma hatası:', error);
        res.status(500).json({ error: 'PDF oluşturulamadı' });
    }
});

// ===================== ÖLÇÜM CİHAZLARI =====================

// Tüm cihazları listele
app.get('/api/olcum-cihazlari', async (req, res) => {
    try {
        const cihazlar = await auth.prisma.olcumCihazi.findMany({
            orderBy: { createdAt: 'desc' }
        });
        res.json(cihazlar);
    } catch (error) {
        console.error('Ölçüm cihazları listeleme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Tek cihaz getir
app.get('/api/olcum-cihazlari/:id', async (req, res) => {
    try {
        const cihaz = await auth.prisma.olcumCihazi.findUnique({
            where: { id: parseInt(req.params.id) }
        });
        if (!cihaz) {
            return res.status(404).json({ error: 'Cihaz bulunamadı' });
        }
        res.json(cihaz);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Yeni cihaz ekle
app.post('/api/olcum-cihazlari', async (req, res) => {
    try {
        const cihaz = await auth.prisma.olcumCihazi.create({
            data: req.body
        });
        res.json(cihaz);
    } catch (error) {
        console.error('Cihaz ekleme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Cihaz güncelle
app.put('/api/olcum-cihazlari/:id', async (req, res) => {
    try {
        const cihaz = await auth.prisma.olcumCihazi.update({
            where: { id: parseInt(req.params.id) },
            data: req.body
        });
        res.json(cihaz);
    } catch (error) {
        console.error('Cihaz güncelleme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Cihaz sil
app.delete('/api/olcum-cihazlari/:id', async (req, res) => {
    try {
        await auth.prisma.olcumCihazi.delete({
            where: { id: parseInt(req.params.id) }
        });
        res.json({ success: true });
    } catch (error) {
        console.error('Cihaz silme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Kalibrasyon süresi dolan/dolacak cihazlar (30 gün içinde)
app.get('/api/olcum-cihazlari-kalibrasyon-uyari', async (req, res) => {
    try {
        const bugun = new Date();
        const otuzGunSonra = new Date();
        otuzGunSonra.setDate(otuzGunSonra.getDate() + 30);

        const cihazlar = await auth.prisma.olcumCihazi.findMany({
            where: {
                isActive: true,
                kalibrasyonGecerlilik: {
                    lte: otuzGunSonra
                }
            },
            orderBy: { kalibrasyonGecerlilik: 'asc' }
        });
        res.json(cihazlar);
    } catch (error) {
        console.error('Kalibrasyon uyarı hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// ===================== İŞ EMRİ FİRMA BİLGİLERİ =====================

// Firma bilgisi getir
app.get('/api/is-emirleri/:id/firma-bilgi', async (req, res) => {
    try {
        const firmaBilgi = await auth.prisma.isEmriFirmaBilgi.findUnique({
            where: { isEmriId: parseInt(req.params.id) }
        });
        res.json(firmaBilgi || {});
    } catch (error) {
        console.error('Firma bilgi getirme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Firma bilgisi kaydet/güncelle
app.post('/api/is-emirleri/:id/firma-bilgi', async (req, res) => {
    try {
        const isEmriId = parseInt(req.params.id);
        const firmaBilgi = await auth.prisma.isEmriFirmaBilgi.upsert({
            where: { isEmriId: isEmriId },
            update: req.body,
            create: { ...req.body, isEmriId: isEmriId }
        });
        res.json(firmaBilgi);
    } catch (error) {
        console.error('Firma bilgi kaydetme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// ===================== TOPRAKLAMA ÖLÇÜMLERİ =====================

// Topraklama ölçümleri getir
app.get('/api/alt-gorevler/:id/topraklama-olcumler', async (req, res) => {
    try {
        const olcumler = await auth.prisma.topraklamaOlcum.findMany({
            where: { altGorevId: parseInt(req.params.id) },
            include: { cihaz: true },
            orderBy: { siraNo: 'asc' }
        });
        res.json(olcumler);
    } catch (error) {
        console.error('Topraklama ölçümleri getirme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Topraklama ölçüm ekle
app.post('/api/alt-gorevler/:id/topraklama-olcumler', async (req, res) => {
    try {
        const altGorevId = parseInt(req.params.id);

        // Sıra numarası bul
        const sonOlcum = await auth.prisma.topraklamaOlcum.findFirst({
            where: { altGorevId },
            orderBy: { siraNo: 'desc' }
        });
        const siraNo = (sonOlcum?.siraNo || 0) + 1;

        const olcum = await auth.prisma.topraklamaOlcum.create({
            data: { ...req.body, altGorevId, siraNo }
        });
        res.json(olcum);
    } catch (error) {
        console.error('Topraklama ölçüm ekleme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Topraklama ölçüm güncelle
app.put('/api/topraklama-olcumler/:id', async (req, res) => {
    try {
        const olcum = await auth.prisma.topraklamaOlcum.update({
            where: { id: parseInt(req.params.id) },
            data: req.body
        });
        res.json(olcum);
    } catch (error) {
        console.error('Topraklama ölçüm güncelleme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Topraklama ölçüm sil
app.delete('/api/topraklama-olcumler/:id', async (req, res) => {
    try {
        await auth.prisma.topraklamaOlcum.delete({
            where: { id: parseInt(req.params.id) }
        });
        res.json({ success: true });
    } catch (error) {
        console.error('Topraklama ölçüm silme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Ölçüm cihazlarını kategori ile getir
app.get('/api/olcum-cihazlari/kategori/:kategori', async (req, res) => {
    try {
        const cihazlar = await auth.prisma.olcumCihazi.findMany({
            where: {
                kategori: req.params.kategori,
                isActive: true
            },
            orderBy: { cihazAdi: 'asc' }
        });
        res.json(cihazlar);
    } catch (error) {
        console.error('Cihaz kategori getirme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ ŞABLON YÖNETİMİ API ============

const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');

// Şablon listesi
app.get('/api/sablonlar', auth.authMiddleware(), async (req, res) => {
    try {
        const { kategori, aktif } = req.query;
        const where = {};

        if (kategori) where.kategori = kategori;
        if (aktif !== undefined) where.aktif = aktif === 'true';

        const sablonlar = await auth.prisma.sablon.findMany({
            where,
            orderBy: [{ kategori: 'asc' }, { sira: 'asc' }, { ad: 'asc' }]
        });
        res.json(sablonlar);
    } catch (error) {
        console.error('Şablon listesi hatası:', error);
        res.status(500).json({ error: 'Şablonlar alınamadı' });
    }
});

// Tek şablon getir
app.get('/api/sablonlar/:id', auth.authMiddleware(), async (req, res) => {
    try {
        const sablon = await auth.prisma.sablon.findUnique({
            where: { id: parseInt(req.params.id) }
        });
        if (!sablon) {
            return res.status(404).json({ error: 'Şablon bulunamadı' });
        }
        res.json(sablon);
    } catch (error) {
        console.error('Şablon getirme hatası:', error);
        res.status(500).json({ error: 'Şablon alınamadı' });
    }
});

// Şablon kategorileri
app.get('/api/sablon-kategorileri', auth.authMiddleware(), async (req, res) => {
    try {
        const kategoriler = await auth.prisma.sablon.groupBy({
            by: ['kategori'],
            _count: { id: true },
            orderBy: { kategori: 'asc' }
        });
        res.json(kategoriler.map(k => ({
            kategori: k.kategori,
            adet: k._count.id
        })));
    } catch (error) {
        console.error('Kategori listesi hatası:', error);
        res.status(500).json({ error: 'Kategoriler alınamadı' });
    }
});

// Yeni şablon ekle
app.post('/api/sablonlar', auth.authMiddleware('admin'), async (req, res) => {
    try {
        const { kod, ad, aciklama, kategori, dosyaYolu, dosyaAdi, dosyaBoyutu, tabloSayisi, alanlar, aktif } = req.body;

        // Kod benzersiz olmalı
        const mevcut = await auth.prisma.sablon.findUnique({ where: { kod } });
        if (mevcut) {
            return res.status(400).json({ error: 'Bu kod zaten kullanılıyor' });
        }

        const sablon = await auth.prisma.sablon.create({
            data: {
                kod,
                ad,
                aciklama,
                kategori,
                dosyaYolu,
                dosyaAdi: dosyaAdi || kod + '.docx',
                dosyaBoyutu: dosyaBoyutu || 0,
                tabloSayisi: tabloSayisi || 0,
                alanlar: alanlar || {},
                aktif: aktif !== false
            }
        });
        res.json(sablon);
    } catch (error) {
        console.error('Şablon ekleme hatası:', error);
        res.status(500).json({ error: 'Şablon eklenemedi: ' + error.message });
    }
});

// Şablon güncelle
app.put('/api/sablonlar/:id', auth.authMiddleware('admin'), async (req, res) => {
    try {
        const { kod, ad, aciklama, kategori, dosyaYolu, alanlar, varsayilanDeger, aktif, sira } = req.body;

        const sablon = await auth.prisma.sablon.update({
            where: { id: parseInt(req.params.id) },
            data: {
                ...(kod && { kod }),
                ...(ad && { ad }),
                ...(aciklama !== undefined && { aciklama }),
                ...(kategori && { kategori }),
                ...(dosyaYolu && { dosyaYolu }),
                ...(alanlar && { alanlar }),
                ...(varsayilanDeger && { varsayilanDeger }),
                ...(aktif !== undefined && { aktif }),
                ...(sira !== undefined && { sira })
            }
        });
        res.json(sablon);
    } catch (error) {
        console.error('Şablon güncelleme hatası:', error);
        res.status(500).json({ error: 'Şablon güncellenemedi' });
    }
});

// Şablon sil
app.delete('/api/sablonlar/:id', auth.authMiddleware('admin'), async (req, res) => {
    try {
        await auth.prisma.sablon.delete({
            where: { id: parseInt(req.params.id) }
        });
        res.json({ success: true });
    } catch (error) {
        console.error('Şablon silme hatası:', error);
        res.status(500).json({ error: 'Şablon silinemedi' });
    }
});

// Şablon dosyası yükle (Word)
const sablonStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const kategori = req.body.kategori || 'genel';
        const uploadDir = path.join(__dirname, 'templates', kategori);
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Orijinal dosya adını koru
        cb(null, file.originalname);
    }
});
const sablonUpload = multer({
    storage: sablonStorage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            cb(null, true);
        } else {
            cb(new Error('Sadece .docx dosyaları yüklenebilir'), false);
        }
    }
});

app.post('/api/sablonlar/yukle', auth.authMiddleware('admin'), sablonUpload.single('dosya'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Dosya yüklenmedi' });
        }

        const { kategori, kod, ad } = req.body;
        const dosyaYolu = path.join('templates', kategori || 'genel', req.file.filename);

        // Word dosyasını analiz et
        const content = fs.readFileSync(req.file.path);
        const zip = new PizZip(content);
        const documentXml = zip.file('word/document.xml');

        let tabloSayisi = 0;
        let alanlar = {};

        if (documentXml) {
            const xmlContent = documentXml.asText();
            const tableMatches = xmlContent.match(/<w:tbl>/g) || [];
            tabloSayisi = tableMatches.length;

            // Placeholder'ları bul
            const textMatches = xmlContent.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
            const fullText = textMatches.map(m => m.replace(/<w:t[^>]*>/, '').replace(/<\/w:t>/, '')).join('');
            const placeholderMatches = fullText.match(/\{\{([^}]+)\}\}/g) || [];
            placeholderMatches.forEach(p => {
                const key = p.replace(/\{\{|\}\}/g, '').trim();
                alanlar[key] = { label: key, type: 'text' };
            });
        }

        // Veritabanına kaydet
        const sablon = await auth.prisma.sablon.create({
            data: {
                kod: kod || req.file.filename.replace('.docx', ''),
                ad: ad || req.file.filename.replace('.docx', ''),
                kategori: kategori || 'Genel',
                dosyaYolu,
                dosyaAdi: req.file.filename,
                dosyaBoyutu: req.file.size,
                tabloSayisi,
                alanlar
            }
        });

        res.json({
            success: true,
            sablon,
            message: 'Şablon başarıyla yüklendi'
        });

    } catch (error) {
        console.error('Şablon yükleme hatası:', error);
        res.status(500).json({ error: 'Şablon yüklenemedi: ' + error.message });
    }
});

// Şablon alanlarını analiz et
app.get('/api/sablonlar/:id/analiz', auth.authMiddleware(), async (req, res) => {
    try {
        const sablon = await auth.prisma.sablon.findUnique({
            where: { id: parseInt(req.params.id) }
        });

        if (!sablon) {
            return res.status(404).json({ error: 'Şablon bulunamadı' });
        }

        const dosyaYolu = path.join(__dirname, sablon.dosyaYolu);
        if (!fs.existsSync(dosyaYolu)) {
            return res.status(404).json({ error: 'Şablon dosyası bulunamadı' });
        }

        const content = fs.readFileSync(dosyaYolu);
        const zip = new PizZip(content);
        const documentXml = zip.file('word/document.xml');

        if (!documentXml) {
            return res.status(400).json({ error: 'Geçersiz Word dosyası' });
        }

        const xmlContent = documentXml.asText();

        // Tablo yapısını analiz et
        const tables = [];
        const tableMatches = xmlContent.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) || [];

        tableMatches.forEach((tableXml, index) => {
            const rows = [];
            const rowMatches = tableXml.match(/<w:tr[^>]*>[\s\S]*?<\/w:tr>/g) || [];

            rowMatches.forEach(rowXml => {
                const cells = [];
                const cellMatches = rowXml.match(/<w:tc[^>]*>[\s\S]*?<\/w:tc>/g) || [];

                cellMatches.forEach(cellXml => {
                    const textMatches = cellXml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
                    const cellText = textMatches.map(m => m.replace(/<w:t[^>]*>/, '').replace(/<\/w:t>/, '')).join('');
                    cells.push(cellText.trim());
                });

                if (cells.some(c => c.length > 0)) {
                    rows.push(cells);
                }
            });

            tables.push({ index: index + 1, rows: rows.slice(0, 10) }); // İlk 10 satır
        });

        // Placeholder'ları bul
        const textMatches = xmlContent.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
        const fullText = textMatches.map(m => m.replace(/<w:t[^>]*>/, '').replace(/<\/w:t>/, '')).join('');
        const placeholders = [];
        const regex = /\{\{([^}]+)\}\}/g;
        let match;
        while ((match = regex.exec(fullText)) !== null) {
            placeholders.push(match[1].trim());
        }

        res.json({
            sablon: {
                id: sablon.id,
                kod: sablon.kod,
                ad: sablon.ad
            },
            analiz: {
                tabloSayisi: tables.length,
                tables,
                placeholders: [...new Set(placeholders)],
                textOnizleme: fullText.substring(0, 1000)
            }
        });

    } catch (error) {
        console.error('Şablon analiz hatası:', error);
        res.status(500).json({ error: 'Şablon analiz edilemedi: ' + error.message });
    }
});

// Şablondan rapor üret
app.post('/api/sablonlar/:id/rapor-uret', auth.authMiddleware(), async (req, res) => {
    try {
        const { formVerileri, customerId, isEmriId, altGorevId } = req.body;

        const sablon = await auth.prisma.sablon.findUnique({
            where: { id: parseInt(req.params.id) }
        });

        if (!sablon) {
            return res.status(404).json({ error: 'Şablon bulunamadı' });
        }

        const dosyaYolu = path.join(__dirname, sablon.dosyaYolu);
        if (!fs.existsSync(dosyaYolu)) {
            return res.status(404).json({ error: 'Şablon dosyası bulunamadı' });
        }

        // Word şablonunu oku
        const content = fs.readFileSync(dosyaYolu, 'binary');
        const zip = new PizZip(content);

        // Docxtemplater ile doldur
        const doc = new Docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
            delimiters: { start: '{{', end: '}}' }
        });

        // Verileri doldur
        doc.render(formVerileri || {});

        // Yeni Word dosyasını oluştur
        const buf = doc.getZip().generate({ type: 'nodebuffer' });

        // Rapor numarası oluştur
        const year = new Date().getFullYear();
        const count = await auth.prisma.uretilenRapor.count({
            where: { sablonId: sablon.id }
        });
        const raporNo = `${sablon.kod}-${year}-${String(count + 1).padStart(4, '0')}`;

        // Dosyayı kaydet
        const raporlarDir = path.join(__dirname, 'storage', 'raporlar', String(year));
        if (!fs.existsSync(raporlarDir)) {
            fs.mkdirSync(raporlarDir, { recursive: true });
        }

        const wordDosyasi = path.join(raporlarDir, `${raporNo}.docx`);
        fs.writeFileSync(wordDosyasi, buf);

        // Veritabanına kaydet
        const rapor = await auth.prisma.uretilenRapor.create({
            data: {
                raporNo,
                sablonId: sablon.id,
                customerId: customerId ? parseInt(customerId) : null,
                isEmriId: isEmriId ? parseInt(isEmriId) : null,
                altGorevId: altGorevId ? parseInt(altGorevId) : null,
                formVerileri: formVerileri || {},
                olusturanId: req.user?.id || null,
                wordDosyasi: `storage/raporlar/${year}/${raporNo}.docx`
            }
        });

        res.json({
            success: true,
            rapor,
            downloadUrl: `/api/raporlar/${rapor.id}/indir`
        });

    } catch (error) {
        console.error('Rapor üretme hatası:', error);
        res.status(500).json({ error: 'Rapor üretilemedi: ' + error.message });
    }
});

// Üretilen raporları listele
app.get('/api/uretilen-raporlar', auth.authMiddleware(), async (req, res) => {
    try {
        const { sablonId, customerId, limit = 50 } = req.query;
        const where = {};

        if (sablonId) where.sablonId = parseInt(sablonId);
        if (customerId) where.customerId = parseInt(customerId);

        const raporlar = await auth.prisma.uretilenRapor.findMany({
            where,
            include: {
                sablon: { select: { kod: true, ad: true, kategori: true } }
            },
            orderBy: { createdAt: 'desc' },
            take: parseInt(limit)
        });

        res.json(raporlar);
    } catch (error) {
        console.error('Rapor listesi hatası:', error);
        res.status(500).json({ error: 'Raporlar alınamadı' });
    }
});

// Rapor indir
app.get('/api/raporlar/:id/indir', auth.authMiddleware(), async (req, res) => {
    try {
        const rapor = await auth.prisma.uretilenRapor.findUnique({
            where: { id: parseInt(req.params.id) },
            include: { sablon: true }
        });

        if (!rapor) {
            return res.status(404).json({ error: 'Rapor bulunamadı' });
        }

        const dosyaYolu = path.join(__dirname, rapor.wordDosyasi);
        if (!fs.existsSync(dosyaYolu)) {
            return res.status(404).json({ error: 'Rapor dosyası bulunamadı' });
        }

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${rapor.raporNo}.docx"`);
        res.sendFile(dosyaYolu);

    } catch (error) {
        console.error('Rapor indirme hatası:', error);
        res.status(500).json({ error: 'Rapor indirilemedi' });
    }
});

// Mevcut şablonları tara ve veritabanına ekle
app.post('/api/sablonlar/tara', auth.authMiddleware('admin'), async (req, res) => {
    try {
        const templatesDir = path.join(__dirname, 'templates');
        const sonuclar = { eklenen: [], atlanan: [], hatalar: [] };

        // Kategori klasörlerini tara
        const kategoriler = fs.readdirSync(templatesDir).filter(f => {
            return fs.statSync(path.join(templatesDir, f)).isDirectory();
        });

        for (const kategori of kategoriler) {
            const kategoriDir = path.join(templatesDir, kategori);
            const dosyalar = fs.readdirSync(kategoriDir).filter(f => f.endsWith('.docx'));

            for (const dosya of dosyalar) {
                try {
                    // Kod çıkar (FR7.2.36 gibi)
                    const kodMatch = dosya.match(/^(FR[\d.]+)/);
                    const kod = kodMatch ? kodMatch[1] : dosya.replace('.docx', '');

                    // Zaten var mı kontrol et
                    const mevcut = await auth.prisma.sablon.findUnique({ where: { kod } });
                    if (mevcut) {
                        sonuclar.atlanan.push({ dosya, sebep: 'Zaten mevcut' });
                        continue;
                    }

                    // Dosyayı analiz et
                    const dosyaYolu = path.join(kategoriDir, dosya);
                    const content = fs.readFileSync(dosyaYolu);
                    const stats = fs.statSync(dosyaYolu);
                    const zip = new PizZip(content);
                    const documentXml = zip.file('word/document.xml');

                    let tabloSayisi = 0;
                    if (documentXml) {
                        const xmlContent = documentXml.asText();
                        tabloSayisi = (xmlContent.match(/<w:tbl>/g) || []).length;
                    }

                    // Ad oluştur
                    const ad = dosya
                        .replace(/^FR[\d.]+\s*/, '')
                        .replace(/\.docx$/i, '')
                        .replace(/\s*-\s*\d+$/, '')
                        .replace(/\s*\(\d+\)$/, '')
                        .trim();

                    // Veritabanına ekle
                    const sablon = await auth.prisma.sablon.create({
                        data: {
                            kod,
                            ad: ad || kod,
                            kategori: kategori.charAt(0).toUpperCase() + kategori.slice(1),
                            dosyaYolu: `templates/${kategori}/${dosya}`,
                            dosyaAdi: dosya,
                            dosyaBoyutu: stats.size,
                            tabloSayisi,
                            alanlar: {}
                        }
                    });

                    sonuclar.eklenen.push({ id: sablon.id, kod, ad: sablon.ad });

                } catch (err) {
                    sonuclar.hatalar.push({ dosya, hata: err.message });
                }
            }
        }

        res.json({
            success: true,
            ozet: {
                eklenen: sonuclar.eklenen.length,
                atlanan: sonuclar.atlanan.length,
                hata: sonuclar.hatalar.length
            },
            detay: sonuclar
        });

    } catch (error) {
        console.error('Şablon tarama hatası:', error);
        res.status(500).json({ error: 'Şablonlar taranamadı: ' + error.message });
    }
});

// ============ STATIK SAYFALAR ============

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// ============ SERVER START ============

app.listen(PORT, '0.0.0.0', () => {
    console.log('===========================================');
    console.log('ÖNDER MUAYENE - PERİYODİK MUAYENE SİSTEMİ');
    console.log('===========================================');
    console.log('Server: http://localhost:' + PORT);
    console.log('Başlatma:', new Date().toLocaleString('tr-TR'));
    console.log('===========================================');
});
