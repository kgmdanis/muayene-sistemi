const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

const AUTH_FILE = path.join(__dirname, 'auth.json');
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 saat

// Şifre hashleme fonksiyonu
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return { salt, hash };
}

// Şifre doğrulama fonksiyonu
function verifyPassword(password, hash, salt) {
    const verifyHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return hash === verifyHash;
}

// Session token oluşturma
function generateSessionToken() {
    return crypto.randomBytes(32).toString('hex');
}

// Auth dosyasını yükleme
async function loadAuthData() {
    try {
        const data = await fs.readFile(AUTH_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // Dosya yoksa varsayılan veri oluştur
        const defaultData = {
            users: [
                {
                    id: 1,
                    username: 'admin',
                    password: hashPassword('admin123'),
                    role: 'admin',
                    name: 'Sistem Yöneticisi',
                    email: 'admin@ondermuayene.com',
                    active: true,
                    createdAt: new Date().toISOString()
                }
            ],
            sessions: []
        };
        await saveAuthData(defaultData);
        return defaultData;
    }
}

// Auth dosyasını kaydetme
async function saveAuthData(data) {
    await fs.writeFile(AUTH_FILE, JSON.stringify(data, null, 2));
}

// Kullanıcı girişi
async function login(username, password) {
    const authData = await loadAuthData();
    
    // Kullanıcıyı bul
    const user = authData.users.find(u => u.username === username && u.active);
    if (!user) {
        return { success: false, error: 'Kullanıcı adı veya şifre hatalı' };
    }
    
    // Şifreyi doğrula
    if (!verifyPassword(password, user.password.hash, user.password.salt)) {
        return { success: false, error: 'Kullanıcı adı veya şifre hatalı' };
    }
    
    // Session oluştur
    const token = generateSessionToken();
    const session = {
        token,
        userId: user.id,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + SESSION_DURATION).toISOString()
    };
    
    // Eski sessionları temizle
    authData.sessions = authData.sessions.filter(s => new Date(s.expiresAt) > new Date());
    
    // Yeni session ekle
    authData.sessions.push(session);
    await saveAuthData(authData);
    
    // Hassas bilgileri çıkar
    const { password: _, ...userInfo } = user;
    
    return {
        success: true,
        token,
        user: userInfo
    };
}

// Session doğrulama
async function verifySession(token) {
    if (!token) {
        return { success: false, error: 'Token gereklidir' };
    }
    
    const authData = await loadAuthData();
    
    // Session bul
    const session = authData.sessions.find(s => s.token === token);
    if (!session) {
        return { success: false, error: 'Geçersiz token' };
    }
    
    // Süre kontrolü
    if (new Date(session.expiresAt) < new Date()) {
        // Süresi dolmuş sessionı sil
        authData.sessions = authData.sessions.filter(s => s.token !== token);
        await saveAuthData(authData);
        return { success: false, error: 'Session süresi dolmuş' };
    }
    
    // Kullanıcıyı bul
    const user = authData.users.find(u => u.id === session.userId);
    if (!user || !user.active) {
        return { success: false, error: 'Kullanıcı bulunamadı veya aktif değil' };
    }
    
    // Hassas bilgileri çıkar
    const { password: _, ...userInfo } = user;
    
    return {
        success: true,
        user: userInfo,
        session
    };
}

// Çıkış
async function logout(token) {
    const authData = await loadAuthData();
    authData.sessions = authData.sessions.filter(s => s.token !== token);
    await saveAuthData(authData);
    return { success: true };
}

// Kullanıcı oluşturma
async function createUser(userData, creatorId) {
    const authData = await loadAuthData();
    
    // Kullanıcı adı kontrolü
    if (authData.users.some(u => u.username === userData.username)) {
        return { success: false, error: 'Bu kullanıcı adı zaten kullanılıyor' };
    }
    
    // Yeni kullanıcı oluştur
    const newUser = {
        id: Math.max(...authData.users.map(u => u.id), 0) + 1,
        username: userData.username,
        password: hashPassword(userData.password),
        role: userData.role || 'user',
        name: userData.name,
        email: userData.email,
        active: true,
        createdAt: new Date().toISOString(),
        createdBy: creatorId
    };
    
    authData.users.push(newUser);
    await saveAuthData(authData);
    
    // Hassas bilgileri çıkar
    const { password: _, ...userInfo } = newUser;
    
    return {
        success: true,
        user: userInfo
    };
}

