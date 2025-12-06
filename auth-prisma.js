const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const SESSION_DURATION = 24 * 60 * 60 * 1000;
const sessions = new Map();

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, "sha512").toString("hex");
    return salt + ":" + hash;
}

function verifyPasswordHash(password, storedPassword) {
    const [salt, hash] = storedPassword.split(":");
    const verifyHash = crypto.pbkdf2Sync(password, salt, 10000, 64, "sha512").toString("hex");
    return hash === verifyHash;
}

function generateSessionToken() {
    return crypto.randomBytes(32).toString("hex");
}

async function login(email, password) {
    const user = await prisma.user.findUnique({
        where: { email },
        include: { tenant: true }
    });
    if (!user) {
        return { success: false, error: "Kullanici bulunamadi" };
    }
    if (!verifyPasswordHash(password, user.password)) {
        return { success: false, error: "Sifre hatali" };
    }
    const token = generateSessionToken();
    const sessionData = {
        userId: user.id,
        tenantId: user.tenantId,
        role: user.role,
        expiresAt: Date.now() + SESSION_DURATION
    };
    sessions.set(token, sessionData);
    return {
        success: true,
        token,
        user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            username: user.email,
            tenant: user.tenant.name,
            tenantLogo: user.tenant.logo
        }
    };
}

async function verifySession(token) {
    if (!token) {
        return { success: false, error: "Token gerekli" };
    }
    const session = sessions.get(token);
    if (!session) {
        return { success: false, error: "Gecersiz token" };
    }
    if (Date.now() > session.expiresAt) {
        sessions.delete(token);
        return { success: false, error: "Token suresi dolmus" };
    }
    const user = await prisma.user.findUnique({
        where: { id: session.userId },
        include: { tenant: true }
    });
    if (!user) {
        return { success: false, error: "Kullanici bulunamadi" };
    }
    return {
        success: true,
        user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            username: user.email,
            tenantId: user.tenantId,
            tenant: user.tenant.name
        },
        session
    };
}

function logout(token) {
    sessions.delete(token);
    return { success: true };
}

function authMiddleware(requiredRole = null) {
    return async (req, res, next) => {
        const token = req.headers["authorization"]?.replace("Bearer ", "") || req.query.token;
        const result = await verifySession(token);
        if (!result.success) {
            return res.status(401).json({ error: result.error });
        }
        if (requiredRole && result.user.role !== requiredRole && result.user.role !== "admin" && result.user.role !== "superadmin") {
            return res.status(403).json({ error: "Yetkisiz erisim" });
        }
        req.user = result.user;
        req.session = result.session;
        next();
    };
}

async function createUser(userData) {
    const hashedPassword = hashPassword(userData.password);
    const user = await prisma.user.create({
        data: {
            email: userData.email,
            password: hashedPassword,
            name: userData.name,
            role: userData.role || "user",
            tenantId: userData.tenantId
        }
    });
    return { success: true, user };
}

async function updateUser(id, userData) {
    const data = { ...userData };
    if (data.password) {
        data.password = hashPassword(data.password);
    }
    const user = await prisma.user.update({
        where: { id: parseInt(id) },
        data
    });
    return { success: true, user };
}

async function deleteUser(id) {
    await prisma.user.delete({ where: { id: parseInt(id) } });
    return { success: true };
}

async function listUsers(tenantId) {
    const users = await prisma.user.findMany({
        where: tenantId ? { tenantId: parseInt(tenantId) } : {},
        include: { tenant: true }
    });
    return users;
}

async function changePassword(userId, oldPassword, newPassword) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!verifyPasswordHash(oldPassword, user.password)) {
        return { success: false, error: "Eski sifre hatali" };
    }
    await prisma.user.update({
        where: { id: userId },
        data: { password: hashPassword(newPassword) }
    });
    return { success: true };
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
    authMiddleware,
    hashPassword,
    prisma
};
