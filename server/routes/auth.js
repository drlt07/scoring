// ============================================
// FANROC 2026 – Auth Routes
// ============================================
const express = require('express');
const router = express.Router();
const { getPool } = require('../database');

// POST /api/auth/login – Đăng nhập Admin / Giám khảo
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const pool = getPool();
    const [rows] = await pool.query(
      'SELECT id, email, role, name, assigned_field FROM users WHERE email = ? AND password = ?',
      [email, password]
    );
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Tài khoản hoặc mật khẩu không đúng!' });
    }
    const u = rows[0];
    res.json({
      id: u.id,
      email: u.email,
      role: u.role,
      name: u.name,
      assignedField: u.assigned_field,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/viewer-login – Đăng nhập Khán giả qua mã xem
router.post('/viewer-login', async (req, res) => {
  const { code } = req.body;
  const ACCESS_CODE = process.env.VIEW_ACCESS_CODE || 'fanroc2026';
  if (code === ACCESS_CODE) {
    return res.json({ role: 'VIEWER', name: 'Khán giả' });
  }
  res.status(401).json({ error: 'Mã truy cập không chính xác!' });
});

module.exports = router;
