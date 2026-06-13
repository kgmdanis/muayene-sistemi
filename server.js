const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { execFile } = require('child_process');
const { promisify } = require('util');
const crypto = require('crypto');
const execFileAsync = promisify(execFile);
const mammoth = require('mammoth');
const auth = require('./auth');
const reportEngine = require('./reports');
const emailService = require('./emailService');
const wordTemplateService = require('./wordTemplateService');

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
        // Path traversal koruması: dizin bileşenlerini at, sadece dosya adını kullan
        cb(null, path.basename(file.originalname));
    }
});
const upload = multer({
    storage: storage,
    limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit
    fileFilter: (req, file, cb) => {
        // Sadece Word şablonları (.doc/.docx)
        if (/\.docx?$/i.test(file.originalname)) {
            cb(null, true);
        } else {
            cb(new Error('Sadece Word (.doc/.docx) şablon dosyaları yüklenebilir'));
        }
    }
});

// Sertifika dosyaları için multer konfigürasyonu
const sertifikaStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'public', 'uploads', 'sertifikalar');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'sertifika-' + uniqueSuffix + ext);
    }
});
const sertifikaUpload = multer({
    storage: sertifikaStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Sadece PDF ve resim dosyaları yüklenebilir'));
        }
    }
});

// Sistem dosyaları için multer konfigürasyonu
const dosyaStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'public', 'uploads', 'dosyalar');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'dosya-' + uniqueSuffix + ext);
    }
});
const dosyaUpload = multer({
    storage: dosyaStorage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Sadece PDF ve resim dosyaları yüklenebilir'));
        }
    }
});

// Middleware
// CORS: CORS_ORIGIN env'i tanımlıysa (virgülle ayrılmış) yalnızca o origin'lere izin ver,
// tanımsızsa tüm origin'lere izin ver (geriye dönük uyumluluk). Üretimde CORS_ORIGIN ayarlanmalı.
const corsOrigin = process.env.CORS_ORIGIN;
app.use(cors(corsOrigin ? { origin: corsOrigin.split(',').map(s => s.trim()) } : {}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public', {
    setHeaders: (res, filePath) => {
        // HTML dosyaları her zaman tazelensin (cache sorunlarını önler)
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
}));

// === GLOBAL API KORUMASI ===
// Aşağıdaki public route'lar hariç TÜM /api endpoint'leri geçerli token ister.
// (Daha önce 94 endpoint korumasızdı — bu middleware hepsini tek noktadan korur.)
const PUBLIC_API_PATHS = new Set([
    '/auth/login',
    '/auth/personel-login',
    '/auth/logout',
    '/auth/forgot-password',
    '/auth/reset-password'
]);
const requireAuth = auth.authMiddleware();
app.use('/api', (req, res, next) => {
    if (req.method === 'OPTIONS') return next();          // CORS preflight
    if (PUBLIC_API_PATHS.has(req.path)) return next();    // public auth route'ları
    return requireAuth(req, res, next);
});

