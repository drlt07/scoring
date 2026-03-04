// ============================================
// FANROC 2026 – Main Server
// Express + Socket.IO + MySQL
// ============================================
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { initDatabase } = require('./database');
const { setupSocket } = require('./socket');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
});

// Store io instance on app for route access
app.set('io', io);

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/teams', require('./routes/teams'));
app.use('/api/matches', require('./routes/matches'));
app.use('/api/users', require('./routes/users'));

// Serve frontend in production
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api') && !req.path.startsWith('/socket.io')) {
    res.sendFile(path.join(distPath, 'index.html'));
  }
});

// Socket.IO
setupSocket(io);

// Start
const PORT = process.env.PORT || 3000;
(async () => {
  try {
    await initDatabase();
    server.listen(PORT, () => {
      console.log(`\n🏆 FANROC 2026 Server đang chạy:`);
      console.log(`   → http://localhost:${PORT}`);
      console.log(`   → API: http://localhost:${PORT}/api`);
      if (process.env.NODE_ENV !== 'production') {
        console.log(`   → Frontend Dev: http://localhost:5173\n`);
      }
    });
  } catch (err) {
    console.error('❌ Không thể khởi động server:', err.message);
    process.exit(1);
  }
})();
