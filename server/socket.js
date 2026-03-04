// ============================================
// FANROC 2026 – Socket.IO Handler
// ============================================

function setupSocket(io) {
  io.on('connection', (socket) => {
    console.log(`  ⚡ Client kết nối: ${socket.id}`);

    socket.on('disconnect', () => {
      console.log(`  ⚡ Client ngắt kết nối: ${socket.id}`);
    });

    // Client can request a full refresh
    socket.on('request:refresh', () => {
      socket.emit('teams:update');
      socket.emit('matches:update');
    });
  });
}

module.exports = { setupSocket };
