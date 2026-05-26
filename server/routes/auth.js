const express = require('express');
const jwt      = require('jsonwebtoken');
const Settings = require('../models/Settings');
const router   = express.Router();

// ── Auth middleware (any role) ─────────────────────────────
const authMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Unauthorized' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'verifyToken');
        req.admin = decoded;
        next();
    } catch {
        res.status(401).json({ message: 'Invalid token' });
    }
};

// ── Superadmin-only middleware ─────────────────────────────
const superAdminOnly = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Unauthorized' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'verifyToken');
        if (decoded.role !== 'superadmin') return res.status(403).json({ message: 'Forbidden' });
        req.admin = decoded;
        next();
    } catch {
        res.status(401).json({ message: 'Invalid token' });
    }
};

// ── Helper: get admin password from DB ────────────────────
async function getAdminPassword() {
    const setting = await Settings.findOne({ key: 'admin_password' });
    // Fall back to .env if DB entry doesn't exist yet
    return setting ? setting.value : process.env.ADMIN_PASSWORD;
}

// ── POST /login ────────────────────────────────────────────
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    let role = null;

    // Check superadmin first — always from .env
    if (
        username === process.env.SUPERADMIN_USERNAME &&
        password === process.env.SUPERADMIN_PASSWORD
    ) {
        role = 'superadmin';
    } else {
        // Check admin — from DB (falls back to .env)
        const adminPassword = await getAdminPassword();
        if (
            username === process.env.ADMIN_USERNAME &&
            password === adminPassword
        ) {
            role = 'admin';
        }
    }

    if (!role) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = jwt.sign(
        { username, role },
        process.env.JWT_SECRET || 'verifyToken',
        { expiresIn: '1d' }
    );

    res.json({ success: true, token, role });
});

// ── PUT /change-admin-password — superadmin only ──────────
// Requires current admin password confirmation + new password
router.put('/change-admin-password', superAdminOnly, async (req, res) => {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    // Validate fields
    if (!currentPassword || !newPassword || !confirmPassword) {
        return res.status(400).json({ success: false, message: 'All fields are required.' });
    }
    if (newPassword.length < 8) {
        return res.status(400).json({ success: false, message: 'New password must be at least 8 characters.' });
    }
    if (newPassword !== confirmPassword) {
        return res.status(400).json({ success: false, message: 'New passwords do not match.' });
    }

    // Verify current password
    const adminPassword = await getAdminPassword();
    if (currentPassword !== adminPassword) {
        return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
    }

    // Save new password to DB
    await Settings.findOneAndUpdate(
        { key: 'admin_password' },
        { key: 'admin_password', value: newPassword },
        { upsert: true, new: true }
    );

    console.log('✅ Admin password changed by superadmin');
    res.json({ success: true, message: 'Admin password updated successfully.' });
});

module.exports = router;