// Kullanıcı güncelleme
async function updateUser(userId, updates, updaterId) {
    const authData = await loadAuthData();
    
    const userIndex = authData.users.findIndex(u => u.id === userId);
    if (userIndex === -1) {
        return { success: false, error: 'Kullanıcı bulunamadı' };
    }
    
    // Şifre güncellemesi varsa hashle
    if (updates.password) {
        updates.password = hashPassword(updates.password);
    }
    
    // Kullanıcı adı değişikliği kontrolü
    if (updates.username && updates.username !== authData.users[userIndex].username) {
        if (authData.users.some(u => u.username === updates.username)) {
            return { success: false, error: 'Bu kullanıcı adı zaten kullanılıyor' };
        }
    }
    
    // Güncelle
    authData.users[userIndex] = {
        ...authData.users[userIndex],
        ...updates,
        updatedAt: new Date().toISOString(),
        updatedBy: updaterId
    };
    
    await saveAuthData(authData);
    
    // Hassas bilgileri çıkar
    const { password: _, ...userInfo } = authData.users[userIndex];
    
    return {
        success: true,
        user: userInfo
    };
}

// Kullanıcı silme (soft delete)
async function deleteUser(userId, deleterId) {
    const authData = await loadAuthData();
    
    const userIndex = authData.users.findIndex(u => u.id === userId);
    if (userIndex === -1) {
        return { success: false, error: 'Kullanıcı bulunamadı' };
    }
    
    // Admin hesabı silinmesin
    if (authData.users[userIndex].username === 'admin') {
        return { success: false, error: 'Admin hesabı silinemez' };
    }
    
    // Soft delete
    authData.users[userIndex].active = false;
    authData.users[userIndex].deletedAt = new Date().toISOString();
    authData.users[userIndex].deletedBy = deleterId;
    
    // Bu kullanıcının sessionlarını sil
    authData.sessions = authData.sessions.filter(s => s.userId !== userId);
    
    await saveAuthData(authData);
    
    return { success: true };
}

// Tüm kullanıcıları listele
async function listUsers() {
    const authData = await loadAuthData();
    
    // Aktif kullanıcıları listele ve hassas bilgileri çıkar
    const users = authData.users
        .filter(u => u.active)
        .map(({ password, ...user }) => user);
    
    return users;
}

// Şifre değiştirme
async function changePassword(userId, oldPassword, newPassword) {
    const authData = await loadAuthData();
    
    const user = authData.users.find(u => u.id === userId);
    if (!user) {
        return { success: false, error: 'Kullanıcı bulunamadı' };
    }
    
    // Eski şifreyi doğrula
    if (!verifyPassword(oldPassword, user.password.hash, user.password.salt)) {
        return { success: false, error: 'Mevcut şifre hatalı' };
    }
    
    // Yeni şifreyi hashle ve kaydet
    user.password = hashPassword(newPassword);
    user.passwordChangedAt = new Date().toISOString();
    
    await saveAuthData(authData);
    
    return { success: true };
}

// Express middleware
function authMiddleware(requiredRole = null) {
    return async (req, res, next) => {
        const token = req.headers['authorization']?.replace('Bearer ', '') || req.query.token;
        
        const result = await verifySession(token);
        if (!result.success) {
            return res.status(401).json({ error: result.error });
        }
        
        // Role kontrolü
        if (requiredRole && result.user.role !== requiredRole && result.user.role !== 'admin') {
            return res.status(403).json({ error: 'Yetkisiz erişim' });
        }
        
        req.user = result.user;
        req.session = result.session;
        next();
    };
}

module.exports = {
    login,
    logout,
    verifySession,
    createUser,
    updateUser,
    deleteUser,
    listUsers,
    changePassword,
    authMiddleware
};