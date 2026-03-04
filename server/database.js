// ============================================
// FANROC 2026 – MySQL Database Module
// ============================================
require('dotenv').config();
const mysql = require('mysql2/promise');

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
};

const DB_NAME = process.env.DB_NAME || 'fanroc_scoring';

let pool;

async function initDatabase() {
  // 1. Create database if not exists
  const tmpConn = await mysql.createConnection(DB_CONFIG);
  await tmpConn.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await tmpConn.end();

  // 2. Create pool with database selected
  pool = mysql.createPool({
    ...DB_CONFIG,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    charset: 'utf8mb4',
  });

  // 3. Create tables
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id             VARCHAR(36)  PRIMARY KEY,
      email          VARCHAR(255) NOT NULL UNIQUE,
      password       VARCHAR(255) NOT NULL,
      role           ENUM('ADMIN','JUDGE') NOT NULL,
      name           VARCHAR(255) NOT NULL,
      assigned_field INT          DEFAULT NULL,
      created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS teams (
      id         VARCHAR(36)  PRIMARY KEY,
      stt        INT          NOT NULL,
      code       VARCHAR(50)  NOT NULL,
      name       VARCHAR(255) NOT NULL,
      school     VARCHAR(255) NOT NULL,
      created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS \`matches\` (
      id            VARCHAR(36)  PRIMARY KEY,
      match_number  INT          NOT NULL,
      field         INT          NOT NULL,
      start_time    VARCHAR(10)  NOT NULL,
      end_time      VARCHAR(10)  NOT NULL,
      status        ENUM('UPCOMING','SCORING','PENDING','LOCKED') DEFAULT 'UPCOMING',
      alliance_red  JSON         NOT NULL,
      alliance_blue JSON         NOT NULL,
      created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
      updated_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // 4. Seed default users (only if table is empty)
  const [rows] = await pool.query('SELECT COUNT(*) as cnt FROM users');
  if (rows[0].cnt === 0) {
    const defaults = [
      ['admin_1', 'admin@fanroc.com', 'admin', 'ADMIN', 'Trưởng Ban Tổ Chức', null],
      ['gk1', 'gk1@fanroc.com', 'gk1', 'JUDGE', 'Giám Khảo Sân 1', 1],
      ['gk2', 'gk2@fanroc.com', 'gk2', 'JUDGE', 'Giám Khảo Sân 2', 2],
      ['gk3', 'gk3@fanroc.com', 'gk3', 'JUDGE', 'Giám Khảo Sân 3', 3],
    ];
    for (const u of defaults) {
      await pool.query(
        'INSERT INTO users (id, email, password, role, name, assigned_field) VALUES (?, ?, ?, ?, ?, ?)',
        u
      );
    }
    console.log('  ✓ Tạo tài khoản mặc định thành công');
  }

  console.log('  ✓ Database MySQL đã sẵn sàng');
}

function getPool() {
  if (!pool) throw new Error('Database chưa được khởi tạo. Gọi initDatabase() trước.');
  return pool;
}

module.exports = { initDatabase, getPool };

// Standalone init
if (require.main === module) {
  initDatabase()
    .then(() => { console.log('Done!'); process.exit(0); })
    .catch(e => { console.error(e); process.exit(1); });
}
