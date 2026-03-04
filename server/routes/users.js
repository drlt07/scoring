// ============================================
// FANROC 2026 – Users Routes
// ============================================
const express = require('express');
const router = express.Router();
const { getPool } = require('../database');
const { v4: uuidv4 } = require('uuid');

// GET /api/users
router.get('/', async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query('SELECT id, email, password, role, name, assigned_field FROM users ORDER BY created_at');
    const users = rows.map(u => ({
      id: u.id,
      email: u.email,
      password: u.password,
      role: u.role,
      name: u.name,
      assignedField: u.assigned_field,
    }));
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users – Tạo trọng tài mới
router.post('/', async (req, res) => {
  try {
    const { name, email, password, assignedField } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email và mật khẩu bắt buộc' });

    const pool = getPool();
    const id = uuidv4();
    await pool.query(
      'INSERT INTO users (id, email, password, role, name, assigned_field) VALUES (?, ?, ?, ?, ?, ?)',
      [id, email, password, 'JUDGE', name || '', assignedField || null]
    );

    res.json({ id, email, password, role: 'JUDGE', name: name || '', assignedField: assignedField || null });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Email đã tồn tại!' });
    }
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/users/:id
router.delete('/:id', async (req, res) => {
  try {
    if (req.params.id === 'admin_1') {
      return res.status(403).json({ error: 'Không thể xóa tài khoản Admin chính!' });
    }
    const pool = getPool();
    await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
