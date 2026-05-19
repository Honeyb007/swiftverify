const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();

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

// ── POST /login ────────────────────────────────────────────
router.post('/login', (req, res) => {
    const { username, password } = req.body;

    let role = null;

    if (
        username === process.env.SUPERADMIN_USERNAME &&
        password === process.env.SUPERADMIN_PASSWORD
    ) {
        role = 'superadmin';

    } else if (
        username === process.env.ADMIN_USERNAME &&
        password === process.env.ADMIN_PASSWORD
    ) {
        role = 'admin';
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

// ── POST /change-admin-password (superadmin only) ─────────
// Updates the password in memory for the current session.
// To make it permanent: update ADMIN_PASSWORD in Railway env vars and redeploy.
router.post('/change-admin-password', superAdminOnly, (req, res) => {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
        return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
    }
    process.env.ADMIN_PASSWORD = newPassword;
    console.log('✅ Admin password changed by superadmin');
    res.json({ success: true });
});

module.exports = router;