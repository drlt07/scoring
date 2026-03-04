// ============================================
// FANROC 2026 – Teams Routes
// ============================================
const express = require('express');
const router = express.Router();
const { getPool } = require('../database');
const { v4: uuidv4 } = require('uuid');

// GET /api/teams
router.get('/', async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM teams ORDER BY stt');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/teams
router.post('/', async (req, res) => {
  try {
    const { code, name, school } = req.body;
    if (!code || !name) return res.status(400).json({ error: 'Mã đội và tên đội bắt buộc' });

    const pool = getPool();
    const id = uuidv4();
    const [cnt] = await pool.query('SELECT COUNT(*) as c FROM teams');
    const stt = cnt[0].c + 1;

    await pool.query(
      'INSERT INTO teams (id, stt, code, name, school) VALUES (?, ?, ?, ?, ?)',
      [id, stt, code, name, school || '']
    );

    const team = { id, stt, code, name, school: school || '' };
    req.app.get('io').emit('teams:update');
    res.json(team);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/teams/:id
router.put('/:id', async (req, res) => {
  try {
    const { code, name, school } = req.body;
    const pool = getPool();
    await pool.query(
      'UPDATE teams SET code = COALESCE(?, code), name = COALESCE(?, name), school = COALESCE(?, school) WHERE id = ?',
      [code, name, school, req.params.id]
    );
    req.app.get('io').emit('teams:update');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/teams/:id
router.delete('/:id', async (req, res) => {
  try {
    const pool = getPool();
    await pool.query('DELETE FROM teams WHERE id = ?', [req.params.id]);
    const [rows] = await pool.query('SELECT id FROM teams ORDER BY stt, id');
    for (let i = 0; i < rows.length; i++) {
      await pool.query('UPDATE teams SET stt = ? WHERE id = ?', [i + 1, rows[i].id]);
    }
    req.app.get('io').emit('teams:update');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
