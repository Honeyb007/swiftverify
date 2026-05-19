const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { Readable } = require('stream');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Custom multer storage that uploads directly to Cloudinary
const cloudinaryStorage = {
    _handleFile(req, file, cb) {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder:         'verifyit-submissions',
                allowed_formats: ['jpg','jpeg','png','webp'],
                transformation: [{ width: 800, crop: 'limit' }]
            },
            (error, result) => {
                if (error) return cb(error);
                cb(null, {
                    path:     result.secure_url,  // full Cloudinary URL
                    filename: result.public_id,
                    size:     result.bytes
                });
            }
        );
        file.stream.pipe(uploadStream);
    },
    _removeFile(req, file, cb) {
        cloudinary.uploader.destroy(file.filename).then(() => cb()).catch(cb);
    }
};

const upload = multer({
    storage: cloudinaryStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Only image files are allowed'));
    }
});

module.exports = { cloudinary, upload };