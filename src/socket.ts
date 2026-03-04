// ============================================
// FANROC 2026 – Socket.IO Client
// Cập nhật real-time giữa các thiết bị
// ============================================
import { io, Socket } from 'socket.io-client';

const socket: Socket = io('', {
  autoConnect: true,
  transports: ['websocket', 'polling'],
});

socket.on('connect', () => {
  console.log('⚡ Đã kết nối real-time');
});

socket.on('disconnect', () => {
  console.log('⚡ Mất kết nối real-time');
});

export default socket;