// Şablon dosyası yükleme endpoint'i (sadece admin)
app.post('/api/upload-template', auth.authMiddleware('admin'), upload.single('file'), (req, res) => {
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

// Personel Login (email ile)
app.post('/api/auth/personel-login', async (req, res) => {
    const { email, username, password } = req.body;
    // Hem email hem username destekle (geriye uyumluluk)
    const loginEmail = email || username;
    if (!loginEmail || !password) {
        return res.status(400).json({ error: 'Email ve şifre gerekli' });
    }
    const result = await auth.personelLogin(loginEmail, password);
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

app.post('/api/kategoriler', auth.authMiddleware('admin'), async (req, res) => {
    try {
        const { ad } = req.body;
        if (!ad) return res.status(400).json({ error: 'Kategori adı zorunludur' });

        const maxSira = await auth.prisma.kategori.aggregate({ _max: { sira: true } });
        const kategori = await auth.prisma.kategori.create({
            data: { ad, sira: (maxSira._max.sira || 0) + 1 }
        });
        res.json(kategori);
    } catch (error) {
        res.status(500).json({ error: 'Kategori eklenemedi' });
    }
});

app.put('/api/kategoriler/:id', auth.authMiddleware('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { ad } = req.body;
        if (!ad) return res.status(400).json({ error: 'Kategori adı zorunludur' });

        const kategori = await auth.prisma.kategori.update({
            where: { id: parseInt(id) },
            data: { ad }
        });
        res.json(kategori);
    } catch (error) {
        res.status(500).json({ error: 'Kategori güncellenemedi' });
    }
});

app.delete('/api/kategoriler/:id', auth.authMiddleware('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        // Önce kategorideki hizmetleri sil
        await auth.prisma.hizmet.deleteMany({ where: { kategoriId: parseInt(id) } });
        // Sonra kategoriyi sil
        await auth.prisma.kategori.delete({ where: { id: parseInt(id) } });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Kategori silinemedi' });
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

// Distinct metod/standart listesi (item 3 - seçmeli metod/standart)
app.get('/api/hizmet-metodlar', auth.authMiddleware(), async (req, res) => {
    try {
        const hizmetler = await auth.prisma.hizmet.findMany({
            select: { metodKapsam: true, standartYonetmelik: true }
        });
        const metodlar = [...new Set(hizmetler.map(h => h.metodKapsam).filter(Boolean))].sort();
        const standartlar = [...new Set(hizmetler.map(h => h.standartYonetmelik).filter(Boolean))].sort();
        res.json({ metodlar, standartlar });
    } catch (error) {
        res.status(500).json({ error: 'Metod/standart listesi alınamadı' });
    }
});

app.post('/api/hizmetler', auth.authMiddleware('admin'), async (req, res) => {
    try {
        const body = req.body || {};

        // Kategori: id veya isim olarak gelebilir. İsimse bul, yoksa oluştur.
        let kategoriId = body.kategoriId ? parseInt(body.kategoriId) : null;
        if (!kategoriId && body.kategori) {
            const kategoriAdi = String(body.kategori).trim();
            let kategori = await auth.prisma.kategori.findFirst({ where: { ad: kategoriAdi } });
            if (!kategori) {
                kategori = await auth.prisma.kategori.create({ data: { ad: kategoriAdi } });
            }
            kategoriId = kategori.id;
        }
        if (!kategoriId) {
            return res.status(400).json({ error: 'Kategori belirtilmeli' });
        }

        const ad = (body.ad || '').trim();
        if (!ad) {
            return res.status(400).json({ error: 'Hizmet adı belirtilmeli' });
        }

        // Benzersiz kod üret (mevcut format: HZM-{kategoriId}-{timestamp})
        const kod = body.kod && String(body.kod).trim()
            ? String(body.kod).trim()
            : `HZM-${kategoriId}-${Date.now()}`;

        const hizmet = await auth.prisma.hizmet.create({
            data: {
                kod,
                ad,
                kategoriId,
                metodKapsam: body.metodKapsam ?? body.metod ?? null,
                standartYonetmelik: body.standartYonetmelik ?? body.standart ?? null,
                birim: body.birim || 'Adet',
                birimFiyat: parseFloat(body.birimFiyat ?? body.fiyat ?? 0) || 0,
                sablonKodlari: body.sablonKodlari ?? null
            },
            include: { kategori: true }
        });
        res.json({ success: true, hizmet });
    } catch (error) {
        console.error('❌ Hizmet ekleme hatası:', error);
        res.status(500).json({ error: 'Hizmet eklenemedi: ' + error.message });
    }
});

app.put('/api/hizmetler/:id', auth.authMiddleware('admin'), async (req, res) => {
    try {
        const body = req.body || {};
        const data = {};

        // Kategori (id veya isim)
        if (body.kategoriId) data.kategoriId = parseInt(body.kategoriId);
        else if (body.kategori) {
            const kategoriAdi = String(body.kategori).trim();
            let kategori = await auth.prisma.kategori.findFirst({ where: { ad: kategoriAdi } });
            if (!kategori) kategori = await auth.prisma.kategori.create({ data: { ad: kategoriAdi } });
            data.kategoriId = kategori.id;
        }

        if (body.ad !== undefined) data.ad = String(body.ad).trim();
        if (body.metodKapsam !== undefined || body.metod !== undefined) data.metodKapsam = body.metodKapsam ?? body.metod ?? null;
        if (body.standartYonetmelik !== undefined || body.standart !== undefined) data.standartYonetmelik = body.standartYonetmelik ?? body.standart ?? null;
        if (body.birim !== undefined) data.birim = body.birim;
        if (body.birimFiyat !== undefined || body.fiyat !== undefined) data.birimFiyat = parseFloat(body.birimFiyat ?? body.fiyat ?? 0) || 0;
        if (body.sablonKodlari !== undefined) data.sablonKodlari = body.sablonKodlari || null;
        if (body.isActive !== undefined) data.isActive = !!body.isActive;
        if (body.sira !== undefined) data.sira = parseInt(body.sira) || 0;

        const hizmet = await auth.prisma.hizmet.update({
            where: { id: parseInt(req.params.id) },
            data,
            include: { kategori: true }
        });
        res.json({ success: true, hizmet });
    } catch (error) {
        console.error('❌ Hizmet güncelleme hatası:', error);
        res.status(500).json({ error: 'Hizmet güncellenemedi: ' + error.message });
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

// Teklif listesi (Sadece Admin)
app.get('/api/teklifler', auth.authMiddleware('admin'), async (req, res) => {
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

// Yeni teklif numarası oluştur (Sadece Admin)
app.get('/api/teklifler/yeni-numara', auth.authMiddleware('admin'), async (req, res) => {
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

// Tek teklif detayı (Sadece Admin)
app.get('/api/teklifler/:id', auth.authMiddleware('admin'), async (req, res) => {
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

// Teklif oluştur (Sadece Admin)
app.post('/api/teklifler', auth.authMiddleware('admin'), async (req, res) => {
    try {
        const { customerId, teklifNo, teklifTarihi, konu, detaylar, iskontoOran, kdvOrani: girilenKdvOrani, notlar, onayTelefon, sahadaOnay, gecerlilikGun } = req.body;

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
                teklifTarihi: teklifTarihi ? new Date(teklifTarihi) : new Date(),
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
    'Bekleyen': 'TASLAK',
    'Gönderildi': 'GONDERILDI',
    'Revize': 'REVIZE',
    'Revize Edildi': 'REVIZE',
    'Onaylandı': 'ONAYLANDI',
    'Reddedildi': 'REDDEDILDI',
    'İptal': 'IPTAL',
    // Enum değerleri de kabul et
    'TASLAK': 'TASLAK',
    'GONDERILDI': 'GONDERILDI',
    'REVIZE': 'REVIZE',
    'ONAYLANDI': 'ONAYLANDI',
    'REDDEDILDI': 'REDDEDILDI',
    'IPTAL': 'IPTAL'
};

// Teklif güncelle (Sadece Admin)
// Teklif güncellendiğinde bağlı iş emrinin alt görevlerini senkronize et (item 7).
// GÜVENLİK: Tamamlanmış (durum != BEKLIYOR) veya raporu olan alt görevler ASLA silinmez.
// Sadece BEKLIYOR + raporsuz alt görevler eklenir/çıkarılır.
async function syncIsEmriAltGorevler(teklifId) {
    const isEmirleri = await auth.prisma.isEmri.findMany({
        where: { teklifId },
        include: { altGorevler: true }
    });
    if (isEmirleri.length === 0) return { synced: false };

    const teklif = await auth.prisma.teklif.findUnique({
        where: { id: teklifId },
        include: { detaylar: { include: { hizmet: { include: { kategori: true } } } } }
    });

    // İstenen miktarlar: hizmetId -> { miktar, hizmet }
    const istenen = new Map();
    for (const d of teklif.detaylar) {
        istenen.set(d.hizmetId, { miktar: d.miktar, hizmet: d.hizmet });
    }

    // Aktif personel kategori haritası
    const personeller = await auth.prisma.personel.findMany({ where: { isActive: true } });
    const kategoriPersonelMap = {};
    personeller.forEach(p => { kategoriPersonelMap[p.kategori] = p; });
    const personelKategoriBelirle = (kategoriAdi) => {
        if (!kategoriAdi) return 'Mekanik';
        if (kategoriAdi.includes('Elektrik')) return 'Elektriksel';
        if (kategoriAdi.includes('Hijyen') || kategoriAdi.includes('Ölçüm')) return 'IsHijyeni';
        return 'Mekanik';
    };
    const isLocked = (ag) => (ag.durum && ag.durum !== 'BEKLIYOR') || !!ag.raporNo;

    let eklenen = 0, silinen = 0, korunan = 0;

    for (const isEmri of isEmirleri) {
        const byHizmet = new Map();
        for (const ag of isEmri.altGorevler) {
            if (!byHizmet.has(ag.hizmetId)) byHizmet.set(ag.hizmetId, []);
            byHizmet.get(ag.hizmetId).push(ag);
        }

        const eklenecekler = [];
        const silinecekIdler = [];

        for (const [hizmetId, { miktar, hizmet }] of istenen) {
            const mevcut = byHizmet.get(hizmetId) || [];
            const locked = mevcut.filter(isLocked);
            const free = mevcut.filter(ag => !isLocked(ag));
            korunan += locked.length;
            const toplamVar = locked.length + free.length;

            if (toplamVar < miktar) {
                const personelKategori = personelKategoriBelirle(hizmet.kategori?.ad);
                const atanan = kategoriPersonelMap[personelKategori];
                let maxSira = 0;
                mevcut.forEach(ag => { if (ag.siraNo > maxSira) maxSira = ag.siraNo; });
                for (let i = 0; i < miktar - toplamVar; i++) {
                    maxSira++;
                    eklenecekler.push({
                        isEmriId: isEmri.id,
                        hizmetId,
                        hizmetAdi: hizmet.ad,
                        kategori: personelKategori,
                        siraNo: maxSira,
                        ekipmanAdi: `${hizmet.ad} - ${maxSira}`,
                        durum: 'BEKLIYOR',
                        personelId: atanan?.id || null,
                        personelAdi: atanan?.adSoyad || null
                    });
                }
            } else if (toplamVar > miktar) {
                const silinecekSayi = Math.min(free.length, toplamVar - miktar);
                for (let i = 0; i < silinecekSayi; i++) silinecekIdler.push(free[i].id);
            }
            byHizmet.delete(hizmetId);
        }

        // Teklifte artık olmayan hizmetler: free'leri sil, locked'ları koru
        for (const [, agler] of byHizmet) {
            for (const ag of agler) {
                if (isLocked(ag)) korunan++;
                else silinecekIdler.push(ag.id);
            }
        }

        if (silinecekIdler.length) {
            await auth.prisma.altGorev.deleteMany({ where: { id: { in: silinecekIdler } } });
            silinen += silinecekIdler.length;
        }
        if (eklenecekler.length) {
            await auth.prisma.altGorev.createMany({ data: eklenecekler });
            eklenen += eklenecekler.length;
        }
    }
    return { synced: true, eklenen, silinen, korunan };
}

app.put('/api/teklifler/:id', auth.authMiddleware('admin'), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { customerId, teklifTarihi, konu, detaylar, iskontoOran, kdvOrani: girilenKdvOrani, notlar, onayTelefon, sahadaOnay, durum, gecerlilikGun } = req.body;

        // Güncelleme öncesi mevcut durumu al (revize takibi için - item 8)
        const onceki = await auth.prisma.teklif.findUnique({
            where: { id },
            select: { durum: true, revizeNo: true, mailGonderimTarihi: true }
        });

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

        // Durum dönüşümü (frontend açıkça durum gönderdiyse onu kullan)
        let mappedDurum = durum ? teklifDurumMap[durum] : undefined;

        // Revize takibi (item 8): daha önce gönderilmiş/onaylanmış/revize edilmiş bir teklif
        // içerik güncellemesiyle değiştirilirse REVIZE durumuna geç ve revizeNo'yu artır.
        let revizeNo = undefined;
        let revizeUyari = false;
        if (!mappedDurum && onceki && ['GONDERILDI', 'ONAYLANDI', 'REVIZE'].includes(onceki.durum)) {
            mappedDurum = 'REVIZE';
            revizeNo = (onceki.revizeNo || 0) + 1;
            if (onceki.mailGonderimTarihi) revizeUyari = true;
        }

        const teklif = await auth.prisma.teklif.update({
            where: { id },
            data: {
                customerId: customerId ? parseInt(customerId) : undefined,
                teklifTarihi: teklifTarihi ? new Date(teklifTarihi) : undefined,
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
                durum: mappedDurum,
                revizeNo: revizeNo
            },
            include: { customer: true, detaylar: { include: { hizmet: true } } }
        });

        // İş emri alt görevlerini senkronize et (item 7)
        let syncSonuc = { synced: false };
        try {
            syncSonuc = await syncIsEmriAltGorevler(id);
        } catch (syncErr) {
            console.error('İş emri senkron hatası:', syncErr.message);
        }

        res.json({
            ...teklif,
            _revizeUyari: revizeUyari,
            _isEmriSync: syncSonuc
        });
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
        const id = parseInt(req.params.id);

        // Bağlı kayıtları kontrol et (FK kısıtı nedeniyle silinemez)
        const [isEmriSayisi, muayeneSayisi, workOrderSayisi] = await Promise.all([
            auth.prisma.isEmri.count({ where: { teklifId: id } }),
            auth.prisma.muayene.count({ where: { teklifId: id } }),
            auth.prisma.workOrder.count({ where: { teklifId: id } })
        ]);

        const engeller = [];
        if (isEmriSayisi > 0) engeller.push(`${isEmriSayisi} iş emri`);
        if (muayeneSayisi > 0) engeller.push(`${muayeneSayisi} muayene`);
        if (workOrderSayisi > 0) engeller.push(`${workOrderSayisi} iş kaydı`);

        if (engeller.length > 0) {
            return res.status(400).json({
                error: `Bu teklif silinemez: bağlı ${engeller.join(', ')} mevcut. Önce bunları silin veya teklifi İPTAL durumuna alın.`
            });
        }

        // TeklifDetay cascade ile otomatik silinir
        await auth.prisma.teklif.delete({ where: { id } });
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Teklif silme hatası:', error);
        res.status(500).json({ error: 'Teklif silinemedi' });
    }
});

// Teklif PDF oluştur
const teklifPdfGenerator = require('./teklifPdfGenerator');

app.get('/api/teklifler/:id/pdf', auth.authMiddleware('admin'), async (req, res) => {
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
        teklif.tenant = firma;

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

// Teklif Excel oluştur (Sadece Admin)
app.get('/api/teklifler/:id/excel', auth.authMiddleware('admin'), async (req, res) => {
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
            ['Tarih:', new Date(teklif.teklifTarihi).toLocaleDateString('tr-TR')],
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
        // Path traversal koruması: dizin bileşenlerini at, sadece dosya adını kullan
        const filename = path.basename(req.params.filename);
        const reportsDir = path.join(__dirname, 'storage', 'reports');
        const filePath = path.join(reportsDir, filename);

        // Çözülen yolun reports dizininin içinde kaldığını doğrula
        if (!filePath.startsWith(reportsDir + path.sep)) {
            return res.status(400).json({ error: 'Geçersiz dosya adı' });
        }

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Dosya bulunamadı' });
        }

        res.download(filePath, filename);
    } catch (error) {
        res.status(500).json({ error: 'Dosya indirilemedi' });
    }
});

// ============ DASHBOARD ============

app.get('/api/dashboard', auth.authMiddleware('admin'), async (req, res) => {
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
        // Admin tüm personelleri görsün, tekniker sadece aktif olanları
        const where = req.user.isPersonel ? { isActive: true } : {};
        const personeller = await auth.prisma.personel.findMany({
            where,
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
        const isTekniker = req.user.isPersonel;

        // Tekniker: sadece kendisine atanmış alt görevi olan iş emirlerini görsün
        if (isTekniker) {
            where.altGorevler = { some: { personelId: req.user.personelId } };
        }

        const isEmirleri = await auth.prisma.isEmri.findMany({
            where,
            include: {
                customer: true,
                teklif: true,
                altGorevler: {
                    include: { personel: { select: { id: true, adSoyad: true, unvan: true, kategori: true, email: true } }, hizmet: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        // Tekniker: fiyat/tutar bilgilerini gizle
        if (isTekniker) {
            isEmirleri.forEach(ie => {
                if (ie.teklif) {
                    ie.teklif.toplamTutar = undefined;
                    ie.teklif.kdvTutar = undefined;
                    ie.teklif.genelToplam = undefined;
                    ie.teklif.iskonto = undefined;
                }
                ie.altGorevler = ie.altGorevler.filter(ag => ag.personelId === req.user.personelId);
            });
        }

        res.json(isEmirleri);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Tek iş emri detay
app.get('/api/is-emirleri/:id', auth.authMiddleware(), async (req, res) => {
    try {
        const isTekniker = req.user.isPersonel;

        const isEmri = await auth.prisma.isEmri.findUnique({
            where: { id: parseInt(req.params.id) },
            include: {
                customer: true,
                teklif: { include: { detaylar: { include: { hizmet: true } } } },
                altGorevler: {
                    include: { personel: { select: { id: true, adSoyad: true, unvan: true, kategori: true, email: true } }, hizmet: true },
                    orderBy: [{ kategori: 'asc' }, { siraNo: 'asc' }]
                },
                firmaBilgi: true
            }
        });

        if (!isEmri) {
            return res.status(404).json({ error: 'İş emri bulunamadı' });
        }

        // Tekniker: fiyat gizle, sadece kendi alt görevlerini göster
        if (isTekniker) {
            if (isEmri.teklif) {
                isEmri.teklif.toplamTutar = undefined;
                isEmri.teklif.kdvTutar = undefined;
                isEmri.teklif.genelToplam = undefined;
                isEmri.teklif.iskonto = undefined;
                if (isEmri.teklif.detaylar) {
                    isEmri.teklif.detaylar.forEach(d => {
                        d.birimFiyat = undefined;
                        d.toplam = undefined;
                    });
                }
            }
            isEmri.altGorevler = isEmri.altGorevler.filter(ag => ag.personelId === req.user.personelId);
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
                altGorevler: { include: { personel: { select: { id: true, adSoyad: true, unvan: true, kategori: true, email: true } } } }
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
            include: { personel: { select: { id: true, adSoyad: true, unvan: true, kategori: true, email: true } }, hizmet: true, isEmri: { include: { customer: true, firmaBilgi: true } } }
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
            include: {
                personel: {
                    select: { id: true, adSoyad: true, unvan: true, kategori: true, email: true }
                },
                hizmet: true
            }
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
app.get('/api/personel/:personelId/gorevler', auth.authMiddleware(), async (req, res) => {
    try {
        const { durum } = req.query; // Filtre: ATANDI, SAHADA, TAMAMLANDI veya hepsi için boş

        // Tekniker sadece kendi görevlerini görebilir
        const requestedPersonelId = parseInt(req.params.personelId);
        if (req.user.isPersonel && req.user.personelId !== requestedPersonelId) {
            return res.status(403).json({ error: 'Sadece kendi görevlerinizi görüntüleyebilirsiniz' });
        }

        const whereClause = {
            personelId: requestedPersonelId
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

app.get('/api/dashboard/stats', auth.authMiddleware('admin'), async (req, res) => {
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

app.get('/api/dashboard/son-teklifler', auth.authMiddleware('admin'), async (req, res) => {
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

// Personel oluştur (Personel tablosuna)
app.post('/api/personeller', auth.authMiddleware('admin'), async (req, res) => {
    try {
        const { adSoyad, kategori, unvan, meslek, email, username, password, telefon, diplomaTarihi, diplomaNo, ekipnetNo, isActive } = req.body;

        // Email kontrolü
        if (!email) {
            return res.status(400).json({ error: 'Email zorunludur' });
        }

        // Email benzersizlik kontrolü
        const existingPersonel = await auth.prisma.personel.findFirst({
            where: { email: email.toLowerCase() }
        });
        if (existingPersonel) {
            return res.status(400).json({ error: 'Bu email zaten kullanılıyor' });
        }

        // Username benzersizlik kontrolü
        if (username) {
            const existingUsername = await auth.prisma.personel.findFirst({
                where: { username: username.toLowerCase() }
            });
            if (existingUsername) {
                return res.status(400).json({ error: 'Bu kullanıcı adı zaten kullanılıyor' });
            }
        }

        // Şifre hashle
        const hashedPassword = password ? auth.hashPassword(password) : null;

        const personel = await auth.prisma.personel.create({
            data: {
                adSoyad,
                kategori,
                unvan,
                meslek: meslek || null,
                email: email.toLowerCase(),
                username: username ? username.toLowerCase() : null,
                password: hashedPassword,
                telefon: telefon || null,
                diplomaTarihi: diplomaTarihi || null,
                diplomaNo: diplomaNo || null,
                ekipnetNo: ekipnetNo || null,
                isActive: isActive !== false,
                role: 'tekniker'
            }
        });

        res.json({
            id: personel.id,
            adSoyad: personel.adSoyad,
            email: personel.email,
            kategori: personel.kategori,
            unvan: personel.unvan
        });
    } catch (error) {
        console.error('Personel oluşturma hatası:', error);
        res.status(500).json({ error: 'Personel oluşturulamadı: ' + error.message });
    }
});

// Personel güncelle
app.put('/api/personeller/:id', auth.authMiddleware('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { adSoyad, kategori, unvan, meslek, email, username, password, telefon, diplomaTarihi, diplomaNo, ekipnetNo, isActive } = req.body;

        // Email benzersizlik kontrolü (kendi emaili hariç)
        if (email) {
            const existingPersonel = await auth.prisma.personel.findFirst({
                where: {
                    email: email.toLowerCase(),
                    NOT: { id: parseInt(id) }
                }
            });
            if (existingPersonel) {
                return res.status(400).json({ error: 'Bu email zaten kullanılıyor' });
            }
        }

        // Username benzersizlik kontrolü (kendi username'i hariç)
        if (username) {
            const existingUsername = await auth.prisma.personel.findFirst({
                where: {
                    username: username.toLowerCase(),
                    NOT: { id: parseInt(id) }
                }
            });
            if (existingUsername) {
                return res.status(400).json({ error: 'Bu kullanıcı adı zaten kullanılıyor' });
            }
        }

        const updateData = {
            adSoyad,
            kategori,
            unvan,
            meslek: meslek || null,
            email: email ? email.toLowerCase() : undefined,
            username: username ? username.toLowerCase() : null,
            telefon: telefon || null,
            diplomaTarihi: diplomaTarihi || null,
            diplomaNo: diplomaNo || null,
            ekipnetNo: ekipnetNo || null,
            isActive: isActive !== false
        };

        // Şifre varsa güncelle
        if (password && password.trim()) {
            updateData.password = auth.hashPassword(password);
        }

        const personel = await auth.prisma.personel.update({
            where: { id: parseInt(id) },
            data: updateData
        });

        res.json({
            id: personel.id,
            adSoyad: personel.adSoyad,
            email: personel.email,
            kategori: personel.kategori,
            unvan: personel.unvan
        });
    } catch (error) {
        console.error('Personel güncelleme hatası:', error);
        res.status(500).json({ error: 'Personel güncellenemedi: ' + error.message });
    }
});

// Personel sil
app.delete('/api/personeller/:id', auth.authMiddleware('admin'), async (req, res) => {
    try {
        const { id } = req.params;

        // Personelin atanmış görevleri var mı kontrol et
        const gorevler = await auth.prisma.altGorev.findMany({
            where: { personelId: parseInt(id) }
        });

        if (gorevler.length > 0) {
            // Soft delete yap (pasife çek)
            await auth.prisma.personel.update({
                where: { id: parseInt(id) },
                data: { isActive: false }
            });
            return res.json({ message: 'Personel pasife alındı (atanmış görevleri var)' });
        }

        await auth.prisma.personel.delete({
            where: { id: parseInt(id) }
        });

        res.json({ message: 'Personel silindi' });
    } catch (error) {
        console.error('Personel silme hatası:', error);
        res.status(500).json({ error: 'Personel silinemedi: ' + error.message });
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
        const { customMessage, smtpConfig, emails } = req.body;

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
        teklif.tenant = firma;

        // Email listesini belirle (frontend'den gelen veya müşteri emaili)
        let emailList = [];
        if (emails && Array.isArray(emails) && emails.length > 0) {
            emailList = emails.filter(e => e && e.includes('@'));
        } else if (teklif.customer?.email && teklif.customer.email !== '-') {
            emailList = [teklif.customer.email];
        }

        if (emailList.length === 0) {
            return res.status(400).json({ error: 'Geçerli bir email adresi bulunamadı' });
        }

        const smtp = smtpConfig || {
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.SMTP_PORT) || 465,
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        };

        if (!smtp.user || !smtp.pass) {
            return res.status(400).json({ error: 'Email ayarları yapılandırılmamış. Lütfen SMTP ayarlarını kontrol edin.' });
        }

        // Her email adresine gönder
        const results = [];
        for (const email of emailList) {
            try {
                // Teklif objesine geçici olarak email ekle
                const teklifCopy = { ...teklif, customer: { ...teklif.customer, email } };
                const result = await emailService.sendTeklifEmail(teklifCopy, smtp, customMessage);
                results.push({ email, success: true, messageId: result.messageId });
            } catch (err) {
                console.error(`Email gönderme hatası (${email}):`, err.message);
                results.push({ email, success: false, error: err.message });
            }
        }

        // En az bir başarılı gönderim varsa durumu güncelle + mail takibi (item 6/8)
        const successCount = results.filter(r => r.success).length;
        if (successCount > 0) {
            await auth.prisma.teklif.update({
                where: { id: teklif.id },
                data: {
                    durum: 'GONDERILDI',
                    mailGonderimTarihi: new Date(),
                    mailGonderimSayisi: { increment: 1 }
                }
            });
        }

        // Hiçbiri gitmediyse 502 dön ki frontend gerçek hatayı göstersin (item 6)
        const failed = results.filter(r => !r.success);
        if (successCount === 0) {
            return res.status(502).json({
                success: false,
                error: 'Hiçbir e-posta gönderilemedi: ' + (failed[0]?.error || 'bilinmeyen hata'),
                results
            });
        }

        res.json({
            success: true,
            message: `${successCount}/${emailList.length} email gönderildi`,
            sentTo: results.filter(r => r.success).map(r => r.email).join(', '),
            failedTo: failed.map(r => `${r.email} (${r.error})`).join(', '),
            results
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
            port: parseInt(process.env.SMTP_PORT) || 465,
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

app.get('/api/teklifler/:id/pdf-excel', auth.authMiddleware('admin'), async (req, res) => {
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
        teklif.tenant = firma;

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

// Cihaz detayı ile kalibrasyon geçmişi
app.get('/api/olcum-cihazlari/:id/detay', async (req, res) => {
    try {
        const cihaz = await auth.prisma.olcumCihazi.findUnique({
            where: { id: parseInt(req.params.id) },
            include: {
                kalibrasyonGecmisi: {
                    orderBy: { kalibrasyonTarihi: 'desc' }
                }
            }
        });
        if (!cihaz) {
            return res.status(404).json({ error: 'Cihaz bulunamadı' });
        }
        res.json(cihaz);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Kalibrasyon geçmişi listele
app.get('/api/olcum-cihazlari/:id/kalibrasyon-gecmisi', async (req, res) => {
    try {
        const gecmis = await auth.prisma.kalibrasyonGecmisi.findMany({
            where: { cihazId: parseInt(req.params.id) },
            orderBy: { kalibrasyonTarihi: 'desc' }
        });
        res.json(gecmis);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Kalibrasyon geçmişi ekle
app.post('/api/olcum-cihazlari/:id/kalibrasyon-gecmisi', async (req, res) => {
    try {
        const cihazId = parseInt(req.params.id);
        const { kalibrasyonTarihi, gecerlilikTarihi, sertifikaNo, kalibrasyonYapan, maliyet, notlar } = req.body;

        // Kalibrasyon geçmişine ekle
        const gecmis = await auth.prisma.kalibrasyonGecmisi.create({
            data: {
                cihazId,
                kalibrasyonTarihi: new Date(kalibrasyonTarihi),
                gecerlilikTarihi: new Date(gecerlilikTarihi),
                sertifikaNo,
                kalibrasyonYapan,
                maliyet: maliyet ? parseFloat(maliyet) : null,
                notlar
            }
        });

        // Cihazın güncel kalibrasyon bilgilerini güncelle
        await auth.prisma.olcumCihazi.update({
            where: { id: cihazId },
            data: {
                kalibrasyonTarihi: new Date(kalibrasyonTarihi),
                kalibrasyonGecerlilik: new Date(gecerlilikTarihi),
                kalibrasyonNo: sertifikaNo
            }
        });

        res.json(gecmis);
    } catch (error) {
        console.error('Kalibrasyon ekleme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Kalibrasyon geçmişi sil
app.delete('/api/kalibrasyon-gecmisi/:id', async (req, res) => {
    try {
        await auth.prisma.kalibrasyonGecmisi.delete({
            where: { id: parseInt(req.params.id) }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Cihaz durum güncelle
app.patch('/api/olcum-cihazlari/:id/durum', async (req, res) => {
    try {
        const { durum } = req.body;
        const cihaz = await auth.prisma.olcumCihazi.update({
            where: { id: parseInt(req.params.id) },
            data: { durum }
        });
        res.json(cihaz);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Sertifika dosyası yükleme
app.post('/api/olcum-cihazlari/:id/sertifika', sertifikaUpload.single('sertifika'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Dosya yüklenmedi' });
        }

        const dosyaYolu = '/uploads/' + req.file.filename;
        const cihazId = parseInt(req.params.id);
        const gecmisId = req.body.gecmisId ? parseInt(req.body.gecmisId) : null;

        // Kalibrasyon geçmişine sertifika ekle
        if (gecmisId) {
            await auth.prisma.kalibrasyonGecmisi.update({
                where: { id: gecmisId },
                data: { sertifikaDosya: dosyaYolu }
            });
        }

        // Cihaza da sertifika ekle
        await auth.prisma.olcumCihazi.update({
            where: { id: cihazId },
            data: { sertifikaDosya: dosyaYolu }
        });

        res.json({ success: true, dosyaYolu });
    } catch (error) {
        console.error('Sertifika yükleme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Kalibrasyon hatırlatma emaili gönder
app.post('/api/olcum-cihazlari/kalibrasyon-hatirlatma', auth.authMiddleware('admin'), async (req, res) => {
    try {
        const { cihazIds, email } = req.body;

        const cihazlar = await auth.prisma.olcumCihazi.findMany({
            where: { id: { in: cihazIds } }
        });

        if (cihazlar.length === 0) {
            return res.status(400).json({ error: 'Cihaz bulunamadı' });
        }

        const smtp = {
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.SMTP_PORT) || 465,
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        };

        if (!smtp.user || !smtp.pass) {
            return res.status(400).json({ error: 'Email ayarları yapılandırılmamış' });
        }

        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
            host: smtp.host,
            port: smtp.port,
            secure: false,
            auth: { user: smtp.user, pass: smtp.pass }
        });

        let cihazListesi = cihazlar.map(c => {
            const gecerlilik = c.kalibrasyonGecerlilik ? new Date(c.kalibrasyonGecerlilik).toLocaleDateString('tr-TR') : '-';
            return `<tr><td>${c.cihazAdi}</td><td>${c.marka || ''} ${c.model || ''}</td><td>${c.seriNo || '-'}</td><td>${gecerlilik}</td></tr>`;
        }).join('');

        const htmlContent = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
            <div style="background:#1a5f7a;color:white;padding:20px;text-align:center;border-radius:8px 8px 0 0;">
                <h2 style="margin:0;">⚠️ Kalibrasyon Hatırlatması</h2>
            </div>
            <div style="padding:20px;border:1px solid #ddd;border-top:none;">
                <p>Aşağıdaki cihazların kalibrasyon süresi dolmuş veya dolmak üzere:</p>
                <table style="width:100%;border-collapse:collapse;margin:15px 0;">
                    <thead>
                        <tr style="background:#f5f5f5;">
                            <th style="padding:10px;border:1px solid #ddd;text-align:left;">Cihaz</th>
                            <th style="padding:10px;border:1px solid #ddd;text-align:left;">Marka/Model</th>
                            <th style="padding:10px;border:1px solid #ddd;text-align:left;">Seri No</th>
                            <th style="padding:10px;border:1px solid #ddd;text-align:left;">Geçerlilik</th>
                        </tr>
                    </thead>
                    <tbody>${cihazListesi}</tbody>
                </table>
                <p style="color:#666;">Lütfen kalibrasyon işlemlerini planlamayı unutmayın.</p>
            </div>
        </div>`;

        await transporter.sendMail({
            from: smtp.user,
            to: email,
            subject: '⚠️ Kalibrasyon Hatırlatması - ÖNDER MUAYENE',
            html: htmlContent
        });

        res.json({ success: true, message: 'Hatırlatma emaili gönderildi' });
    } catch (error) {
        console.error('Kalibrasyon hatırlatma hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// ===================== PERİYODİK MUAYENE HATIRLATMA =====================

// "YYYY-MM-DD" string veya DateTime → Date (geçersizse null)
function hatirlatmaTarihParse(v) {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
}
function hatirlatmaAyEkle(date, months) {
    const d = new Date(date);
    d.setMonth(d.getMonth() + (months || 12));
    return d;
}

// Tüm rapor tiplerinden "sonraki kontrol tarihi"ni toplar; her biri
// altGorev → isEmri → customer zinciriyle müşteriye bağlanır.
async function yaklasanMuayeneTopla() {
    const prisma = auth.prisma;
    const musteriInclude = { altGorev: { include: { isEmri: { include: { customer: true } } } } };
    const ekle = (liste, r, tip, sonrakiHam, baslangicHam) => {
        let sonraki = hatirlatmaTarihParse(sonrakiHam);
        // Sonraki tarih yoksa kontrol/başlangıç tarihine +12 ay ekleyerek tahmin et
        if (!sonraki) {
            const b = hatirlatmaTarihParse(baslangicHam);
            if (b) sonraki = hatirlatmaAyEkle(b, 12);
        }
        if (!sonraki) return;
        const cust = r.altGorev?.isEmri?.customer;
        liste.push({
            tip, id: r.id,
            musteri: cust?.unvan || '-',
            musteriEmail: cust?.email || null,
            yetkili: cust?.yetkili || null,
            ekipman: r.altGorev?.ekipmanAdi || '-',
            sonrakiTarih: sonraki
        });
    };

    const tumu = [];
    const [generic, komp, hava, topr, icTes] = await Promise.all([
        prisma.rapor.findMany({ include: musteriInclude }),
        prisma.kompresorRaporu.findMany({ include: musteriInclude }),
        prisma.havaTankiRaporu.findMany({ include: musteriInclude }),
        prisma.elektrikTopraklamaRaporu.findMany({ include: musteriInclude }),
        prisma.elektrikIcTesisatRaporu.findMany({ include: musteriInclude })
    ]);
    for (const r of generic) {
        const fd = typeof r.formData === 'string' ? JSON.parse(r.formData || '{}') : (r.formData || {});
        ekle(tumu, r, 'generic', fd.sonrakiKontrolTarihi, fd.kontrolTarihi || r.baslangicTarihi);
    }
    for (const r of komp) ekle(tumu, r, 'kompresor', r.sonrakiKontrolTarihi, r.kontrolTarihi);
    for (const r of hava) ekle(tumu, r, 'havatanki', r.sonrakiKontrolTarihi, r.kontrolTarihi);
    for (const r of topr) ekle(tumu, r, 'topraklama', r.sonKontrolTarihi, r.baslangicTarihi);
    for (const r of icTes) ekle(tumu, r, 'ictesisat', r.sonKontrolTarihi, r.baslangicTarihi);

    // Aynı müşteri+ekipman için en ileri (en güncel) sonraki tarihi tut
    const enGuncel = new Map();
    for (const x of tumu) {
        const key = (x.musteri || '') + '|' + (x.ekipman || '');
        const v = enGuncel.get(key);
        if (!v || x.sonrakiTarih > v.sonrakiTarih) enGuncel.set(key, x);
    }
    return [...enGuncel.values()];
}

// Yaklaşan periyodik muayeneler: sonraki kontrol tarihine <= eşik gün kalanlar (gecikmiş dahil)
app.get('/api/yaklasan-muayeneler', async (req, res) => {
    try {
        const esikGun = parseInt(req.query.gun) || 30;
        const bugun = new Date(); bugun.setHours(0, 0, 0, 0);
        const esik = new Date(bugun); esik.setDate(esik.getDate() + esikGun);

        const hepsi = await yaklasanMuayeneTopla();
        const sonuc = hepsi
            .filter(x => x.sonrakiTarih <= esik)
            .map(x => ({ ...x, kalanGun: Math.ceil((x.sonrakiTarih - bugun) / 86400000) }))
            .sort((a, b) => a.kalanGun - b.kalanGun);
        res.json(sonuc);
    } catch (error) {
        console.error('Yaklaşan muayeneler hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Seçili kalemler için hatırlatma e-postası gönder (hedef: 'firma' | 'musteri')
// Frontend seçilen kalemlerin verisini gönderir: { items:[{musteri,email,ekipman,sonrakiTarih}], hedef, firmaEmail }
app.post('/api/muayene-hatirlatma', auth.authMiddleware('admin'), async (req, res) => {
    try {
        const { items, hedef, firmaEmail } = req.body;
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Hatırlatılacak kalem seçilmedi' });
        }

        const smtp = {
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT,
            secure: process.env.SMTP_SECURE === 'true',
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        };
        if (!smtp.user || !smtp.pass) {
            return res.status(400).json({ error: 'E-posta ayarları yapılandırılmamış' });
        }
        const transporter = emailService.createTransporter(smtp);

        const fmt = d => d ? new Date(d).toLocaleDateString('tr-TR') : '-';
        const satir = m => `<tr>
            <td style="padding:8px;border:1px solid #ddd;">${m.musteri || '-'}</td>
            <td style="padding:8px;border:1px solid #ddd;">${m.ekipman || '-'}</td>
            <td style="padding:8px;border:1px solid #ddd;text-align:center;font-weight:bold;">${fmt(m.sonrakiTarih)}</td>
        </tr>`;
        const html = (liste, baslik) => `
        <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;">
            <div style="background:#1a5f7a;color:white;padding:20px;text-align:center;border-radius:8px 8px 0 0;">
                <h2 style="margin:0;">📅 ${baslik}</h2>
            </div>
            <div style="padding:20px;border:1px solid #ddd;border-top:none;">
                <p>Aşağıdaki ekipmanların periyodik muayene tarihi yaklaşıyor:</p>
                <table style="width:100%;border-collapse:collapse;margin:15px 0;">
                    <thead><tr style="background:#f5f5f5;">
                        <th style="padding:8px;border:1px solid #ddd;text-align:left;">Müşteri</th>
                        <th style="padding:8px;border:1px solid #ddd;text-align:left;">Ekipman</th>
                        <th style="padding:8px;border:1px solid #ddd;text-align:center;">Sonraki Muayene</th>
                    </tr></thead>
                    <tbody>${liste.map(satir).join('')}</tbody>
                </table>
                <p style="color:#666;">Lütfen periyodik muayene planlamasını yapmayı unutmayın.</p>
                <hr><p style="color:#888;font-size:12px;">ÖNDER MUAYENE Test ve Ölçüm</p>
            </div>
        </div>`;

        if (hedef === 'musteri') {
            // E-postası olan kalemleri müşteriye göre grupla, her müşteriye tek mail
            const grup = new Map();
            const atlanan = [];
            for (const m of items) {
                if (!m.email) { atlanan.push(m.musteri || m.ekipman); continue; }
                if (!grup.has(m.email)) grup.set(m.email, []);
                grup.get(m.email).push(m);
            }
            let gonderilen = 0;
            for (const [email, liste] of grup) {
                await transporter.sendMail({
                    from: smtp.user, to: email,
                    subject: 'Periyodik Muayene Hatırlatması - ÖNDER MUAYENE',
                    html: html(liste, 'Periyodik Muayene Hatırlatması')
                });
                gonderilen++;
            }
            return res.json({ success: true, gonderilen, atlanan });
        } else {
            // Firma içine tek özet e-posta
            const to = firmaEmail || smtp.user;
            await transporter.sendMail({
                from: smtp.user, to,
                subject: 'Yaklaşan Periyodik Muayeneler - ÖNDER MUAYENE',
                html: html(items, 'Yaklaşan Periyodik Muayeneler')
            });
            return res.json({ success: true, gonderilen: 1, alici: to });
        }
    } catch (error) {
        console.error('Muayene hatırlatma hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// ===================== İŞ EMRİ FİRMA BİLGİLERİ =====================

// Firma bilgisi getir
app.get('/api/is-emirleri/:id/firma-bilgi', auth.authMiddleware(), async (req, res) => {
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
app.post('/api/is-emirleri/:id/firma-bilgi', auth.authMiddleware(), async (req, res) => {
    try {
        const isEmriId = parseInt(req.params.id);
        // Sadece IsEmriFirmaBilgi modeline ait alanları filtrele
        const allowedFields = [
            'sgkSicilNo', 'isgKatipId', 'isgKatipId2', 'isgKatipId3', 'isgKatipId4',
            'enerjiKurulusu', 'basvuruNo', 'makineOperatoru', 'kaynak',
            'ortamNemi', 'ortamSicaklik', 'olcumYapanAdi', 'olcumTarihi'
        ];
        const data = {};
        allowedFields.forEach(field => {
            if (req.body[field] !== undefined) data[field] = req.body[field];
        });
        const firmaBilgi = await auth.prisma.isEmriFirmaBilgi.upsert({
            where: { isEmriId: isEmriId },
            update: data,
            create: { ...data, isEmriId: isEmriId }
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

// ============ ELEKTRİK TOPRAKLAMA RAPORU API ============

// TÜM RAPORLARI LİSTELE (Admin: hepsi, Tekniker: kendi kategorisi)
app.get('/api/raporlar', async (req, res) => {
    try {
        const { kategori, role } = req.query;

        const where = {};
        const whereKompresor = {};
        const whereHavaTanki = {};

        // Tekniker ise: tamamlanan raporları herkese aç, taslakları sadece kendi kategorisinde göster
        if (role === 'tekniker' && kategori) {
            const teknikerOr = [
                { genelSonuc: { not: null } },
                { altGorev: { hizmetAdi: { contains: kategori, mode: 'insensitive' } } }
            ];
            where.OR = teknikerOr;
            whereKompresor.OR = teknikerOr;
            whereHavaTanki.OR = teknikerOr;
        }

        // Elektrik topraklama raporları
        const elektrikRaporlar = await auth.prisma.elektrikTopraklamaRaporu.findMany({
            where,
            include: {
                altGorev: {
                    include: {
                        isEmri: {
                            include: { customer: true }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        // Kompresör raporları
        const kompresorRaporlar = await auth.prisma.kompresorRaporu.findMany({
            where: whereKompresor,
            include: {
                altGorev: {
                    include: {
                        isEmri: {
                            include: { customer: true }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        // Rapor listelerini formatla ve birleştir
        const formattedElektrik = elektrikRaporlar.map(r => ({
            id: r.id,
            raporNo: r.raporNo,
            raporTipi: 'Elektrik Topraklama',
            firmaAdi: r.altGorev?.isEmri?.customer?.unvan || '-',
            tarih: r.createdAt,
            baslangicTarihi: r.baslangicTarihi,
            bitisTarihi: r.bitisTarihi,
            sonuc: r.genelSonuc || '-',
            durum: r.genelSonuc ? 'Tamamlandı' : 'Taslak',
            altGorevId: r.altGorevId,
            isEmriNo: r.altGorev?.isEmri?.isEmriNo || '-'
        }));

        const formattedKompresor = kompresorRaporlar.map(r => ({
            id: r.id,
            raporNo: r.raporNo,
            raporTipi: 'Kompresör',
            firmaAdi: r.altGorev?.isEmri?.customer?.unvan || '-',
            tarih: r.createdAt,
            baslangicTarihi: r.baslangicTarihi,
            bitisTarihi: r.bitisTarihi,
            sonuc: r.genelSonuc || '-',
            durum: r.genelSonuc ? 'Tamamlandı' : 'Taslak',
            altGorevId: r.altGorevId,
            isEmriNo: r.altGorev?.isEmri?.isEmriNo || '-'
        }));

        // Hava tankı raporları
        const havaTankiRaporlar = await auth.prisma.havaTankiRaporu.findMany({
            where: whereHavaTanki,
            include: {
                altGorev: {
                    include: {
                        isEmri: {
                            include: { customer: true }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        const formattedHavaTanki = havaTankiRaporlar.map(r => ({
            id: r.id,
            raporNo: r.raporNo,
            raporTipi: 'Hava Tankı',
            firmaAdi: r.altGorev?.isEmri?.customer?.unvan || '-',
            tarih: r.createdAt,
            baslangicTarihi: r.baslangicTarihi,
            bitisTarihi: r.bitisTarihi,
            sonuc: r.genelSonuc || '-',
            durum: r.genelSonuc ? 'Tamamlandı' : 'Taslak',
            altGorevId: r.altGorevId,
            isEmriNo: r.altGorev?.isEmri?.isEmriNo || '-'
        }));

        // İç tesisat raporları
        const whereIcTesisat = {};
        if (role === 'tekniker' && kategori) {
            whereIcTesisat.OR = [
                { genelSonuc: { not: null } },
                { altGorev: { hizmetAdi: { contains: kategori, mode: 'insensitive' } } }
            ];
        }

        const icTesisatRaporlar = await auth.prisma.elektrikIcTesisatRaporu.findMany({
            where: whereIcTesisat,
            include: {
                altGorev: {
                    include: {
                        isEmri: {
                            include: { customer: true }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        const formattedIcTesisat = icTesisatRaporlar.map(r => ({
            id: r.id,
            raporNo: r.raporNo,
            raporTipi: 'Elektrik İç Tesisat',
            firmaAdi: r.altGorev?.isEmri?.customer?.unvan || '-',
            tarih: r.createdAt,
            baslangicTarihi: r.baslangicTarihi,
            bitisTarihi: r.bitisTarihi,
            sonuc: r.genelSonuc || '-',
            durum: r.genelSonuc ? 'Tamamlandı' : 'Taslak',
            altGorevId: r.altGorevId,
            isEmriNo: r.altGorev?.isEmri?.isEmriNo || '-'
        }));

        // Generic raporlar (Rapor modeli - config-driven şablonlar)
        const whereGeneric = {};
        if (role === 'tekniker' && kategori) {
            whereGeneric.OR = [
                { genelSonuc: { not: null } },
                { altGorev: { hizmetAdi: { contains: kategori, mode: 'insensitive' } } }
            ];
        }

        const genericRaporlar = await auth.prisma.rapor.findMany({
            where: whereGeneric,
            include: {
                altGorev: {
                    include: {
                        isEmri: {
                            include: { customer: true }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        const formattedGeneric = genericRaporlar.map(r => {
            let raporTipi = r.sablonKodu;
            try {
                const config = genericWordService.loadConfig(r.sablonKodu);
                raporTipi = config.sablonAdi || r.sablonKodu;
            } catch(e) {}

            return {
                id: r.id,
                raporNo: r.raporNo,
                raporTipi,
                sablonKodu: r.sablonKodu,
                firmaAdi: r.altGorev?.isEmri?.customer?.unvan || '-',
                tarih: r.createdAt,
                baslangicTarihi: r.baslangicTarihi,
                bitisTarihi: r.bitisTarihi,
                sonuc: r.genelSonuc || '-',
                durum: r.genelSonuc ? 'Tamamlandı' : 'Taslak',
                altGorevId: r.altGorevId,
                isEmriNo: r.altGorev?.isEmri?.isEmriNo || '-',
                isGeneric: true
            };
        });

        const formattedRaporlar = [...formattedElektrik, ...formattedIcTesisat, ...formattedKompresor, ...formattedHavaTanki, ...formattedGeneric]
            .sort((a, b) => new Date(b.tarih) - new Date(a.tarih));

        // Grouped mode: iş emri bazlı gruplama
        if (req.query.grouped === 'true') {
            // N+1 önleme: tüm benzersiz iş emirlerini döngü öncesi TEK sorguda çek
            const isEmriNolar = [...new Set(formattedRaporlar.map(r => r.isEmriNo).filter(n => n && n !== '-'))];
            const isEmriKayitlari = isEmriNolar.length ? await auth.prisma.isEmri.findMany({
                where: { isEmriNo: { in: isEmriNolar } },
                include: { customer: { select: { unvan: true } } }
            }) : [];
            const isEmriMap = new Map(isEmriKayitlari.map(ie => [ie.isEmriNo, ie]));

            const grouped = {};
            for (const rapor of formattedRaporlar) {
                const key = rapor.isEmriNo || 'Bilinmiyor';
                if (!grouped[key]) {
                    const isEmriData = isEmriMap.get(rapor.isEmriNo) || null;
                    grouped[key] = {
                        isEmriNo: rapor.isEmriNo,
                        isEmriId: isEmriData?.id || null,
                        musteri: isEmriData?.customer?.unvan || rapor.firmaAdi || '-',
                        durum: isEmriData?.durum || '-',
                        planliTarih: isEmriData?.planliTarih || null,
                        raporlar: []
                    };
                }
                grouped[key].raporlar.push(rapor);
            }
            return res.json(Object.values(grouped));
        }

        // Opsiyonel sayfalama (geriye uyumlu): ?page & ?limit verilmezse tüm liste (eski davranış) döner
        const page = parseInt(req.query.page);
        const limit = parseInt(req.query.limit);
        if (page > 0 && limit > 0) {
            const total = formattedRaporlar.length;
            const start = (page - 1) * limit;
            return res.json({
                data: formattedRaporlar.slice(start, start + limit),
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            });
        }

        res.json(formattedRaporlar);
    } catch (error) {
        console.error('Rapor listesi hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Rapor oluştur
app.post('/api/elektrik-topraklama-raporu', async (req, res) => {
    try {
        const { altGorevId, baslangicTarihi, bitisTarihi, ...data } = req.body;

        // Tarih dönüşümü (YYYY-MM-DD -> ISO DateTime)
        const convertDate = (dateStr) => {
            if (!dateStr) return null;
            return new Date(dateStr + 'T00:00:00.000Z');
        };

        // Rapor numarası: ET-{TeklifNo}-{sıra}
        const altGorev = await auth.prisma.altGorev.findUnique({
            where: { id: parseInt(altGorevId) },
            include: { isEmri: { include: { teklif: true } } }
        });
        const teklifNo = altGorev?.isEmri?.teklif?.teklifNo || new Date().getFullYear().toString();
        const prefix = `ET-${teklifNo}`;
        const mevcutRaporlar = await auth.prisma.elektrikTopraklamaRaporu.findMany({
            where: { raporNo: { startsWith: prefix } },
            orderBy: { raporNo: 'desc' }
        });
        let sira = 1;
        if (mevcutRaporlar.length > 0) {
            const sonSira = parseInt(mevcutRaporlar[0].raporNo.split('-').pop());
            if (!isNaN(sonSira)) sira = sonSira + 1;
        }
        const raporNo = `${prefix}-${sira.toString().padStart(3, '0')}`;

        const rapor = await auth.prisma.elektrikTopraklamaRaporu.create({
            data: {
                raporNo,
                altGorevId: parseInt(altGorevId),
                baslangicTarihi: convertDate(baslangicTarihi),
                bitisTarihi: convertDate(bitisTarihi),
                ...data
            },
            include: {
                altGorev: {
                    include: {
                        isEmri: {
                            include: { customer: true }
                        }
                    }
                },
                ekipmanBilgi: true,
                detayliOlcumler: true,
                rcdSecicilik: true
            }
        });

        // Alt görevin raporNo alanını güncelle
        await auth.prisma.altGorev.update({
            where: { id: parseInt(altGorevId) },
            data: { raporNo }
        });

        res.json(rapor);
    } catch (error) {
        console.error('Elektrik topraklama raporu oluşturma hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Rapor getir (ID ile)
app.get('/api/elektrik-topraklama-raporu/:id', async (req, res) => {
    try {
        const rapor = await auth.prisma.elektrikTopraklamaRaporu.findUnique({
            where: { id: parseInt(req.params.id) },
            include: {
                altGorev: {
                    include: {
                        isEmri: {
                            include: {
                                customer: true,
                                firmaBilgi: true
                            }
                        }
                    }
                },
                topraklamaCihaz: true,
                devreCihaz: true,
                rcdCihaz: true,
                ekipmanBilgi: true,
                detayliOlcumler: { orderBy: { siraNo: 'asc' } },
                rcdSecicilik: { orderBy: { siraNo: 'asc' } }
            }
        });

        if (!rapor) {
            return res.status(404).json({ error: 'Rapor bulunamadı' });
        }

        res.json(rapor);
    } catch (error) {
        console.error('Elektrik topraklama raporu getirme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Alt görev için rapor getir
app.get('/api/elektrik-topraklama-raporu/alt-gorev/:altGorevId', async (req, res) => {
    try {
        const rapor = await auth.prisma.elektrikTopraklamaRaporu.findFirst({
            where: { altGorevId: parseInt(req.params.altGorevId) },
            include: {
                altGorev: {
                    include: {
                        isEmri: {
                            include: {
                                customer: true,
                                firmaBilgi: true
                            }
                        }
                    }
                },
                topraklamaCihaz: true,
                devreCihaz: true,
                rcdCihaz: true,
                ekipmanBilgi: true,
                detayliOlcumler: { orderBy: { siraNo: 'asc' } },
                rcdSecicilik: { orderBy: { siraNo: 'asc' } }
            }
        });

        res.json(rapor);
    } catch (error) {
        console.error('Elektrik topraklama raporu getirme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Rapor güncelle
app.put('/api/elektrik-topraklama-raporu/:id', async (req, res) => {
    try {
        const { ekipmanBilgi, detayliOlcumler, rcdSecicilik, baslangicTarihi, bitisTarihi, ...raporData } = req.body;

        // Tarih dönüşümü
        const convertDate = (dateStr) => {
            if (!dateStr) return null;
            if (dateStr instanceof Date) return dateStr;
            if (dateStr.includes('T')) return new Date(dateStr); // Zaten ISO format
            return new Date(dateStr + 'T00:00:00.000Z');
        };

        // Ana raporu güncelle
        const rapor = await auth.prisma.elektrikTopraklamaRaporu.update({
            where: { id: parseInt(req.params.id) },
            data: {
                ...raporData,
                baslangicTarihi: convertDate(baslangicTarihi),
                bitisTarihi: convertDate(bitisTarihi)
            }
        });

        res.json(rapor);
    } catch (error) {
        console.error('Elektrik topraklama raporu güncelleme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Ekipman bilgisi kaydet/güncelle
app.post('/api/elektrik-topraklama-raporu/:raporId/ekipman-bilgi', async (req, res) => {
    try {
        const raporId = parseInt(req.params.raporId);

        const ekipmanBilgi = await auth.prisma.topraklamaEkipmanBilgi.upsert({
            where: { raporId },
            update: req.body,
            create: {
                rapor: { connect: { id: raporId } },
                ...req.body
            }
        });

        res.json(ekipmanBilgi);
    } catch (error) {
        console.error('Ekipman bilgisi kaydetme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Detaylı ölçüm ekle
app.post('/api/elektrik-topraklama-raporu/:raporId/olcum', async (req, res) => {
    try {
        const raporId = parseInt(req.params.raporId);
        const { anmaAkimi, sigortaTipi, zx, yerTipi, sebekeTipi, ...data } = req.body;

        // Formül hesaplamaları (TS HD 60364-4-41)
        let ia = null, zs = null, ra = null, ik = null;

        if (anmaAkimi && sigortaTipi) {
            const In = parseFloat(anmaAkimi);
            // Ia hesapla: B=In×5, C=In×10, D=In×20, TMS=In×10
            if (sigortaTipi === 'B') ia = In * 5;
            else if (sigortaTipi === 'C') ia = In * 10;
            else if (sigortaTipi === 'D') ia = In * 20;
            else if (sigortaTipi === 'TMS') ia = In * 10;

            if (ia) {
                // Zs = 230 / Ia (TN sistemi için)
                zs = 230 / ia;
                // RA = 50/Ia veya 25/Ia (TT sistemi, yer tipine göre)
                ra = (yerTipi === 'TEHLIKELI') ? 25 / ia : 50 / ia;
            }
        }

        if (zx) {
            // Ik = 230 / Zx
            ik = 230 / parseFloat(zx);
        }

        // Sıra no hesapla
        const sonOlcum = await auth.prisma.topraklamaDetayliOlcum.findFirst({
            where: { raporId },
            orderBy: { siraNo: 'desc' }
        });
        const siraNo = data.siraNo || (sonOlcum ? sonOlcum.siraNo + 1 : 1);

        // RCD bazlı RA hesaplama
        const { rcdVarMi: rcdVarBody, rcdIAn: rcdIAnBody } = data;
        if (rcdVarBody && rcdIAnBody && parseFloat(rcdIAnBody) > 0) {
            const ideltaA = parseFloat(rcdIAnBody) / 1000;
            ra = (yerTipi === 'TEHLIKELI') ? 25 / ideltaA : 50 / ideltaA;
        }

        // Sonucu kullanıcı gönderdiyse onu kullan, yoksa hesapla
        let sonuc = data.sonuc || null;
        if (!sonuc) {
            const isTT = (sebekeTipi || '').toUpperCase() === 'TT';
            if (isTT) {
                if (zx && ra) sonuc = parseFloat(zx) <= ra ? 'UYGUN' : 'UYGUN_DEGIL';
            } else {
                if (zx && zs) sonuc = parseFloat(zx) <= zs ? 'UYGUN' : 'UYGUN_DEGIL';
            }
        }

        // Sadece geçerli alanları al - HTML'den gelen olcumNoktasi'nı tabloAdi'ye map et
        const { olcumNoktasi, tabloAdi, panoAdi, salterAdi, rcdVarMi, rcdIn, rcdIAn, rcdSure, aciklama } = data;

        const olcum = await auth.prisma.topraklamaDetayliOlcum.create({
            data: {
                rapor: { connect: { id: raporId } },
                siraNo,
                anmaAkimi: anmaAkimi ? parseFloat(anmaAkimi) : null,
                sigortaTipi,
                ia,
                zs,
                ra,
                zx: zx ? parseFloat(zx) : null,
                ik,
                sonuc,
                tabloAdi: olcumNoktasi || tabloAdi || null,
                panoAdi: panoAdi || null,
                salterAdi: salterAdi || null,
                rcdVarMi: rcdVarMi === true || rcdVarMi === 'true',
                rcdIn: rcdIn ? parseFloat(rcdIn) : null,
                rcdIAn: rcdIAn ? parseFloat(rcdIAn) : null,
                rcdSure: rcdSure ? parseFloat(rcdSure) : null,
                aciklama: aciklama || null
            }
        });

        res.json(olcum);
    } catch (error) {
        console.error('Detaylı ölçüm ekleme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Detaylı ölçüm güncelle
app.put('/api/elektrik-topraklama-olcum/:id', async (req, res) => {
    try {
        const { anmaAkimi, sigortaTipi, zx, yerTipi, sebekeTipi, ...data } = req.body;

        // Formül hesaplamaları (TS HD 60364-4-41)
        let ia = null, zs = null, ra = null, ik = null;

        if (anmaAkimi && sigortaTipi) {
            const In = parseFloat(anmaAkimi);
            if (sigortaTipi === 'B') ia = In * 5;
            else if (sigortaTipi === 'C') ia = In * 10;
            else if (sigortaTipi === 'D') ia = In * 20;
            else if (sigortaTipi === 'TMS') ia = In * 10;

            if (ia) {
                zs = 230 / ia;
                ra = (yerTipi === 'TEHLIKELI') ? 25 / ia : 50 / ia;
            }
        }

        if (zx) {
            ik = 230 / parseFloat(zx);
        }

        // RCD bazlı RA hesaplama
        const { rcdVarMi: rcdVarBody2, rcdIAn: rcdIAnBody2 } = data;
        if (rcdVarBody2 && rcdIAnBody2 && parseFloat(rcdIAnBody2) > 0) {
            const ideltaA = parseFloat(rcdIAnBody2) / 1000;
            ra = (yerTipi === 'TEHLIKELI') ? 25 / ideltaA : 50 / ideltaA;
        }

        // Sonucu kullanıcı gönderdiyse onu kullan, yoksa hesapla
        let sonuc = data.sonuc || null;
        if (!sonuc) {
            const isTT2 = (sebekeTipi || '').toUpperCase() === 'TT';
            if (isTT2) {
                if (zx && ra) sonuc = parseFloat(zx) <= ra ? 'UYGUN' : 'UYGUN_DEGIL';
            } else {
                if (zx && zs) sonuc = parseFloat(zx) <= zs ? 'UYGUN' : 'UYGUN_DEGIL';
            }
        }

        // Sadece geçerli alanları al - olcumNoktasi'nı tabloAdi'ye map et
        const { olcumNoktasi, tabloAdi, panoAdi, salterAdi, rcdVarMi, rcdIn, rcdIAn, rcdSure, aciklama } = data;

        const olcum = await auth.prisma.topraklamaDetayliOlcum.update({
            where: { id: parseInt(req.params.id) },
            data: {
                anmaAkimi: anmaAkimi ? parseFloat(anmaAkimi) : null,
                sigortaTipi,
                ia,
                zs,
                ra,
                zx: zx ? parseFloat(zx) : null,
                ik,
                sonuc,
                tabloAdi: olcumNoktasi || tabloAdi || null,
                panoAdi: panoAdi || null,
                salterAdi: salterAdi || null,
                rcdVarMi: rcdVarMi === true || rcdVarMi === 'true',
                rcdIn: rcdIn ? parseFloat(rcdIn) : null,
                rcdIAn: rcdIAn ? parseFloat(rcdIAn) : null,
                rcdSure: rcdSure ? parseFloat(rcdSure) : null,
                aciklama: aciklama || null
            }
        });

        res.json(olcum);
    } catch (error) {
        console.error('Detaylı ölçüm güncelleme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Detaylı ölçüm sil
app.delete('/api/elektrik-topraklama-olcum/:id', async (req, res) => {
    try {
        await auth.prisma.topraklamaDetayliOlcum.delete({
            where: { id: parseInt(req.params.id) }
        });
        res.json({ success: true });
    } catch (error) {
        console.error('Detaylı ölçüm silme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// RCD seçicilik ekle
app.post('/api/elektrik-topraklama-raporu/:raporId/rcd-secicilik', async (req, res) => {
    try {
        const raporId = parseInt(req.params.raporId);

        const sonRcd = await auth.prisma.rCDSecicilik.findFirst({
            where: { raporId },
            orderBy: { siraNo: 'desc' }
        });
        const siraNo = sonRcd ? sonRcd.siraNo + 1 : 1;

        const b = req.body || {};
        const num = (v) => (v === '' || v === null || v === undefined || isNaN(parseFloat(v))) ? null : parseFloat(v);
        const rcd = await auth.prisma.rCDSecicilik.create({
            data: {
                rapor: { connect: { id: raporId } },
                siraNo: b.siraNo ? parseInt(b.siraNo) : siraNo,
                oncekiPanoAdi: b.oncekiPanoAdi ?? null,
                oncekiRcdTipi: b.oncekiRcdTipi ?? null,
                oncekiIn: num(b.oncekiIn),
                oncekiIdn: num(b.oncekiIdn),
                oncekiGecikme: num(b.oncekiGecikme),
                sonPanoAdi: b.sonPanoAdi ?? null,
                sonRcdTipi: b.sonRcdTipi ?? null,
                sonIdn: num(b.sonIdn),
                sonTd: num(b.sonTd),
                sonuc: b.sonuc ?? null,
                aciklama: b.aciklama ?? null
            }
        });

        res.json(rcd);
    } catch (error) {
        console.error('RCD seçicilik ekleme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// RCD seçicilik sil
app.delete('/api/rcd-secicilik/:id', async (req, res) => {
    try {
        await auth.prisma.rCDSecicilik.delete({
            where: { id: parseInt(req.params.id) }
        });
        res.json({ success: true });
    } catch (error) {
        console.error('RCD seçicilik silme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Rapor sil
app.delete('/api/elektrik-topraklama-raporu/:id', async (req, res) => {
    try {
        await auth.prisma.elektrikTopraklamaRaporu.delete({
            where: { id: parseInt(req.params.id) }
        });
        res.json({ success: true });
    } catch (error) {
        console.error('Elektrik topraklama raporu silme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ ELEKTRİK HESAPLAMA API ============

// POST /api/elektrik/hesapla - TS HD 60364-4-41 formülleri
app.post('/api/elektrik/hesapla', (req, res) => {
    try {
        const { sebekeTipi, sigortaTipi, sigortaIn, zxOlculen, rcdVar, rcdIdelta, yerTipi } = req.body;

        const In = parseFloat(sigortaIn) || 0;
        const Zx = parseFloat(zxOlculen) || 0;

        // 1. Açma akımı Ia hesaplama
        let ia = 0;
        if (sigortaTipi === 'B') ia = In * 5;
        else if (sigortaTipi === 'C') ia = In * 10;
        else if (sigortaTipi === 'D') ia = In * 20;
        else if (sigortaTipi === 'TMS') ia = In * 10;

        // 2. Sınır değer Zs/RA hesaplama
        let zsRa = 0;
        const isTT = (sebekeTipi || '').toUpperCase() === 'TT';
        const isTehlikeli = yerTipi === 'TEHLIKELI';

        if (rcdVar && rcdIdelta && parseFloat(rcdIdelta) > 0) {
            // RCD varsa: RA = (50 veya 25) / IΔn (mA -> A dönüşümü)
            const ideltaA = parseFloat(rcdIdelta) / 1000;
            zsRa = ideltaA > 0 ? (isTehlikeli ? 25 : 50) / ideltaA : 0;
        } else if (ia > 0) {
            if (isTT) {
                zsRa = isTehlikeli ? 25 / ia : 50 / ia;
            } else {
                zsRa = 230 / ia;
            }
        }

        // 3. Kısa devre akımı Ik1 = 230 / Zx
        const ik1 = Zx > 0 ? 230 / Zx : 0;

        // 4. Uygunluk ve Not kodu
        let uygunluk = 'UYGUN_DEGIL';
        let notKodu = 'Not-2';

        if (Zx > 0 && zsRa > 0) {
            if (rcdVar && rcdIdelta && parseFloat(rcdIdelta) > 0 && Zx <= zsRa) {
                uygunluk = 'UYGUN';
                notKodu = 'Not-4';
            } else if (Zx <= zsRa) {
                uygunluk = 'UYGUN';
                notKodu = 'Not-1';
            }
        }

        res.json({ ia, zsRa, ik1, uygunluk, notKodu });
    } catch (error) {
        console.error('Hesaplama hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ KOMPRESÖR MUAYENE RAPORU API ============

// Kompresör raporlarını listele
app.get('/api/kompresor-raporu', async (req, res) => {
    try {
        const raporlar = await auth.prisma.kompresorRaporu.findMany({
            include: {
                altGorev: {
                    include: {
                        isEmri: {
                            include: { customer: true }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(raporlar);
    } catch (error) {
        console.error('Kompresör rapor listesi hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Kompresör raporu oluştur
app.post('/api/kompresor-raporu', async (req, res) => {
    try {
        const { altGorevId, baslangicTarihi, bitisTarihi, ...data } = req.body;

        const convertDate = (dateStr) => {
            if (!dateStr) return null;
            return new Date(dateStr + 'T00:00:00.000Z');
        };

        // Rapor numarası: MT-{TeklifNo}-{sıra}
        const altGorev = await auth.prisma.altGorev.findUnique({
            where: { id: parseInt(altGorevId) },
            include: { isEmri: { include: { teklif: true } } }
        });
        const teklifNo = altGorev?.isEmri?.teklif?.teklifNo || new Date().getFullYear().toString();
        const prefix = `MT-${teklifNo}`;
        const mevcutRaporlar = await auth.prisma.kompresorRaporu.findMany({
            where: { raporNo: { startsWith: prefix } },
            orderBy: { raporNo: 'desc' }
        });
        let sira = 1;
        if (mevcutRaporlar.length > 0) {
            const sonSira = parseInt(mevcutRaporlar[0].raporNo.split('-').pop());
            if (!isNaN(sonSira)) sira = sonSira + 1;
        }
        const raporNo = `${prefix}-${sira.toString().padStart(3, '0')}`;

        const rapor = await auth.prisma.kompresorRaporu.create({
            data: {
                raporNo,
                altGorevId: parseInt(altGorevId),
                baslangicTarihi: convertDate(baslangicTarihi),
                bitisTarihi: convertDate(bitisTarihi),
                ...data
            },
            include: {
                altGorev: {
                    include: {
                        isEmri: {
                            include: { customer: true }
                        }
                    }
                }
            }
        });

        // Alt görevin raporNo alanını güncelle
        await auth.prisma.altGorev.update({
            where: { id: parseInt(altGorevId) },
            data: { raporNo }
        });

        res.json(rapor);
    } catch (error) {
        console.error('Kompresör raporu oluşturma hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Alt görev için kompresör raporu getir (`:id` den ÖNCE tanımlanmalı)
app.get('/api/kompresor-raporu/alt-gorev/:altGorevId', async (req, res) => {
    try {
        const rapor = await auth.prisma.kompresorRaporu.findFirst({
            where: { altGorevId: parseInt(req.params.altGorevId) },
            include: {
                altGorev: {
                    include: {
                        isEmri: {
                            include: {
                                customer: true,
                                firmaBilgi: true
                            }
                        }
                    }
                }
            }
        });

        res.json(rapor);
    } catch (error) {
        console.error('Kompresör raporu getirme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Kompresör raporu getir (ID ile)
app.get('/api/kompresor-raporu/:id', async (req, res) => {
    try {
        const rapor = await auth.prisma.kompresorRaporu.findUnique({
            where: { id: parseInt(req.params.id) },
            include: {
                altGorev: {
                    include: {
                        isEmri: {
                            include: {
                                customer: true,
                                firmaBilgi: true
                            }
                        }
                    }
                }
            }
        });

        if (!rapor) {
            return res.status(404).json({ error: 'Rapor bulunamadı' });
        }

        res.json(rapor);
    } catch (error) {
        console.error('Kompresör raporu getirme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Kompresör raporu güncelle
app.put('/api/kompresor-raporu/:id', async (req, res) => {
    try {
        const { baslangicTarihi, bitisTarihi, ...raporData } = req.body;

        const convertDate = (dateStr) => {
            if (!dateStr) return null;
            if (dateStr instanceof Date) return dateStr;
            if (dateStr.includes('T')) return new Date(dateStr);
            return new Date(dateStr + 'T00:00:00.000Z');
        };

        const rapor = await auth.prisma.kompresorRaporu.update({
            where: { id: parseInt(req.params.id) },
            data: {
                ...raporData,
                baslangicTarihi: convertDate(baslangicTarihi),
                bitisTarihi: convertDate(bitisTarihi)
            }
        });

        res.json(rapor);
    } catch (error) {
        console.error('Kompresör raporu güncelleme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Kompresör raporu sil
app.delete('/api/kompresor-raporu/:id', async (req, res) => {
    try {
        await auth.prisma.kompresorRaporu.delete({
            where: { id: parseInt(req.params.id) }
        });
        res.json({ success: true });
    } catch (error) {
        console.error('Kompresör raporu silme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Kompresör raporu için Word dosyası oluştur
app.post('/api/kompresor-raporu/:id/word', async (req, res) => {
    try {
        const rapor = await auth.prisma.kompresorRaporu.findUnique({
            where: { id: parseInt(req.params.id) },
            include: {
                altGorev: {
                    include: {
                        isEmri: {
                            include: {
                                customer: true,
                                firmaBilgi: true
                            }
                        }
                    }
                }
            }
        });

        if (!rapor) {
            return res.status(404).json({ error: 'Rapor bulunamadı' });
        }

        const kompresorWordService = require('./services/kompresorWordService');
        const isEmri = rapor.altGorev?.isEmri;

        const options = {
            ...req.body,
            tekniker: req.body.tekniker || {}
        };

        const wordBuffer = await kompresorWordService.generateKompresorWord(rapor, isEmri, options);

        const filename = `${rapor.raporNo || 'Rapor'}_${Date.now()}.docx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(wordBuffer);

    } catch (error) {
        console.error('Kompresör Word dosyası oluşturma hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ HAVA TANKI MUAYENE RAPORU API ============

// Hava tankı rapor listesi
app.get('/api/hava-tanki-raporu', async (req, res) => {
    try {
        const raporlar = await auth.prisma.havaTankiRaporu.findMany({
            include: {
                altGorev: {
                    include: {
                        isEmri: {
                            include: { customer: true }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(raporlar);
    } catch (error) {
        console.error('Hava tankı rapor listesi hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Hava tankı raporu oluştur
app.post('/api/hava-tanki-raporu', async (req, res) => {
    try {
        const { altGorevId, baslangicTarihi, bitisTarihi, ...data } = req.body;

        const convertDate = (dateStr) => {
            if (!dateStr) return null;
            return new Date(dateStr + 'T00:00:00.000Z');
        };

        // Rapor numarası: MT-{TeklifNo}-{sıra}
        const altGorev = await auth.prisma.altGorev.findUnique({
            where: { id: parseInt(altGorevId) },
            include: { isEmri: { include: { teklif: true } } }
        });
        const teklifNo = altGorev?.isEmri?.teklif?.teklifNo || new Date().getFullYear().toString();
        const prefix = `MT-${teklifNo}`;
        const mevcutRaporlar = await auth.prisma.havaTankiRaporu.findMany({
            where: { raporNo: { startsWith: prefix } },
            orderBy: { raporNo: 'desc' }
        });
        let sira = 1;
        if (mevcutRaporlar.length > 0) {
            const sonSira = parseInt(mevcutRaporlar[0].raporNo.split('-').pop());
            if (!isNaN(sonSira)) sira = sonSira + 1;
        }
        const raporNo = `${prefix}-${sira.toString().padStart(3, '0')}`;

        const rapor = await auth.prisma.havaTankiRaporu.create({
            data: {
                raporNo,
                altGorevId: parseInt(altGorevId),
                baslangicTarihi: convertDate(baslangicTarihi),
                bitisTarihi: convertDate(bitisTarihi),
                ...data
            },
            include: {
                altGorev: {
                    include: {
                        isEmri: {
                            include: { customer: true }
                        }
                    }
                }
            }
        });

        // Alt görevin raporNo alanını güncelle
        await auth.prisma.altGorev.update({
            where: { id: parseInt(altGorevId) },
            data: { raporNo }
        });

        res.json(rapor);
    } catch (error) {
        console.error('Hava tankı raporu oluşturma hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Alt görev için hava tankı raporu getir
app.get('/api/hava-tanki-raporu/alt-gorev/:altGorevId', async (req, res) => {
    try {
        const rapor = await auth.prisma.havaTankiRaporu.findFirst({
            where: { altGorevId: parseInt(req.params.altGorevId) },
            include: {
                altGorev: {
                    include: {
                        isEmri: {
                            include: {
                                customer: true,
                                firmaBilgi: true
                            }
                        }
                    }
                }
            }
        });

        res.json(rapor);
    } catch (error) {
        console.error('Hava tankı raporu getirme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Hava tankı raporu getir (ID ile)
app.get('/api/hava-tanki-raporu/:id', async (req, res) => {
    try {
        const rapor = await auth.prisma.havaTankiRaporu.findUnique({
            where: { id: parseInt(req.params.id) },
            include: {
                altGorev: {
                    include: {
                        isEmri: {
                            include: {
                                customer: true,
                                firmaBilgi: true
                            }
                        }
                    }
                }
            }
        });

        if (!rapor) {
            return res.status(404).json({ error: 'Rapor bulunamadı' });
        }

        res.json(rapor);
    } catch (error) {
        console.error('Hava tankı raporu getirme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Hava tankı raporu güncelle
app.put('/api/hava-tanki-raporu/:id', async (req, res) => {
    try {
        const { baslangicTarihi, bitisTarihi, ...raporData } = req.body;

        const convertDate = (dateStr) => {
            if (!dateStr) return null;
            if (dateStr instanceof Date) return dateStr;
            if (dateStr.includes('T')) return new Date(dateStr);
            return new Date(dateStr + 'T00:00:00.000Z');
        };

        const rapor = await auth.prisma.havaTankiRaporu.update({
            where: { id: parseInt(req.params.id) },
            data: {
                ...raporData,
                baslangicTarihi: convertDate(baslangicTarihi),
                bitisTarihi: convertDate(bitisTarihi)
            }
        });

        res.json(rapor);
    } catch (error) {
        console.error('Hava tankı raporu güncelleme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Hava tankı raporu sil
app.delete('/api/hava-tanki-raporu/:id', async (req, res) => {
    try {
        await auth.prisma.havaTankiRaporu.delete({
            where: { id: parseInt(req.params.id) }
        });
        res.json({ success: true });
    } catch (error) {
        console.error('Hava tankı raporu silme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Hava tankı raporu için Word dosyası oluştur
app.post('/api/hava-tanki-raporu/:id/word', async (req, res) => {
    try {
        const rapor = await auth.prisma.havaTankiRaporu.findUnique({
            where: { id: parseInt(req.params.id) },
            include: {
                altGorev: {
                    include: {
                        isEmri: {
                            include: {
                                customer: true,
                                firmaBilgi: true
                            }
                        }
                    }
                }
            }
        });

        if (!rapor) {
            return res.status(404).json({ error: 'Rapor bulunamadı' });
        }

        const havaTankiWordService = require('./services/havaTankiWordService');
        const isEmri = rapor.altGorev?.isEmri;

        const options = {
            ...req.body,
            tekniker: req.body.tekniker || {}
        };

        const wordBuffer = await havaTankiWordService.generateHavaTankiWord(rapor, isEmri, options);

        const filename = `${rapor.raporNo || 'Rapor'}_${Date.now()}.docx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(wordBuffer);

    } catch (error) {
        console.error('Hava tankı Word dosyası oluşturma hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ GENERIC RAPOR API ============

const genericWordService = require('./services/genericWordService');

// Şablon listesi
app.get('/api/rapor-sablonu', async (req, res) => {
    try {
        // Önce DB'den dene
        let sablonlar = await auth.prisma.raporSablonu.findMany({
            where: { isActive: true },
            select: { id: true, sablonKodu: true, sablonAdi: true, kategori: true }
        });

        // DB boşsa JSON dosyalarından oku
        if (sablonlar.length === 0) {
            const configDir = path.join(__dirname, 'services', 'templateConfigs');
            if (fs.existsSync(configDir)) {
                const files = fs.readdirSync(configDir).filter(f => f.endsWith('.json'));
                sablonlar = files.map(f => {
                    try {
                        const config = JSON.parse(fs.readFileSync(path.join(configDir, f), 'utf8'));
                        return {
                            sablonKodu: config.sablonKodu,
                            sablonAdi: config.sablonAdi,
                            kategori: config.kategori || config.altKategori || 'diğer'
                        };
                    } catch (e) { return null; }
                }).filter(Boolean);
            }
        }

        // Kategoriye göre sırala
        sablonlar.sort((a, b) => (a.kategori || '').localeCompare(b.kategori || '') || (a.sablonKodu || '').localeCompare(b.sablonKodu || ''));
        res.json(sablonlar);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Şablon config getir
app.get('/api/rapor-sablonu/:kod', async (req, res) => {
    try {
        const sablon = await auth.prisma.raporSablonu.findUnique({
            where: { sablonKodu: req.params.kod }
        });
        if (!sablon) {
            // DB'de yoksa dosyadan yükle
            try {
                const config = genericWordService.loadConfig(req.params.kod);
                return res.json({ sablonKodu: req.params.kod, config });
            } catch (e) {
                return res.status(404).json({ error: 'Şablon bulunamadı' });
            }
        }
        res.json(sablon);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Rapor listesi (şablon koduna göre)
app.get('/api/rapor/:sablonKodu', async (req, res) => {
    try {
        const raporlar = await auth.prisma.rapor.findMany({
            where: { sablonKodu: req.params.sablonKodu },
            include: {
                altGorev: {
                    include: { isEmri: { include: { customer: true } } }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(raporlar);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Rapor oluştur
app.post('/api/rapor/:sablonKodu', async (req, res) => {
    try {
        const { altGorevId, sgkSicilNo, isgKatipNo, baslangicTarihi, bitisTarihi, genelSonuc, formData } = req.body;

        const convertDate = (dateStr) => {
            if (!dateStr) return null;
            return new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00.000Z');
        };

        // Rapor numarası oluştur
        const altGorev = await auth.prisma.altGorev.findUnique({
            where: { id: parseInt(altGorevId) },
            include: { isEmri: { include: { teklif: true } } }
        });
        const teklifNo = altGorev?.isEmri?.teklif?.teklifNo || new Date().getFullYear().toString();

        // Config'den prefix al (varsayılan: MT)
        let prefix = 'MT';
        try {
            const config = genericWordService.loadConfig(req.params.sablonKodu);
            prefix = config.raporNoPrefix || 'MT';
        } catch (e) {}

        const raporNoPrefix = `${prefix}-${teklifNo}`;
        const mevcutRaporlar = await auth.prisma.rapor.findMany({
            where: { raporNo: { startsWith: raporNoPrefix } },
            orderBy: { raporNo: 'desc' }
        });
        let sira = 1;
        if (mevcutRaporlar.length > 0) {
            const sonSira = parseInt(mevcutRaporlar[0].raporNo.split('-').pop());
            if (!isNaN(sonSira)) sira = sonSira + 1;
        }
        const raporNo = `${raporNoPrefix}-${sira.toString().padStart(3, '0')}`;

        const rapor = await auth.prisma.rapor.create({
            data: {
                raporNo,
                sablonKodu: req.params.sablonKodu,
                altGorevId: parseInt(altGorevId),
                sgkSicilNo: sgkSicilNo || null,
                isgKatipNo: isgKatipNo || null,
                baslangicTarihi: convertDate(baslangicTarihi),
                bitisTarihi: convertDate(bitisTarihi),
                genelSonuc: genelSonuc || null,
                formData: formData || {}
            },
            include: {
                altGorev: {
                    include: { isEmri: { include: { customer: true, firmaBilgi: true } } }
                }
            }
        });

        // Alt görevin raporNo alanını güncelle
        await auth.prisma.altGorev.update({
            where: { id: parseInt(altGorevId) },
            data: { raporNo }
        });

        res.json(rapor);
    } catch (error) {
        console.error('Generic rapor oluşturma hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Alt görev ile rapor getir
app.get('/api/rapor/:sablonKodu/alt-gorev/:altGorevId', async (req, res) => {
    try {
        const rapor = await auth.prisma.rapor.findFirst({
            where: {
                sablonKodu: req.params.sablonKodu,
                altGorevId: parseInt(req.params.altGorevId)
            },
            include: {
                altGorev: {
                    include: { isEmri: { include: { customer: true, firmaBilgi: true } } }
                }
            }
        });
        res.json(rapor);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Rapor getir (ID ile)
app.get('/api/rapor/:sablonKodu/:id', async (req, res) => {
    try {
        const rapor = await auth.prisma.rapor.findFirst({
            where: { id: parseInt(req.params.id), sablonKodu: req.params.sablonKodu },
            include: {
                altGorev: {
                    include: { isEmri: { include: { customer: true, firmaBilgi: true } } }
                }
            }
        });
        if (!rapor) return res.status(404).json({ error: 'Rapor bulunamadı' });
        res.json(rapor);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Rapor güncelle
app.put('/api/rapor/:sablonKodu/:id', async (req, res) => {
    try {
        const { sgkSicilNo, isgKatipNo, baslangicTarihi, bitisTarihi, genelSonuc, formData } = req.body;

        const convertDate = (dateStr) => {
            if (!dateStr) return null;
            if (dateStr instanceof Date) return dateStr;
            return new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00.000Z');
        };

        const rapor = await auth.prisma.rapor.update({
            where: { id: parseInt(req.params.id) },
            data: {
                sgkSicilNo, isgKatipNo,
                baslangicTarihi: convertDate(baslangicTarihi),
                bitisTarihi: convertDate(bitisTarihi),
                genelSonuc, formData: formData || {}
            }
        });
        res.json(rapor);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Rapor sil
app.delete('/api/rapor/:sablonKodu/:id', async (req, res) => {
    try {
        await auth.prisma.rapor.delete({ where: { id: parseInt(req.params.id) } });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Generic Word oluştur
app.post('/api/rapor/:sablonKodu/:id/word', async (req, res) => {
    try {
        const rapor = await auth.prisma.rapor.findUnique({
            where: { id: parseInt(req.params.id) },
            include: {
                altGorev: {
                    include: { isEmri: { include: { customer: true, firmaBilgi: true } } }
                }
            }
        });

        if (!rapor) return res.status(404).json({ error: 'Rapor bulunamadı' });

        const isEmri = rapor.altGorev?.isEmri;
        const options = { ...req.body, tekniker: req.body.tekniker || {} };

        const wordBuffer = await genericWordService.generateGenericWord(rapor, isEmri, options);

        const filename = `${rapor.raporNo || 'Rapor'}_${Date.now()}.docx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
        res.send(wordBuffer);
    } catch (error) {
        console.error('Generic Word oluşturma hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ RAPOR ÖNİZLEME & PDF ============

// Rapor tipine göre Word buffer oluştur (ortak yardımcı fonksiyon)
async function generateWordBuffer(raporTipi, raporId, body) {
    const tipLower = (raporTipi || '').toLowerCase();
    const isKompresor = tipLower.includes('kompres') || tipLower === 'kompresor';
    const isHavaTanki = tipLower.includes('hava') || tipLower === 'hava-tanki';
    const isIcTesisat = tipLower.includes('ic-tesisat') || tipLower.includes('ictesisat');
    const isElektrik = tipLower.includes('elektrik') && !isIcTesisat;

    if (isIcTesisat) {
        const rapor = await auth.prisma.elektrikIcTesisatRaporu.findUnique({
            where: { id: parseInt(raporId) },
            include: {
                altGorev: { include: { isEmri: { include: { customer: true, firmaBilgi: true } } } },
                panolar: { orderBy: { siraNo: 'asc' } },
                linyeler: { orderBy: { siraNo: 'asc' } },
                potansiyelDengeleme: { orderBy: { siraNo: 'asc' } },
                zeminIzolasyon: { orderBy: { siraNo: 'asc' } },
                fotograflar: { orderBy: { siraNo: 'asc' } }
            }
        });
        if (!rapor) throw new Error('Rapor bulunamadı');

        // Topraklama raporundan ortak verileri çek (checkbox'lar, cihaz bilgileri vs.)
        let topraklamaVerileri = {};
        try {
            const isEmriId = rapor.altGorev?.isEmriId || rapor.altGorev?.isEmri?.id;
            if (isEmriId) {
                const topraklamaRaporu = await auth.prisma.elektrikTopraklamaRaporu.findFirst({
                    where: { altGorev: { isEmriId } },
                    include: { topraklamaCihaz: true },
                    orderBy: { createdAt: 'desc' }
                });
                if (topraklamaRaporu) {
                    topraklamaVerileri = {
                        sistemTipi: topraklamaRaporu.sistemTipi,
                        kontrolNedeni: topraklamaRaporu.kontrolNedeni,
                        projeVar: topraklamaRaporu.projeVar,
                        tekHatSemasiVar: topraklamaRaporu.tekHatSemasiVar,
                        kapsamliDegisiklik: topraklamaRaporu.kapsamliDegisiklik,
                        oncekiKontrolEtiketi: topraklamaRaporu.oncekiKontrolEtiketi,
                        yapiEv: topraklamaRaporu.yapiEv,
                        yapiTicari: topraklamaRaporu.yapiTicari,
                        yapiEndustri: topraklamaRaporu.yapiEndustri,
                        yapiDiger: topraklamaRaporu.yapiDiger,
                        toprakRing: topraklamaRaporu.toprakRing,
                        toprakYuzeysel: topraklamaRaporu.toprakYuzeysel,
                        toprakTemel: topraklamaRaporu.toprakTemel,
                        toprakDerin: topraklamaRaporu.toprakDerin,
                        toprakBelirlenemedi: topraklamaRaporu.toprakBelirlenemedi,
                        olcumCevrimEmpedansi: topraklamaRaporu.olcumCevrimEmpedansi,
                        olcum3UcluTopraklama: topraklamaRaporu.olcum3UcluTopraklama,
                        olcumKlamp: topraklamaRaporu.olcumKlamp,
                        dkdSpdKullanildi: topraklamaRaporu.dkdSpdKullanildi,
                        enerjiSaglayan: topraklamaRaporu.enerjiSaglayan,
                        sebekeGerilimi: topraklamaRaporu.sebekeGerilimi,
                        cihaz: topraklamaRaporu.topraklamaCihaz ? {
                            cihazAdi: topraklamaRaporu.topraklamaCihaz.cihazAdi,
                            seriNo: topraklamaRaporu.topraklamaCihaz.seriNo,
                            kalibrasyonTarihi: topraklamaRaporu.topraklamaCihaz.kalibrasyonTarihi,
                            kalibrasyonGecerlilikTarihi: topraklamaRaporu.topraklamaCihaz.kalibrasyonGecerlilik,
                            kalibrasyonNo: topraklamaRaporu.topraklamaCihaz.kalibrasyonNo
                        } : null
                    };
                }
            }
        } catch (e) {
            console.error('Topraklama verileri çekilirken hata:', e.message);
        }

        const icTesisatWordService = require('./services/elektrikIcTesisatWordService');
        return await icTesisatWordService.generateElektrikIcTesisatWord(rapor, rapor.altGorev?.isEmri, { ...topraklamaVerileri, ...body, tekniker: body.tekniker || {} });
    } else if (isKompresor) {
        const rapor = await auth.prisma.kompresorRaporu.findUnique({
            where: { id: parseInt(raporId) },
            include: { altGorev: { include: { isEmri: { include: { customer: true, firmaBilgi: true } } } } }
        });
        if (!rapor) throw new Error('Rapor bulunamadı');
        const kompresorWordService = require('./services/kompresorWordService');
        return await kompresorWordService.generateKompresorWord(rapor, rapor.altGorev?.isEmri, { tekniker: body.tekniker || {} });
    } else if (isHavaTanki) {
        const rapor = await auth.prisma.havaTankiRaporu.findUnique({
            where: { id: parseInt(raporId) },
            include: { altGorev: { include: { isEmri: { include: { customer: true, firmaBilgi: true } } } } }
        });
        if (!rapor) throw new Error('Rapor bulunamadı');
        const havaTankiWordService = require('./services/havaTankiWordService');
        return await havaTankiWordService.generateHavaTankiWord(rapor, rapor.altGorev?.isEmri, { tekniker: body.tekniker || {} });
    } else if (isElektrik) {
        const rapor = await auth.prisma.elektrikTopraklamaRaporu.findUnique({
            where: { id: parseInt(raporId) },
            include: {
                altGorev: { include: { isEmri: { include: { customer: true, firmaBilgi: true } } } },
                topraklamaCihaz: true, devreCihaz: true, rcdCihaz: true,
                ekipmanBilgi: true,
                detayliOlcumler: { orderBy: { siraNo: 'asc' } },
                rcdSecicilik: { orderBy: { siraNo: 'asc' } }
            }
        });
        if (!rapor) throw new Error('Rapor bulunamadı');
        const elektrikWordService = require('./services/elektrikTopraklamaWordService');
        const olcumler = rapor.detayliOlcumler || [];
        return await elektrikWordService.generateElektrikTopraklamaWord(rapor, rapor.altGorev?.isEmri, olcumler, { ...body, tekniker: body.tekniker || {}, rcdSelektivite: rapor.rcdSecicilik || [] });
    } else {
        // Generic rapor (sablonKodu ile)
        const sablonKodu = raporTipi;
        const rapor = await auth.prisma.rapor.findUnique({
            where: { id: parseInt(raporId) },
            include: { altGorev: { include: { isEmri: { include: { customer: true, firmaBilgi: true } } } } }
        });
        if (!rapor) throw new Error('Rapor bulunamadı');
        return await genericWordService.generateGenericWord(rapor, rapor.altGorev?.isEmri, { tekniker: body.tekniker || {} });
    }
}

// Word buffer'ı PDF'e çevir (font fix + margin fix + LibreOffice)
async function wordBufferToPdf(wordBuffer, label) {
    const JSZip = require('jszip');
    const zip = await JSZip.loadAsync(wordBuffer);
    const fontMap = {
        'Tahoma': 'Carlito',
        'Segoe UI': 'Carlito',
        'Comic Sans MS': 'Carlito',
        'Helvetica': 'Liberation Sans'
    };

    for (const fileName of Object.keys(zip.files)) {
        if (fileName.endsWith('.xml')) {
            let content = await zip.file(fileName).async('string');

            // Font değiştirme
            for (const [oldFont, newFont] of Object.entries(fontMap)) {
                if (content.includes(oldFont)) {
                    content = content.split(oldFont).join(newFont);
                }
            }

            // Font boyutlarını %5 küçült
            content = content.replace(/w:sz="(\d+)"/g, (m, size) => {
                return 'w:sz="' + Math.max(8, Math.round(parseInt(size) * 0.95)) + '"';
            });
            content = content.replace(/w:szCs="(\d+)"/g, (m, size) => {
                return 'w:szCs="' + Math.max(8, Math.round(parseInt(size) * 0.95)) + '"';
            });

            // Sayfa marjinlerini minimize et
            if (fileName === 'word/document.xml') {
                content = content.replace(/<w:pgMar([^/]*)\/>/,(match, attrs) => {
                    attrs = attrs.replace(/w:bottom="\d+"/, 'w:bottom="0"');
                    attrs = attrs.replace(/w:top="\d+"/, 'w:top="284"');
                    attrs = attrs.replace(/w:header="\d+"/, 'w:header="0"');
                    attrs = attrs.replace(/w:footer="\d+"/, 'w:footer="0"');
                    return '<w:pgMar' + attrs + '/>';
                });
            }

            zip.file(fileName, content);
        }
    }

    const fixedBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

    const tmpDir = path.join(__dirname, 'tmp');
    await fs.promises.mkdir(tmpDir, { recursive: true });
    // Benzersiz dosya adı (eşzamanlı isteklerde çakışma/yarış durumunu önler)
    const benzersiz = Date.now() + '-' + crypto.randomBytes(4).toString('hex');
    const tmpFile = path.join(tmpDir, `pdf-${label || 'doc'}-${benzersiz}.docx`);
    const pdfFile = tmpFile.replace(/\.docx$/, '.pdf');

    try {
        await fs.promises.writeFile(tmpFile, fixedBuffer);
        // execFile (shell yok) + async: 60sn'ye kadar event-loop'u bloklamaz
        await execFileAsync('libreoffice', ['--headless', '--norestore', '--convert-to', 'pdf', '--outdir', tmpDir, tmpFile], {
            timeout: 60000,
            env: { ...process.env, HOME: '/tmp' }
        });
        // PDF yoksa readFile ENOENT fırlatır → aşağıda yakalanır
        return await fs.promises.readFile(pdfFile);
    } catch (loError) {
        throw new Error('PDF dönüştürme hatası: ' + loError.message);
    } finally {
        // Geçici dosyaları her durumda temizle (sızıntı olmasın)
        await fs.promises.unlink(tmpFile).catch(() => {});
        await fs.promises.unlink(pdfFile).catch(() => {});
    }
}

// Rapor önizleme (Word → HTML via mammoth)
app.post('/api/rapor-onizleme/:raporTipi/:id', async (req, res) => {
    try {
        const wordBuffer = await generateWordBuffer(req.params.raporTipi, req.params.id, req.body);
        const result = await mammoth.convertToHtml({ buffer: wordBuffer });
        res.json({ html: result.value, warnings: result.messages });
    } catch (error) {
        console.error('Önizleme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Rapor PDF (Word → PDF via LibreOffice) - ortak fonksiyon kullanır
app.post('/api/rapor-pdf/:raporTipi/:id', async (req, res) => {
    try {
        const wordBuffer = await generateWordBuffer(req.params.raporTipi, req.params.id, req.body);
        const pdfBuffer = await wordBufferToPdf(wordBuffer, `rapor-${req.params.id}`);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Rapor_${req.params.id}.pdf"`);
        res.send(pdfBuffer);
    } catch (error) {
        console.error('PDF oluşturma hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ WORD ŞABLON API ============

// Şablonları listele
app.get('/api/word-templates', (req, res) => {
    try {
        const templates = wordTemplateService.listTemplates();
        res.json(templates);
    } catch (error) {
        console.error('Şablon listeleme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Şablon placeholder'larını analiz et
app.get('/api/word-templates/:filename/analyze', (req, res) => {
    try {
        const analysis = wordTemplateService.analyzeTemplate(req.params.filename);
        res.json(analysis);
    } catch (error) {
        console.error('Şablon analiz hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Elektrik Topraklama Raporu için Word dosyası oluştur
app.post('/api/elektrik-topraklama-raporu/:id/word', async (req, res) => {
    try {
        const { uygunlukNotu, kusurlar, kusurAciklama, notlar, tekniker, isgKatipNo, sgkSicilNo } = req.body;

        // Raporu getir
        const rapor = await auth.prisma.elektrikTopraklamaRaporu.findUnique({
            where: { id: parseInt(req.params.id) },
            include: {
                altGorev: {
                    include: {
                        isEmri: {
                            include: {
                                customer: true,
                                firmaBilgi: true
                            }
                        }
                    }
                },
                topraklamaCihaz: true,
                devreCihaz: true,
                rcdCihaz: true,
                ekipmanBilgi: true,
                detayliOlcumler: { orderBy: { siraNo: 'asc' } },
                rcdSecicilik: { orderBy: { siraNo: 'asc' } }
            }
        });

        if (!rapor) {
            return res.status(404).json({ error: 'Rapor bulunamadı' });
        }

        // Şablon tabanlı Word oluştur (find/replace)
        const elektrikWordService = require('./services/elektrikTopraklamaWordService');

        const isEmri = rapor.altGorev?.isEmri;
        const olcumler = rapor.detayliOlcumler || [];

        // Checkbox ve diğer parametreler - HTML'den gelen isimlerle uyumlu
        const {
            // Sistem tipi
            sistemTipi,
            // Checkbox parametreleri
            kontrolNedeni,
            projeVar,
            tekHatSemasiVar,
            // Yapı cinsi (ayrı ayrı geliyor)
            yapiEv,
            yapiTicari,
            yapiEndustri,
            yapiDiger,
            // Topraklayıcı tipi
            toprakRing,
            toprakYuzeysel,
            toprakTemel,
            toprakDerin,
            toprakBelirlenemedi,
            // Koruma önlemi
            korumaEspotansiyel,
            korumaYalitma,
            korumaAyirma,
            korumaKucukGerilim,
            // Diğer checkbox'lar
            kapsamliDegisiklik,
            oncekiKontrolEtiketi,
            // Ölçüm metodu (HTML'den gelen isimlerle)
            olcumCevrimEmpedansi,
            olcum3UcluTopraklama,
            olcumKlamp,
            // Diğer parametreler
            enerjiSaglayan,
            sebekeGerilimi,
            projeBilgileri,
            ekipmanKullanimAmaci,
            sonKontrolTarihi,
            panoTanimi,
            baslangicSaati,
            bitisSaati,
            // Ortam koşulları
            havaDurumu,
            zeminNem,
            // Yer tipi (Normal/Tehlikeli)
            yerTipi,
            // Ölçüm verileri
            olcumler: formOlcumler,
            // RCD Selektivite verileri
            rcdSelektivite: formRcdSelektivite
        } = req.body;

        const options = {
            uygunlukNotu,
            kusurlar,
            kusurAciklama,
            notlar,
            tekniker: tekniker || {},
            isgKatipNo: isgKatipNo || rapor.isgKatipNo,
            sgkSicilNo: sgkSicilNo || rapor.sgkSicilNo,
            // Sistem tipi (formdan veya DB'den)
            sistemTipi: sistemTipi || rapor.sistemTipi,
            // Checkbox parametreleri
            kontrolNedeni,
            projeVar,
            tekHatSemasiVar,
            // Yapı cinsi
            yapiEv,
            yapiTicari,
            yapiEndustri,
            yapiDiger,
            // Topraklayıcı tipi
            toprakRing,
            toprakYuzeysel,
            toprakTemel,
            toprakDerin,
            toprakBelirlenemedi,
            // Koruma önlemi
            korumaEspotansiyel,
            korumaYalitma,
            korumaAyirma,
            korumaKucukGerilim,
            // Diğer checkbox'lar
            kapsamliDegisiklik,
            oncekiKontrolEtiketi,
            // Ölçüm metodu
            olcumCevrim: olcumCevrimEmpedansi,
            olcum3Uclu: olcum3UcluTopraklama,
            olcumKlamp,
            // Diğer parametreler
            enerjiSaglayan,
            sebekeGerilimi,
            projeBilgileri,
            kullanimAmaci: ekipmanKullanimAmaci,
            sonKontrolTarihi,
            panoTanimi,
            baslangicSaati,
            bitisSaati,
            // Ortam koşulları
            havaDurumu,
            zeminNem,
            // Yer tipi
            yerTipi,
            // RCD Selektivite
            rcdSelektivite: formRcdSelektivite && formRcdSelektivite.length > 0
                ? formRcdSelektivite
                : (rapor.rcdSecicilik || [])
        };

        // Ölçüm verileri: Formdan gelen veya DB'den
        const finalOlcumler = formOlcumler && formOlcumler.length > 0 ? formOlcumler : olcumler;

        const wordBuffer = await elektrikWordService.generateElektrikTopraklamaWord(
            rapor,
            isEmri,
            finalOlcumler,
            options
        );

        // Dosya adı
        const filename = `${rapor.raporNo || 'Rapor'}_${Date.now()}.docx`;

        // Response olarak Word dosyasını gönder
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(wordBuffer);

    } catch (error) {
        console.error('Word dosyası oluşturma hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ ELEKTRİK İÇ TESİSAT RAPORU API ============

// Rapor oluştur
// İç tesisat raporu - DB'ye yazılacak alan listesi
const IC_TESISAT_DB_FIELDS = [
    'raporTipiTopraklama', 'raporTipiIcTesisat',
    'sgkSicilNo', 'isgKatipNo',
    'sicaklik', 'nem',
    'sistemTipi', 'sebekeTipi', 'yerTipi',
    'enerjiFirma', 'dkdSpd', 'ilaveTopraklamaElektrotu',
    'kullanimAmaci', 'genelNotlar',
    'koruyucuOnlemler', 'olcumMetodu',
    'fazIletkenSayisiTipi', 'temelTopraklamaDirenci',
    'sistemTopraklamaIletkeni', 'anaEspotansiyelIletkeni',
    'nominalGerilim', 'nominalFrekans', 'hataAkimi', 'cevrimEmpedansi',
    'anaRcdAnmaAkimi', 'anaKesiciTipi', 'anaKesiciNominalAkim', 'anaRcdTestAkimi',
    'genelSonuc', 'sonucAciklama'
];

function extractIcTesisatDbFields(body) {
    const dbData = {};
    IC_TESISAT_DB_FIELDS.forEach(field => {
        if (body[field] !== undefined) dbData[field] = body[field];
    });
    // Tüm form verisini formData JSON'a yaz (yedek + ekstra alanlar)
    const { panolar, linyeler, potansiyeller, zeminler, ...formRest } = body;
    dbData.formData = formRest;
    return dbData;
}

app.post('/api/elektrik-ic-tesisat', async (req, res) => {
    try {
        const body = req.body;
        const altGorevId = parseInt(body.altGorevId);

        const convertDate = (dateStr) => {
            if (!dateStr) return null;
            return new Date(dateStr + 'T00:00:00.000Z');
        };

        // Rapor numarası: EIT-{TeklifNo}-{sıra}
        const altGorev = await auth.prisma.altGorev.findUnique({
            where: { id: altGorevId },
            include: { isEmri: { include: { teklif: true } } }
        });
        const teklifNo = altGorev?.isEmri?.teklif?.teklifNo || new Date().getFullYear().toString();
        const prefix = `EIT-${teklifNo}`;
        const mevcutRaporlar = await auth.prisma.elektrikIcTesisatRaporu.findMany({
            where: { raporNo: { startsWith: prefix } },
            orderBy: { raporNo: 'desc' }
        });
        let sira = 1;
        if (mevcutRaporlar.length > 0) {
            const sonSira = parseInt(mevcutRaporlar[0].raporNo.split('-').pop());
            if (!isNaN(sonSira)) sira = sonSira + 1;
        }
        const raporNo = `${prefix}-${sira.toString().padStart(3, '0')}`;

        const dbData = extractIcTesisatDbFields(body);

        const rapor = await auth.prisma.elektrikIcTesisatRaporu.create({
            data: {
                raporNo,
                altGorevId,
                baslangicTarihi: convertDate(body.baslangicTarihi),
                bitisTarihi: convertDate(body.bitisTarihi),
                sonKontrolTarihi: convertDate(body.sonKontrolTarihi),
                topraklamaRaporuId: body.topraklamaRaporuId ? parseInt(body.topraklamaRaporuId) : undefined,
                ...dbData
            },
            include: {
                altGorev: {
                    include: {
                        isEmri: { include: { customer: true } }
                    }
                },
                panolar: { orderBy: { siraNo: 'asc' } },
                linyeler: { orderBy: { siraNo: 'asc' } },
                potansiyelDengeleme: { orderBy: { siraNo: 'asc' } },
                zeminIzolasyon: { orderBy: { siraNo: 'asc' } }
            }
        });

        // Alt görevin raporNo alanını güncelle
        await auth.prisma.altGorev.update({
            where: { id: altGorevId },
            data: { raporNo }
        });

        res.json(rapor);
    } catch (error) {
        console.error('İç tesisat raporu oluşturma hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// İş emrindeki topraklama raporundan veri çek (iç tesisat için ön doldurma)
app.get('/api/elektrik-ic-tesisat/topraklama-verileri/:altGorevId', async (req, res) => {
    try {
        const altGorevId = parseInt(req.params.altGorevId);
        // Alt görevin bağlı olduğu iş emrini bul
        const altGorev = await auth.prisma.altGorev.findUnique({
            where: { id: altGorevId },
            include: { isEmri: true }
        });
        if (!altGorev) return res.json({});

        // Aynı iş emrindeki topraklama raporlarını bul
        const topraklamaRaporlari = await auth.prisma.elektrikTopraklamaRaporu.findMany({
            where: {
                altGorev: { isEmriId: altGorev.isEmriId }
            },
            include: {
                topraklamaCihaz: true,
                devreCihaz: true,
                rcdCihaz: true,
                ekipmanBilgi: true
            },
            orderBy: { createdAt: 'desc' },
            take: 1
        });

        if (topraklamaRaporlari.length === 0) return res.json({});

        const tr = topraklamaRaporlari[0];

        // İç tesisat formuna aktarılacak veriler
        // Artık checkbox verileri doğrudan rapor modelinde tutuluyor
        res.json({
            topraklamaRaporuId: tr.id,
            sistemTipi: tr.sistemTipi,
            baslangicTarihi: tr.baslangicTarihi,
            bitisTarihi: tr.bitisTarihi,
            ortamSicaklik: tr.ortamSicaklik,
            ortamNem: tr.ortamNem,
            havaDurumu: tr.havaDurumu,
            zeminNem: tr.zeminNem,
            // Ekipman bilgileri (rapor modelinden)
            enerjiSaglayan: tr.enerjiSaglayan,
            sebekeGerilimi: tr.sebekeGerilimi,
            kullanimAmaci: tr.ekipmanKullanimAmaci,
            sonKontrolTarihi: tr.sonKontrolTarihi,
            // Checkbox veriler (rapor modelinden)
            kontrolNedeni: tr.kontrolNedeni,
            projeVar: tr.projeVar,
            tekHatSemasiVar: tr.tekHatSemasiVar,
            kapsamliDegisiklik: tr.kapsamliDegisiklik,
            oncekiKontrolEtiketi: tr.oncekiKontrolEtiketi,
            yapiEv: tr.yapiEv,
            yapiTicari: tr.yapiTicari,
            yapiEndustri: tr.yapiEndustri,
            yapiDiger: tr.yapiDiger,
            toprakRing: tr.toprakRing,
            toprakYuzeysel: tr.toprakYuzeysel,
            toprakTemel: tr.toprakTemel,
            toprakDerin: tr.toprakDerin,
            toprakBelirlenemedi: tr.toprakBelirlenemedi,
            korumaEspotansiyel: tr.korumaEspotansiyel,
            korumaYalitma: tr.korumaYalitma,
            korumaAyirma: tr.korumaAyirma,
            korumaKucukGerilim: tr.korumaKucukGerilim,
            // Ölçüm metodu
            olcumCevrimEmpedansi: tr.olcumCevrimEmpedansi,
            olcum3UcluTopraklama: tr.olcum3UcluTopraklama,
            olcumKlamp: tr.olcumKlamp,
            // Cihaz bilgileri
            cihaz: tr.topraklamaCihaz ? {
                cihazAdi: tr.topraklamaCihaz.cihazAdi,
                seriNo: tr.topraklamaCihaz.seriNo,
                kalibrasyonTarihi: tr.topraklamaCihaz.kalibrasyonTarihi,
                kalibrasyonGecerlilikTarihi: tr.topraklamaCihaz.kalibrasyonGecerlilik,
                kalibrasyonNo: tr.topraklamaCihaz.kalibrasyonNo
            } : null
        });
    } catch (error) {
        console.error('Topraklama verileri getirme hatası:', error);
        res.json({});
    }
});

// Rapor getir (ID ile)
app.get('/api/elektrik-ic-tesisat/:id', async (req, res) => {
    try {
        const rapor = await auth.prisma.elektrikIcTesisatRaporu.findUnique({
            where: { id: parseInt(req.params.id) },
            include: {
                altGorev: {
                    include: {
                        isEmri: {
                            include: {
                                customer: true,
                                firmaBilgi: true
                            }
                        }
                    }
                },
                panolar: { orderBy: { siraNo: 'asc' } },
                linyeler: { orderBy: { siraNo: 'asc' } },
                potansiyelDengeleme: { orderBy: { siraNo: 'asc' } },
                zeminIzolasyon: { orderBy: { siraNo: 'asc' } },
                fotograflar: { orderBy: { siraNo: 'asc' } }
            }
        });

        if (!rapor) {
            return res.status(404).json({ error: 'Rapor bulunamadı' });
        }

        // formData'daki ekstra alanları rapor objesine merge et
        const fd = rapor.formData && typeof rapor.formData === 'object' ? rapor.formData : {};
        res.json({ ...fd, ...rapor });
    } catch (error) {
        console.error('İç tesisat raporu getirme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Alt görev için rapor getir
app.get('/api/elektrik-ic-tesisat/alt-gorev/:altGorevId', async (req, res) => {
    try {
        const rapor = await auth.prisma.elektrikIcTesisatRaporu.findFirst({
            where: { altGorevId: parseInt(req.params.altGorevId) },
            include: {
                altGorev: {
                    include: {
                        isEmri: {
                            include: {
                                customer: true,
                                firmaBilgi: true
                            }
                        }
                    }
                },
                panolar: { orderBy: { siraNo: 'asc' } },
                linyeler: { orderBy: { siraNo: 'asc' } },
                potansiyelDengeleme: { orderBy: { siraNo: 'asc' } },
                zeminIzolasyon: { orderBy: { siraNo: 'asc' } },
                fotograflar: { orderBy: { siraNo: 'asc' } }
            }
        });

        if (rapor) {
            const fd = rapor.formData && typeof rapor.formData === 'object' ? rapor.formData : {};
            return res.json({ ...fd, ...rapor });
        }
        res.json(rapor);
    } catch (error) {
        console.error('İç tesisat raporu getirme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Rapor güncelle
app.put('/api/elektrik-ic-tesisat/:id', async (req, res) => {
    try {
        const body = req.body;

        const convertDate = (dateStr) => {
            if (!dateStr) return null;
            if (dateStr instanceof Date) return dateStr;
            if (typeof dateStr === 'string' && dateStr.includes('T')) return new Date(dateStr);
            return new Date(dateStr + 'T00:00:00.000Z');
        };

        const dbData = extractIcTesisatDbFields(body);

        const rapor = await auth.prisma.elektrikIcTesisatRaporu.update({
            where: { id: parseInt(req.params.id) },
            data: {
                ...dbData,
                baslangicTarihi: convertDate(body.baslangicTarihi),
                bitisTarihi: convertDate(body.bitisTarihi),
                sonKontrolTarihi: convertDate(body.sonKontrolTarihi)
            }
        });

        res.json(rapor);
    } catch (error) {
        console.error('İç tesisat raporu güncelleme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Rapor sil
app.delete('/api/elektrik-ic-tesisat/:id', async (req, res) => {
    try {
        await auth.prisma.elektrikIcTesisatRaporu.delete({
            where: { id: parseInt(req.params.id) }
        });
        res.json({ success: true });
    } catch (error) {
        console.error('İç tesisat raporu silme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// ---- PANO KAYITLARI ----

// Pano DB field listesi
const PANO_DB_FIELDS = [
    'panoAdi',
    'kriter1','kriter2','kriter3','kriter4','kriter5','kriter6','kriter7','kriter8','kriter9',
    'kriter10','kriter11','kriter12','kriter13','kriter14','kriter15','kriter16','kriter17','kriter18',
    'kriter19','kriter20','kriter21','kriter22','kriter23','kriter24','kriter25','kriter26','kriter27',
    'panoZx', 'panoZln', 'panoVff', 'panoVln', 'panoVnpe',
    'panoIkk', 'panoDkdTipi', 'panoDkdAkim',
    'termalFotografTarihi', 'termalFotografNo', 'aciklama'
];

function extractPanoDbFields(body) {
    const dbData = {};
    PANO_DB_FIELDS.forEach(field => {
        if (body[field] !== undefined) dbData[field] = body[field];
    });
    return dbData;
}

// Pano ekle
app.post('/api/elektrik-ic-tesisat/:raporId/pano', async (req, res) => {
    try {
        const raporId = parseInt(req.params.raporId);

        const sonPano = await auth.prisma.icTesisatPano.findFirst({
            where: { raporId },
            orderBy: { siraNo: 'desc' }
        });
        const siraNo = sonPano ? sonPano.siraNo + 1 : 1;

        const pano = await auth.prisma.icTesisatPano.create({
            data: {
                rapor: { connect: { id: raporId } },
                siraNo,
                ...extractPanoDbFields(req.body)
            }
        });

        res.json(pano);
    } catch (error) {
        console.error('Pano ekleme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Pano güncelle
app.put('/api/elektrik-ic-tesisat-pano/:id', async (req, res) => {
    try {
        const pano = await auth.prisma.icTesisatPano.update({
            where: { id: parseInt(req.params.id) },
            data: extractPanoDbFields(req.body)
        });
        res.json(pano);
    } catch (error) {
        console.error('Pano güncelleme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Pano sil
app.delete('/api/elektrik-ic-tesisat-pano/:id', async (req, res) => {
    try {
        await auth.prisma.icTesisatPano.delete({
            where: { id: parseInt(req.params.id) }
        });
        res.json({ success: true });
    } catch (error) {
        console.error('Pano silme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// ---- LİNYE KAYITLARI ----

// Linye ekle (hesaplama dahil)
app.post('/api/elektrik-ic-tesisat/:raporId/linye', async (req, res) => {
    try {
        const raporId = parseInt(req.params.raporId);
        const { panoLinyeAdi, egriTipi, kutupSayisi, inA, icuKA,
                fazKesiti, nKesiti, peKesiti, ibA, izA, zxOhm, rcdIAn, rcdTSuresi } = req.body;

        // Rapor bilgisini al (yerTipi ve sebekeTipi için)
        const rapor = await auth.prisma.elektrikIcTesisatRaporu.findUnique({
            where: { id: raporId },
            select: { yerTipi: true, sebekeTipi: true, sistemTipi: true }
        });

        const In = parseFloat(inA) || 0;
        const Zx = parseFloat(zxOhm) || 0;
        const Ib = parseFloat(ibA) || 0;
        const Iz = parseFloat(izA) || 0;
        const RcdIAnVal = parseFloat(rcdIAn) || 0;

        // Ia hesaplama
        let ia = 0;
        if (egriTipi === 'B') ia = In * 5;
        else if (egriTipi === 'C') ia = In * 10;
        else if (egriTipi === 'D') ia = In * 20;
        else if (egriTipi === 'TMS') ia = In * 10;

        // Zs/RA hesaplama
        let zsRa = 0;
        const isTT = (rapor?.sebekeTipi || rapor?.sistemTipi || '').toUpperCase() === 'TT';
        const isTehlikeli = rapor?.yerTipi === 'TEHLIKELI';

        if (RcdIAnVal > 0) {
            const ideltaA = RcdIAnVal / 1000;
            zsRa = (isTehlikeli ? 25 : 50) / ideltaA;
        } else if (ia > 0) {
            if (isTT) {
                zsRa = isTehlikeli ? 25 / ia : 50 / ia;
            } else {
                zsRa = 230 / ia;
            }
        }

        // Ik1 hesaplama
        const ik1 = Zx > 0 ? 230 / Zx : 0;

        // Uygunluk kontrolü
        let sonuc = null;
        let notKodu = null;
        if (Zx > 0 && zsRa > 0) {
            if (RcdIAnVal > 0 && Zx <= zsRa) {
                sonuc = 'UYGUN';
                notKodu = 'Not-4';
            } else if (Zx <= zsRa) {
                sonuc = 'UYGUN';
                notKodu = 'Not-1';
            } else {
                sonuc = 'UYGUN_DEGIL';
                notKodu = 'Not-2';
            }
        }

        // Koordinasyon kontrolü: Ib <= In <= Iz
        let koordinasyonSonuc = null;
        if (Ib > 0 && In > 0 && Iz > 0) {
            koordinasyonSonuc = (Ib <= In && In <= Iz) ? 'UYGUN' : 'UYGUN_DEGIL';
        }

        // PE kesit kontrolü
        let peKesitSonuc = null;
        const fazKesit = parseFloat(fazKesiti) || 0;
        const peKesit = parseFloat(peKesiti) || 0;
        if (fazKesit > 0 && peKesit > 0) {
            let gerekliPE;
            if (fazKesit <= 16) gerekliPE = fazKesit;
            else if (fazKesit <= 35) gerekliPE = 16;
            else gerekliPE = fazKesit / 2;
            peKesitSonuc = peKesit >= gerekliPE ? 'UYGUN' : 'UYGUN_DEGIL';
        }

        // Sıra no
        const sonLinye = await auth.prisma.icTesisatLinye.findFirst({
            where: { raporId },
            orderBy: { siraNo: 'desc' }
        });
        const siraNo = sonLinye ? sonLinye.siraNo + 1 : 1;

        const linye = await auth.prisma.icTesisatLinye.create({
            data: {
                rapor: { connect: { id: raporId } },
                siraNo,
                panoLinyeAdi: panoLinyeAdi || null,
                egriTipi: egriTipi || null,
                kutupSayisi: kutupSayisi || null,
                inA: inA ? parseFloat(inA) : null,
                icuKA: icuKA ? parseFloat(icuKA) : null,
                fazKesiti: fazKesiti || null,
                nKesiti: nKesiti || null,
                peKesiti: peKesiti || null,
                ibA: ibA ? parseFloat(ibA) : null,
                izA: izA ? parseFloat(izA) : null,
                zxOhm: zxOhm ? parseFloat(zxOhm) : null,
                rcdIAn: rcdIAn ? parseFloat(rcdIAn) : null,
                rcdTSuresi: rcdTSuresi ? parseFloat(rcdTSuresi) : null,
                ia: ia || null,
                zsRa: zsRa || null,
                ik1: ik1 || null,
                koordinasyonSonuc,
                peKesitSonuc,
                sonuc,
                notKodu
            }
        });

        res.json(linye);
    } catch (error) {
        console.error('Linye ekleme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Linye güncelle
app.put('/api/elektrik-ic-tesisat-linye/:id', async (req, res) => {
    try {
        const { panoLinyeAdi, egriTipi, kutupSayisi, inA, icuKA,
                fazKesiti, nKesiti, peKesiti, ibA, izA, zxOhm, rcdIAn, rcdTSuresi } = req.body;

        // Mevcut linye'yi al (raporId için)
        const mevcutLinye = await auth.prisma.icTesisatLinye.findUnique({
            where: { id: parseInt(req.params.id) },
            select: { raporId: true }
        });

        // Rapor bilgisi
        const rapor = await auth.prisma.elektrikIcTesisatRaporu.findUnique({
            where: { id: mevcutLinye.raporId },
            select: { yerTipi: true, sebekeTipi: true, sistemTipi: true }
        });

        const In = parseFloat(inA) || 0;
        const Zx = parseFloat(zxOhm) || 0;
        const Ib = parseFloat(ibA) || 0;
        const Iz = parseFloat(izA) || 0;
        const RcdIAnVal = parseFloat(rcdIAn) || 0;

        let ia = 0;
        if (egriTipi === 'B') ia = In * 5;
        else if (egriTipi === 'C') ia = In * 10;
        else if (egriTipi === 'D') ia = In * 20;
        else if (egriTipi === 'TMS') ia = In * 10;

        let zsRa = 0;
        const isTT = (rapor?.sebekeTipi || rapor?.sistemTipi || '').toUpperCase() === 'TT';
        const isTehlikeli = rapor?.yerTipi === 'TEHLIKELI';

        if (RcdIAnVal > 0) {
            const ideltaA = RcdIAnVal / 1000;
            zsRa = (isTehlikeli ? 25 : 50) / ideltaA;
        } else if (ia > 0) {
            if (isTT) {
                zsRa = isTehlikeli ? 25 / ia : 50 / ia;
            } else {
                zsRa = 230 / ia;
            }
        }

        const ik1 = Zx > 0 ? 230 / Zx : 0;

        let sonuc = null;
        let notKodu = null;
        if (Zx > 0 && zsRa > 0) {
            if (RcdIAnVal > 0 && Zx <= zsRa) {
                sonuc = 'UYGUN';
                notKodu = 'Not-4';
            } else if (Zx <= zsRa) {
                sonuc = 'UYGUN';
                notKodu = 'Not-1';
            } else {
                sonuc = 'UYGUN_DEGIL';
                notKodu = 'Not-2';
            }
        }

        let koordinasyonSonuc = null;
        if (Ib > 0 && In > 0 && Iz > 0) {
            koordinasyonSonuc = (Ib <= In && In <= Iz) ? 'UYGUN' : 'UYGUN_DEGIL';
        }

        let peKesitSonuc = null;
        const fazKesit = parseFloat(fazKesiti) || 0;
        const peKesit = parseFloat(peKesiti) || 0;
        if (fazKesit > 0 && peKesit > 0) {
            let gerekliPE;
            if (fazKesit <= 16) gerekliPE = fazKesit;
            else if (fazKesit <= 35) gerekliPE = 16;
            else gerekliPE = fazKesit / 2;
            peKesitSonuc = peKesit >= gerekliPE ? 'UYGUN' : 'UYGUN_DEGIL';
        }

        const linye = await auth.prisma.icTesisatLinye.update({
            where: { id: parseInt(req.params.id) },
            data: {
                panoLinyeAdi: panoLinyeAdi || null,
                egriTipi: egriTipi || null,
                kutupSayisi: kutupSayisi || null,
                inA: inA ? parseFloat(inA) : null,
                icuKA: icuKA ? parseFloat(icuKA) : null,
                fazKesiti: fazKesiti || null,
                nKesiti: nKesiti || null,
                peKesiti: peKesiti || null,
                ibA: ibA ? parseFloat(ibA) : null,
                izA: izA ? parseFloat(izA) : null,
                zxOhm: zxOhm ? parseFloat(zxOhm) : null,
                rcdIAn: rcdIAn ? parseFloat(rcdIAn) : null,
                rcdTSuresi: rcdTSuresi ? parseFloat(rcdTSuresi) : null,
                ia: ia || null,
                zsRa: zsRa || null,
                ik1: ik1 || null,
                koordinasyonSonuc,
                peKesitSonuc,
                sonuc,
                notKodu
            }
        });

        res.json(linye);
    } catch (error) {
        console.error('Linye güncelleme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Linye sil
app.delete('/api/elektrik-ic-tesisat-linye/:id', async (req, res) => {
    try {
        await auth.prisma.icTesisatLinye.delete({
            where: { id: parseInt(req.params.id) }
        });
        res.json({ success: true });
    } catch (error) {
        console.error('Linye silme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// ---- POTANSİYEL DENGELEME KAYITLARI ----

// Potansiyel dengeleme ekle
app.post('/api/elektrik-ic-tesisat/:raporId/potansiyel', async (req, res) => {
    try {
        const raporId = parseInt(req.params.raporId);

        const sonKayit = await auth.prisma.icTesisatPotansiyelDengeleme.findFirst({
            where: { raporId },
            orderBy: { siraNo: 'desc' }
        });
        const siraNo = sonKayit ? sonKayit.siraNo + 1 : 1;

        const { olcumNoktasi, iletkenKesiti, sureklillikOhm, tamamlayiciKesit, tamamlayiciSureklilik } = req.body;

        // Süreklilik sonucu: <= 1 ohm uygun
        let sonuc = null;
        const sureklilik = parseFloat(sureklillikOhm);
        if (!isNaN(sureklilik)) {
            sonuc = sureklilik <= 1 ? 'UYGUN' : 'UYGUN_DEGIL';
        }

        const kayit = await auth.prisma.icTesisatPotansiyelDengeleme.create({
            data: {
                rapor: { connect: { id: raporId } },
                siraNo,
                olcumNoktasi: olcumNoktasi || null,
                iletkenKesiti: iletkenKesiti || null,
                sureklillikOhm: sureklillikOhm ? parseFloat(sureklillikOhm) : null,
                tamamlayiciKesit: tamamlayiciKesit || null,
                tamamlayiciSureklilik: tamamlayiciSureklilik ? parseFloat(tamamlayiciSureklilik) : null,
                sonuc
            }
        });

        res.json(kayit);
    } catch (error) {
        console.error('Potansiyel dengeleme ekleme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Potansiyel dengeleme güncelle
app.put('/api/elektrik-ic-tesisat-potansiyel/:id', async (req, res) => {
    try {
        const { olcumNoktasi, iletkenKesiti, sureklillikOhm, tamamlayiciKesit, tamamlayiciSureklilik } = req.body;

        let sonuc = null;
        const sureklilik = parseFloat(sureklillikOhm);
        if (!isNaN(sureklilik)) {
            sonuc = sureklilik <= 1 ? 'UYGUN' : 'UYGUN_DEGIL';
        }

        const kayit = await auth.prisma.icTesisatPotansiyelDengeleme.update({
            where: { id: parseInt(req.params.id) },
            data: {
                olcumNoktasi: olcumNoktasi || null,
                iletkenKesiti: iletkenKesiti || null,
                sureklillikOhm: sureklillikOhm ? parseFloat(sureklillikOhm) : null,
                tamamlayiciKesit: tamamlayiciKesit || null,
                tamamlayiciSureklilik: tamamlayiciSureklilik ? parseFloat(tamamlayiciSureklilik) : null,
                sonuc
            }
        });

        res.json(kayit);
    } catch (error) {
        console.error('Potansiyel dengeleme güncelleme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Potansiyel dengeleme sil
app.delete('/api/elektrik-ic-tesisat-potansiyel/:id', async (req, res) => {
    try {
        await auth.prisma.icTesisatPotansiyelDengeleme.delete({
            where: { id: parseInt(req.params.id) }
        });
        res.json({ success: true });
    } catch (error) {
        console.error('Potansiyel dengeleme silme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// ---- ZEMİN İZOLASYON KAYITLARI ----

// Zemin izolasyon ekle
app.post('/api/elektrik-ic-tesisat/:raporId/zemin', async (req, res) => {
    try {
        const raporId = parseInt(req.params.raporId);

        const sonKayit = await auth.prisma.icTesisatZeminIzolasyon.findFirst({
            where: { raporId },
            orderBy: { siraNo: 'desc' }
        });
        const siraNo = sonKayit ? sonKayit.siraNo + 1 : 1;

        const { olcumNoktasi, eni, boyu, izolasyonDirenciKOhm } = req.body;

        // Zemin izolasyon sonucu: >= 50 kOhm uygun
        let sonuc = null;
        const direnc = parseFloat(izolasyonDirenciKOhm);
        if (!isNaN(direnc)) {
            sonuc = direnc >= 50 ? 'UYGUN' : 'UYGUN_DEGIL';
        }

        const kayit = await auth.prisma.icTesisatZeminIzolasyon.create({
            data: {
                rapor: { connect: { id: raporId } },
                siraNo,
                olcumNoktasi: olcumNoktasi || null,
                eni: eni ? parseFloat(eni) : null,
                boyu: boyu ? parseFloat(boyu) : null,
                izolasyonDirenciKOhm: izolasyonDirenciKOhm ? parseFloat(izolasyonDirenciKOhm) : null,
                sonuc
            }
        });

        res.json(kayit);
    } catch (error) {
        console.error('Zemin izolasyon ekleme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Zemin izolasyon güncelle
app.put('/api/elektrik-ic-tesisat-zemin/:id', async (req, res) => {
    try {
        const { olcumNoktasi, eni, boyu, izolasyonDirenciKOhm } = req.body;

        let sonuc = null;
        const direnc = parseFloat(izolasyonDirenciKOhm);
        if (!isNaN(direnc)) {
            sonuc = direnc >= 50 ? 'UYGUN' : 'UYGUN_DEGIL';
        }

        const kayit = await auth.prisma.icTesisatZeminIzolasyon.update({
            where: { id: parseInt(req.params.id) },
            data: {
                olcumNoktasi: olcumNoktasi || null,
                eni: eni ? parseFloat(eni) : null,
                boyu: boyu ? parseFloat(boyu) : null,
                izolasyonDirenciKOhm: izolasyonDirenciKOhm ? parseFloat(izolasyonDirenciKOhm) : null,
                sonuc
            }
        });

        res.json(kayit);
    } catch (error) {
        console.error('Zemin izolasyon güncelleme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Zemin izolasyon sil
app.delete('/api/elektrik-ic-tesisat-zemin/:id', async (req, res) => {
    try {
        await auth.prisma.icTesisatZeminIzolasyon.delete({
            where: { id: parseInt(req.params.id) }
        });
        res.json({ success: true });
    } catch (error) {
        console.error('Zemin izolasyon silme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// ---- İÇ TESİSAT WORD RAPOR ----

// Word rapor oluştur
app.post('/api/elektrik-ic-tesisat/:id/word-rapor', async (req, res) => {
    try {
        const rapor = await auth.prisma.elektrikIcTesisatRaporu.findUnique({
            where: { id: parseInt(req.params.id) },
            include: {
                altGorev: {
                    include: {
                        isEmri: {
                            include: {
                                customer: true,
                                firmaBilgi: true
                            }
                        }
                    }
                },
                panolar: { orderBy: { siraNo: 'asc' } },
                linyeler: { orderBy: { siraNo: 'asc' } },
                potansiyelDengeleme: { orderBy: { siraNo: 'asc' } },
                zeminIzolasyon: { orderBy: { siraNo: 'asc' } },
                fotograflar: { orderBy: { siraNo: 'asc' } }
            }
        });

        if (!rapor) {
            return res.status(404).json({ error: 'Rapor bulunamadı' });
        }

        const elektrikIcTesisatWordService = require('./services/elektrikIcTesisatWordService');
        const isEmri = rapor.altGorev?.isEmri;

        const wordBuffer = await elektrikIcTesisatWordService.generateElektrikIcTesisatWord(
            rapor,
            isEmri,
            req.body
        );

        const filename = `${rapor.raporNo || 'IcTesisat'}_${Date.now()}.docx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(wordBuffer);

    } catch (error) {
        console.error('İç tesisat Word rapor hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// ---- İÇ TESİSAT FOTOĞRAF ----

// Fotoğraf yükle
app.post('/api/elektrik-ic-tesisat/:raporId/foto', dosyaUpload.single('dosya'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Dosya yüklenmedi' });
        }

        const raporId = parseInt(req.params.raporId);
        const { fotoTipi, panoId, aciklama } = req.body;

        const sonFoto = await auth.prisma.icTesisatFoto.findFirst({
            where: { raporId, fotoTipi: fotoTipi || 'ekipman' },
            orderBy: { siraNo: 'desc' }
        });
        const siraNo = sonFoto ? sonFoto.siraNo + 1 : 1;

        const foto = await auth.prisma.icTesisatFoto.create({
            data: {
                raporId,
                panoId: panoId ? parseInt(panoId) : null,
                fotoTipi: fotoTipi || 'ekipman',
                dosyaYolu: '/uploads/dosyalar/' + req.file.filename,
                dosyaAdi: req.file.originalname,
                aciklama: aciklama || null,
                siraNo
            }
        });

        res.json(foto);
    } catch (error) {
        console.error('Fotoğraf yükleme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Fotoğraf listele
app.get('/api/elektrik-ic-tesisat/:raporId/foto', async (req, res) => {
    try {
        const raporId = parseInt(req.params.raporId);
        const where = { raporId };
        if (req.query.fotoTipi) where.fotoTipi = req.query.fotoTipi;
        if (req.query.panoId) where.panoId = parseInt(req.query.panoId);

        const fotograflar = await auth.prisma.icTesisatFoto.findMany({
            where,
            orderBy: { siraNo: 'asc' }
        });

        res.json(fotograflar);
    } catch (error) {
        console.error('Fotoğraf listeleme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Fotoğraf güncelle
app.put('/api/elektrik-ic-tesisat-foto/:id', async (req, res) => {
    try {
        const fotoId = parseInt(req.params.id);
        const mevcut = await auth.prisma.icTesisatFoto.findUnique({ where: { id: fotoId } });
        if (!mevcut) return res.status(404).json({ error: 'Fotoğraf bulunamadı' });

        const { aciklama, siraNo } = req.body;
        const data = {};
        if (aciklama !== undefined) data.aciklama = aciklama;
        if (siraNo !== undefined) data.siraNo = parseInt(siraNo);

        const foto = await auth.prisma.icTesisatFoto.update({
            where: { id: fotoId },
            data
        });
        res.json(foto);
    } catch (error) {
        console.error('Fotoğraf güncelleme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Fotoğraf sil (dosyayı da sil)
app.delete('/api/elektrik-ic-tesisat-foto/:id', async (req, res) => {
    try {
        const foto = await auth.prisma.icTesisatFoto.findUnique({
            where: { id: parseInt(req.params.id) }
        });

        if (foto) {
            // Disk'ten sil
            const dosyaPath = path.join(__dirname, 'public', foto.dosyaYolu);
            if (fs.existsSync(dosyaPath)) {
                fs.unlinkSync(dosyaPath);
            }

            await auth.prisma.icTesisatFoto.delete({
                where: { id: parseInt(req.params.id) }
            });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Fotoğraf silme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ SİSTEM DOSYA API ============

const pdfMergeService = require('./services/pdfMergeService');

// Dosya yükle
app.post('/api/sistem-dosya', dosyaUpload.single('dosya'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Dosya yüklenmedi' });
        }

        const { dosyaTipi, kategori, aciklama, personelId, isEmriId } = req.body;

        const dosya = await auth.prisma.sistemDosya.create({
            data: {
                dosyaAdi: req.file.originalname,
                dosyaYolu: '/uploads/dosyalar/' + req.file.filename,
                dosyaTipi: dosyaTipi || 'diger',
                kategori: kategori || null,
                aciklama: aciklama || null,
                personelId: personelId ? parseInt(personelId) : null,
                isEmriId: isEmriId ? parseInt(isEmriId) : null
            }
        });

        res.json(dosya);
    } catch (error) {
        console.error('Dosya yükleme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Dosya listele (filtrelenebilir)
app.get('/api/sistem-dosya', async (req, res) => {
    try {
        const { dosyaTipi, personelId, isEmriId } = req.query;
        const where = {};
        if (dosyaTipi) where.dosyaTipi = dosyaTipi;
        if (personelId) where.personelId = parseInt(personelId);
        if (isEmriId) where.isEmriId = parseInt(isEmriId);

        const dosyalar = await auth.prisma.sistemDosya.findMany({
            where,
            include: {
                personel: { select: { id: true, adSoyad: true } },
                isEmri: { select: { id: true, isEmriNo: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json(dosyalar);
    } catch (error) {
        console.error('Dosya listeleme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Dosya sil
app.delete('/api/sistem-dosya/:id', async (req, res) => {
    try {
        const dosya = await auth.prisma.sistemDosya.findUnique({
            where: { id: parseInt(req.params.id) }
        });

        if (!dosya) {
            return res.status(404).json({ error: 'Dosya bulunamadı' });
        }

        // Fiziksel dosyayı sil
        const filePath = path.join(__dirname, 'public', dosya.dosyaYolu);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // DB kaydını sil
        await auth.prisma.sistemDosya.delete({
            where: { id: parseInt(req.params.id) }
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Dosya silme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ İŞ EMRİ DOSYA TOPLAMA ============

// İş emrine ait tüm dosyaları topla
app.get('/api/is-emirleri/:id/dosyalar', async (req, res) => {
    try {
        const isEmriId = parseInt(req.params.id);

        // İş emri ve alt görevlerini getir
        const isEmri = await auth.prisma.isEmri.findUnique({
            where: { id: isEmriId },
            include: {
                customer: true,
                altGorevler: {
                    include: {
                        personel: true,
                        elektrikTopraklamaRaporu: true,
                        icTesisatRaporlari: true,
                        kompresorRaporlari: true,
                        havaTankiRaporlari: true,
                        raporlar: true
                    }
                }
            }
        });

        if (!isEmri) {
            return res.status(404).json({ error: 'İş emri bulunamadı' });
        }

        // 1. Kapak dosyaları
        const kapaklar = await auth.prisma.sistemDosya.findMany({
            where: { dosyaTipi: 'kapak', isEmriId }
        });

        // 2. Raporlar - tüm alt görevlerdeki raporları topla
        const raporlar = [];
        for (const ag of isEmri.altGorevler) {
            for (const r of (ag.elektrikTopraklamaRaporu || [])) {
                raporlar.push({ id: r.id, raporNo: r.raporNo, raporTipi: 'elektrik-topraklama', tip: 'Elektrik Topraklama', altGorevId: ag.id });
            }
            for (const r of (ag.icTesisatRaporlari || [])) {
                raporlar.push({ id: r.id, raporNo: r.raporNo, raporTipi: 'elektrik-ic-tesisat', tip: 'Elektrik İç Tesisat', altGorevId: ag.id });
            }
            for (const r of (ag.kompresorRaporlari || [])) {
                raporlar.push({ id: r.id, raporNo: r.raporNo, raporTipi: 'kompresor', tip: 'Kompresör', altGorevId: ag.id });
            }
            for (const r of (ag.havaTankiRaporlari || [])) {
                raporlar.push({ id: r.id, raporNo: r.raporNo, raporTipi: 'hava-tanki', tip: 'Hava Tankı', altGorevId: ag.id });
            }
            for (const r of (ag.raporlar || [])) {
                raporlar.push({ id: r.id, raporNo: r.raporNo, raporTipi: r.sablonKodu, tip: r.sablonKodu, altGorevId: ag.id, isGeneric: true });
            }
        }

        // 3. Kalibrasyon sertifikaları - raporlarda kullanılan cihazlar
        const cihazIds = new Set();
        for (const ag of isEmri.altGorevler) {
            for (const r of (ag.elektrikTopraklamaRaporu || [])) {
                if (r.topraklamaCihazId) cihazIds.add(r.topraklamaCihazId);
                if (r.devreCihazId) cihazIds.add(r.devreCihazId);
                if (r.rcdCihazId) cihazIds.add(r.rcdCihazId);
            }
        }

        const kalibrasyonlar = [];
        if (cihazIds.size > 0) {
            const cihazlar = await auth.prisma.olcumCihazi.findMany({
                where: { id: { in: Array.from(cihazIds) } }
            });
            for (const c of cihazlar) {
                if (c.sertifikaDosya) {
                    kalibrasyonlar.push({
                        cihazId: c.id,
                        cihazAdi: c.cihazAdi,
                        marka: c.marka,
                        model: c.model,
                        seriNo: c.seriNo,
                        dosyaYolu: c.sertifikaDosya
                    });
                }
            }
        }

        // 4. Eğitim sertifikaları - alt görevlere atanan personellerin dosyaları
        const personelIds = [...new Set(isEmri.altGorevler.map(ag => ag.personelId).filter(Boolean))];
        const egitimSertifikalari = personelIds.length > 0 ? await auth.prisma.sistemDosya.findMany({
            where: { dosyaTipi: 'egitim', personelId: { in: personelIds } },
            include: { personel: { select: { id: true, adSoyad: true } } }
        }) : [];

        // 5. İş emrine bağlı diğer dosyalar
        const digerDosyalar = await auth.prisma.sistemDosya.findMany({
            where: { isEmriId, dosyaTipi: { notIn: ['kapak'] } }
        });

        res.json({
            isEmriNo: isEmri.isEmriNo,
            musteri: isEmri.customer?.unvan,
            kapaklar,
            raporlar,
            kalibrasyonlar,
            egitimSertifikalari,
            digerDosyalar
        });
    } catch (error) {
        console.error('İş emri dosya toplama hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ PDF BİRLEŞTİRME ============

// PDF birleştir
app.post('/api/is-emirleri/:id/pdf-birlestir', async (req, res) => {
    try {
        // Uzun sürebilir, timeout'u artır (5 dk)
        req.setTimeout(300000);
        res.setTimeout(300000);

        const isEmriId = parseInt(req.params.id);
        const { dosyaSirasi } = req.body;

        console.log(`PDF birleştirme başladı - İş Emri: ${isEmriId}, Dosya sayısı: ${dosyaSirasi?.length || 0}`);

        if (!dosyaSirasi || !Array.isArray(dosyaSirasi) || dosyaSirasi.length === 0) {
            return res.status(400).json({ error: 'Birleştirilecek dosya listesi gerekli' });
        }

        const pdfBuffers = [];

        for (let i = 0; i < dosyaSirasi.length; i++) {
            const item = dosyaSirasi[i];
            console.log(`  [${i+1}/${dosyaSirasi.length}] İşleniyor: tip=${item.tip}, id=${item.id || item.raporId || item.dosyaId || item.cihazId}`);
            try {
                if (item.tip === 'rapor') {
                    // Rapor → Word → PDF (font fix + margin fix + LibreOffice)
                    const wordBuffer = await generateWordBuffer(item.raporTipi, item.raporId || item.id, { tekniker: {} });
                    pdfBuffers.push(await wordBufferToPdf(wordBuffer, `merge-rapor-${item.id || item.raporId}`));
                } else if (item.tip === 'kalibrasyon') {
                    // Kalibrasyon sertifikası - cihazdan dosya yolu al
                    const cihaz = await auth.prisma.olcumCihazi.findUnique({
                        where: { id: parseInt(item.cihazId) }
                    });
                    if (cihaz?.sertifikaDosya) {
                        const filePath = path.join(__dirname, 'public', cihaz.sertifikaDosya);
                        if (fs.existsSync(filePath)) {
                            pdfBuffers.push(await pdfMergeService.fileToPdfBuffer(filePath));
                        }
                    }
                } else if (item.tip === 'kapak' || item.tip === 'egitim' || item.tip === 'dosya') {
                    // SistemDosya tablosundan
                    const dosyaId = item.dosyaId || item.id;
                    const dosya = await auth.prisma.sistemDosya.findUnique({
                        where: { id: parseInt(dosyaId) }
                    });
                    if (dosya?.dosyaYolu) {
                        const filePath = path.join(__dirname, 'public', dosya.dosyaYolu);
                        if (fs.existsSync(filePath)) {
                            pdfBuffers.push(await pdfMergeService.fileToPdfBuffer(filePath));
                        }
                    }
                }
            } catch (itemErr) {
                console.error(`Dosya birleştirme hatası (${item.tip}):`, itemErr.message);
                // Hatalı dosyayı atla, devam et
            }
        }

        console.log(`  Toplam ${pdfBuffers.length} PDF buffer hazır`);

        if (pdfBuffers.length === 0) {
            return res.status(400).json({ error: 'Birleştirilecek geçerli dosya bulunamadı' });
        }

        const mergedPdf = await pdfMergeService.mergePdfs(pdfBuffers);
        console.log(`  Birleştirilmiş PDF boyutu: ${mergedPdf.length} bytes`);

        // İş emri no'yu al
        const isEmri = await auth.prisma.isEmri.findUnique({
            where: { id: isEmriId },
            select: { isEmriNo: true }
        });
        const filename = `${isEmri?.isEmriNo || 'Rapor'}_Birlesik_${Date.now()}.pdf`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', mergedPdf.length);
        res.send(mergedPdf);
        console.log(`PDF birleştirme tamamlandı: ${filename}`);
    } catch (error) {
        console.error('PDF birleştirme hatası:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message });
        }
    }
});

// Oluşturulan raporları indirme
app.use('/output', express.static(path.join(__dirname, 'output')));

// ============ STATIK SAYFALAR ============

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// ===================== SUPERADMIN (TENANT YÖNETİMİ) =====================
// Sadece platform sahibi (role='superadmin'). Tenant'lar arası tam erişim.
function superadminOnly(req, res, next) {
    if (!req.user || req.user.role !== 'superadmin') {
        return res.status(403).json({ error: 'Bu işlem için superadmin yetkisi gerekli' });
    }
    next();
}

// Tenant listesi + kayıt sayıları
app.get('/api/superadmin/tenants', superadminOnly, async (req, res) => {
    try {
        const tenants = await auth.prisma.tenant.findMany({ orderBy: { id: 'asc' } });
        const sayim = async (model) => {
            const g = await auth.prisma[model].groupBy({ by: ['tenantId'], _count: { _all: true } });
            return new Map(g.map(x => [x.tenantId, x._count._all]));
        };
        const [musteri, teklif, kullanici, isemri] = await Promise.all([
            sayim('customer'), sayim('teklif'), sayim('user'), sayim('isEmri')
        ]);
        res.json(tenants.map(t => ({
            ...t,
            sayim: {
                musteri: musteri.get(t.id) || 0,
                teklif: teklif.get(t.id) || 0,
                kullanici: kullanici.get(t.id) || 0,
                isemri: isemri.get(t.id) || 0
            }
        })));
    } catch (e) { console.error('Tenant listesi hatası:', e); res.status(500).json({ error: e.message }); }
});

// Yeni tenant oluştur (+ firma ayarları + opsiyonel ilk admin kullanıcı)
app.post('/api/superadmin/tenants', superadminOnly, async (req, res) => {
    try {
        const { ad, slug, plan, adminEmail, adminSifre, adminAd } = req.body;
        if (!ad || !slug) return res.status(400).json({ error: 'Firma adı ve slug (kısa ad) zorunlu' });
        if (!/^[a-z0-9-]+$/.test(slug)) return res.status(400).json({ error: 'Slug sadece küçük harf, rakam ve - içerebilir' });

        const mevcut = await auth.prisma.tenant.findUnique({ where: { slug } });
        if (mevcut) return res.status(400).json({ error: 'Bu slug zaten kullanımda' });

        if (adminEmail) {
            const varMi = await auth.prisma.user.findUnique({ where: { email: adminEmail } });
            if (varMi) return res.status(400).json({ error: 'Bu admin e-postası zaten kayıtlı' });
        }

        const tenant = await auth.prisma.tenant.create({ data: { ad, slug, plan: plan || 'standart', aktif: true } });

        // Firma ayarları (FirmaAyarlari.id autoincrement değil → sonraki id'yi manuel ver)
        const enBuyuk = await auth.prisma.firmaAyarlari.findFirst({ orderBy: { id: 'desc' } });
        await auth.prisma.firmaAyarlari.create({ data: { id: (enBuyuk?.id || 0) + 1, tenantId: tenant.id, name: ad } });

        let kullanici = null;
        if (adminEmail && adminSifre) {
            kullanici = await auth.prisma.user.create({
                data: {
                    tenantId: tenant.id, email: adminEmail, password: auth.hashPassword(adminSifre),
                    name: adminAd || ad, role: 'admin', emailVerified: true
                }
            });
        }
        res.json({ success: true, tenant, kullanici: kullanici ? { id: kullanici.id, email: kullanici.email } : null });
    } catch (e) { console.error('Tenant oluşturma hatası:', e); res.status(500).json({ error: e.message }); }
});

// Tenant güncelle (ad / plan / aktif / notlar)
app.put('/api/superadmin/tenants/:id', superadminOnly, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { ad, plan, aktif, notlar } = req.body;
        const data = {};
        if (ad !== undefined) data.ad = ad;
        if (plan !== undefined) data.plan = plan;
        if (aktif !== undefined) data.aktif = aktif;
        if (notlar !== undefined) data.notlar = notlar;
        const tenant = await auth.prisma.tenant.update({ where: { id }, data });
        res.json({ success: true, tenant });
    } catch (e) { console.error('Tenant güncelleme hatası:', e); res.status(500).json({ error: e.message }); }
});

// ============ GLOBAL HATA YAKALAYICI ============
// Route'larda yakalanmayan hatalar burada toplanır; iç hata detayı client'a sızmaz.
// (multer dosya filtresi/boyut hataları da buraya düşer.)
app.use((err, req, res, next) => {
    console.error('Yakalanmayan istek hatası:', err && err.message ? err.message : err);
    if (res.headersSent) return next(err);
    const status = err && err.status ? err.status : (err && err.code === 'LIMIT_FILE_SIZE' ? 400 : 500);
    res.status(status).json({ error: err && err.message ? err.message : 'Sunucu hatası' });
});

// Süreç seviyesinde güvenlik ağı: yakalanmayan promise reddi / istisna process'i düşürmesin
process.on('unhandledRejection', (reason) => {
    console.error('İşlenmeyen promise reddi:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('Yakalanmayan istisna:', err);
    // Loglanır; PM2 gerçekten ölümcül durumda yeniden başlatır. Süreci burada zorla kapatmıyoruz
    // ki tek bir hatalı istek tüm servisi düşürmesin.
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
