const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-in-production';
const JWT_EXPIRES_IN = '24h';

// Şifre hashleme
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return salt + ':' + hash;
}

// Şifre doğrulama
function verifyPassword(password, storedPassword) {
    const [salt, hash] = storedPassword.split(':');
    const verifyHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return hash === verifyHash;
}

// JWT Token oluştur
function generateToken(user) {
    return jwt.sign(
        {
            userId: user.id,
            email: user.email,
            role: user.role
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
}

// JWT Token doğrula
function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null;
    }
}

// Login
async function login(email, password, ip, userAgent) {
    try {
        const user = await prisma.user.findUnique({
            where: { email }
        });

        // Kullanıcı bulunamadı
        if (!user) {
            return { success: false, error: 'Kullanıcı bulunamadı' };
        }

        // Kullanıcı aktif değil
        if (!user.isActive) {
            return { success: false, error: 'Hesabınız devre dışı bırakılmış' };
        }

        // Şifre kontrolü
        if (!verifyPassword(password, user.password)) {
            // Başarısız giriş logu
            await prisma.loginLog.create({
                data: { userId: user.id, ip: ip || 'unknown', userAgent, basarili: false }
            });
            return { success: false, error: 'Şifre hatalı' };
        }

        // Başarılı giriş logu
        await prisma.loginLog.create({
            data: { userId: user.id, ip: ip || 'unknown', userAgent, basarili: true }
        });

        // Son giriş güncelle
        await prisma.user.update({
            where: { id: user.id },
            data: { lastLogin: new Date(), lastLoginIP: ip }
        });

        // Firma bilgilerini al
        const firma = await prisma.firmaAyarlari.findFirst();

        // Token oluştur
        const token = generateToken(user);

        return {
            success: true,
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                firma: firma ? {
                    id: firma.id,
                    name: firma.name,
                    logo: firma.logo
                } : null
            }
        };
    } catch (error) {
        console.error('Login hatası:', error);
        return { success: false, error: 'Giriş sırasında bir hata oluştu' };
    }
}

// Token doğrulama ve kullanıcı bilgisi
async function verifySession(token) {
    const decoded = verifyToken(token);
    if (!decoded) {
        return { success: false, error: 'Geçersiz token' };
    }

    const user = await prisma.user.findUnique({
        where: { id: decoded.userId }
    });

    if (!user || !user.isActive) {
        return { success: false, error: 'Kullanıcı bulunamadı veya devre dışı' };
    }

    // Firma bilgilerini al
    const firma = await prisma.firmaAyarlari.findFirst();

    return {
        success: true,
        user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            firma: firma ? {
                id: firma.id,
                name: firma.name,
                logo: firma.logo
            } : null
        }
    };
}

// Auth Middleware
function authMiddleware(requiredRole = null) {
    return async (req, res, next) => {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({ error: 'Token gerekli' });
        }

        const result = await verifySession(token);
        if (!result.success) {
            return res.status(401).json({ error: result.error });
        }

        // Rol kontrolü
        if (requiredRole) {
            const userRole = result.user.role;

            // Admin her yere erişebilir
            if (userRole === 'admin') {
                req.user = result.user;
                return next();
            }

            // Admin gerektiren endpoint - sadece admin erişebilir
            if (requiredRole === 'admin' && userRole !== 'admin') {
                return res.status(403).json({ error: 'Bu işlem için admin yetkisi gerekli' });
            }
        }

        req.user = result.user;
        next();
    };
}

// Personel Login (username ile)
async function personelLogin(username, password) {
    try {
        const personel = await prisma.personel.findUnique({
            where: { username }
        });

        // Personel bulunamadı
        if (!personel) {
            return { success: false, error: 'Kullanıcı bulunamadı' };
        }

        // Personel aktif değil
        if (!personel.isActive) {
            return { success: false, error: 'Hesabınız devre dışı bırakılmış' };
        }

        // Şifre kontrolü
        if (!personel.password || !verifyPassword(password, personel.password)) {
            return { success: false, error: 'Şifre hatalı' };
        }

        // Token oluştur
        const token = jwt.sign(
            {
                personelId: personel.id,
                username: personel.username,
                role: personel.role,
                kategori: personel.kategori
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        return {
            success: true,
            token,
            user: {
                id: personel.id,
                ad: personel.adSoyad,
                username: personel.username,
                role: personel.role,
                kategori: personel.kategori,
                unvan: personel.unvan
            }
        };
    } catch (error) {
        console.error('Personel login hatası:', error);
        return { success: false, error: 'Giriş sırasında bir hata oluştu' };
    }
}

// Personel şifre güncelle
async function updatePersonelPassword(personelId, newPassword) {
    const hashedPassword = hashPassword(newPassword);
    await prisma.personel.update({
        where: { id: parseInt(personelId) },
        data: { password: hashedPassword }
    });
    return { success: true };
}

// Şifre sıfırlama kodu oluştur
async function createResetToken(email) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
        return { success: false, error: 'Kullanıcı bulunamadı' };
    }

    const resetToken = Math.floor(100000 + Math.random() * 900000).toString(); // 6 haneli kod
    const resetTokenExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 dakika

    await prisma.user.update({
        where: { id: user.id },
        data: { resetToken, resetTokenExpiry }
    });

    return { success: true, resetToken, user };
}

// Şifre sıfırla
async function resetPassword(email, token, newPassword) {
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
        return { success: false, error: 'Kullanıcı bulunamadı' };
    }

    if (user.resetToken !== token) {
        return { success: false, error: 'Geçersiz kod' };
    }

    if (new Date() > user.resetTokenExpiry) {
        return { success: false, error: 'Kod süresi dolmuş' };
    }

    await prisma.user.update({
        where: { id: user.id },
        data: {
            password: hashPassword(newPassword),
            plainPassword: newPassword,
            resetToken: null,
            resetTokenExpiry: null
        }
    });

    return { success: true };
}

// Kullanıcı oluştur
async function createUser(userData) {
    const hashedPassword = hashPassword(userData.password);

    const user = await prisma.user.create({
        data: {
            email: userData.email,
            password: hashedPassword,
            plainPassword: userData.password,
            name: userData.name,
            role: userData.role || 'tekniker',
            telefon: userData.telefon,
            isActive: true,
            emailVerified: true
        }
    });

    return { success: true, user };
}

// Kullanıcı güncelle
async function updateUser(id, userData) {
    const data = { ...userData };

    if (data.password) {
        data.password = hashPassword(data.password);
        data.plainPassword = userData.password;
    }

    delete data.id;

    const user = await prisma.user.update({
        where: { id: parseInt(id) },
        data
    });

    return { success: true, user };
}

// Kullanıcı sil
async function deleteUser(id) {
    await prisma.user.delete({ where: { id: parseInt(id) } });
    return { success: true };
}

// Kullanıcıları listele
async function listUsers() {
    const users = await prisma.user.findMany({
        orderBy: { createdAt: 'desc' }
    });

    return users;
}

module.exports = {
    login,
    personelLogin,
    updatePersonelPassword,
    verifySession,
    authMiddleware,
    createResetToken,
    resetPassword,
    createUser,
    updateUser,
    deleteUser,
    listUsers,
    hashPassword,
    verifyPassword,
    generateToken,
    prisma
};
