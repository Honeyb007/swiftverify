const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['1.1.1.1', '8.8.8.8']);

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();
console.log('Cloudinary name:', process.env.CLOUDINARY_CLOUD_NAME); // ← add this


// ── App & Server ──────────────────────────────────────────
const app = express();
const server = http.createServer(app);

// ── Socket.io ─────────────────────────────────────────────
const io = new Server(server, {
    cors: {
        origin:  [, 'http://localhost:3000', 'http://localhost:8080', 'https://verifyit-ora7.onrender.com', 'http://127.0.0.1:5500'],   // Allow production and common dev ports
        methods: ['GET', 'POST'],
    },
    transports: ['polling']
});
app.set('io', io);

// ── Middleware ────────────────────────────────────────────
app.use(cors({
    origin: ['https://verifyit-ora7.onrender.com', 'http://localhost:3000', 'http://localhost:8080' ,'http://127.0.0.1:5500' ],   // Allow production and common dev ports
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true
}
));
app.use(express.json());

// Serve client files — must come AFTER app is created
app.use(express.static(path.join(__dirname, '../client')));

// ── MongoDB ───────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/giftcardcheck')
  .then(async () => {
    console.log('✅ MongoDB Connected');
    try {
      const Submission = require('./models/Submission');
      await Submission.collection.dropIndex('code_1').catch(() => {});
      console.log('✅ Cleaned up old indexes');
    } catch (err) {
      console.log('Index cleanup: ', err.message);
    }
  })
  .catch(err => console.log('MongoDB Error:', err));

// ── Socket events ─────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// ── Routes ────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/submissions', require('./routes/submissions'));

// ── Start ─────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});