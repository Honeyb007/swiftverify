const express = require('express');
const Submission = require('../models/Submission');
const jwt = require('jsonwebtoken');
const router = express.Router();
const { upload, cloudinary } = require('../config/cloudinary');

// ── Auth middleware ────────────────────────────────────────
const authMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Unauthorized' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'verifyToken');
        req.admin = decoded; // has .username and .role
        next();
    } catch {
        res.status(401).json({ message: 'Invalid token' });
    }
};

// ── Superadmin-only middleware ─────────────────────────────
const superAdminOnly = (req, res, next) => {
    if (req.admin?.role !== 'superadmin') {
        return res.status(403).json({ message: 'Forbidden' });
    }
    next();
};

// ── POST /submit — user submits gift card ──────────────────
router.post('/submit', (req, res, next) => {
    req.on('aborted', () => console.log('Request aborted by client'));

    upload.single('image')(req, res, (err) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE')
                return res.status(400).json({ success: false, message: 'File too large. Max 5MB allowed.' });
            if (err.message === 'Only image files are allowed')
                return res.status(400).json({ success: false, message: err.message });
            return res.status(500).json({ success: false, message: 'Upload failed: ' + err.message });
        }
        next();
    });
}, async (req, res) => {
    try {
        const { code } = req.body;

        // Both are optional but at least one must be present
        const hasImage = !!req.file;
        const hasCode  = code && code.trim() && code.trim() !== 'N/A';

        if (!hasImage && !hasCode) {
            return res.status(400).json({ success: false, message: 'Please provide an image or a code.' });
        }

        const imagePath = hasImage ? req.file.path : null;
        // Cloudinary gives the full URL directly as req.file.path

const submission = new Submission({ 
    code: hasCode ? code.trim() : 'N/A',
    imagePath 
});        await submission.save();

        req.app.get('io').emit('newSubmission', submission);
        res.json({ success: true, submissionId: submission._id });
    } catch (err) {
        console.error('Submission error:', err.message);
        if (err.code === 11000) {
            return res.status(409).json({
                success: false,
                message: 'This gift card code has already been submitted.'
            });
        }
        res.status(500).json({ success: false, message: err.message || 'Server error' });
    }
});

// ── GET / — fetch all submissions ─────────────────────────
router.get('/', authMiddleware, async (req, res) => {
    try {
        const submissions = await Submission.find().sort({ createdAt: -1 });
        res.json(submissions);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── PUT /:id/verify — approve or reject ───────────────────
router.put('/:id/verify', authMiddleware, async (req, res) => {
    try {
        const { status, resultMessage } = req.body;
        const submission = await Submission.findByIdAndUpdate(
            req.params.id,
            { status, verifiedBy: req.admin.username, resultMessage },
            { returnDocument: 'after' }
        );
        if (!submission) return res.status(404).json({ message: 'Not found' });

        const io = req.app.get('io');
        if (io) io.emit(`result_${submission._id}`, submission);

        res.json({ success: true, submission });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── DELETE /:id — superadmin only ─────────────────────────
router.delete('/:id', authMiddleware, superAdminOnly, async (req, res) => {
    try {
        const submission = await Submission.findById(req.params.id);
        if (!submission) return res.status(404).json({ message: 'Not found' });

        // Also delete from Cloudinary
        if (submission.imagePath) {
            const urlParts = submission.imagePath.split('/');
            const fileName = urlParts[urlParts.length - 1];
            const folder   = urlParts[urlParts.length - 2];
            const publicId = `${folder}/${fileName.split('.')[0]}`;
            await cloudinary.uploader.destroy(publicId).catch(() => {});
        }

        await Submission.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Deleted successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;