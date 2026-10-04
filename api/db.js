/* ═══════════════════════════════════════════════════════════════ */
/* NEURON VPN API — MySQL (подключение + миграция таблиц)          */
/* ═══════════════════════════════════════════════════════════════ */

require('dotenv').config();
const mysql = require('mysql2/promise');

// ── Пул соединений ──
const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: 'Z',
});

// ── Проверка соединения ──
async function testConnection() {
  try {
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    console.log('✅ MySQL: соединение установлено');
    return true;
  } catch (err) {
    console.error('❌ MySQL: ошибка соединения:', err.message);
    return false;
  }
}

// ── Миграция: создаём таблицы, если их нет ──
async function migrate() {
  const queries = [
    // Юзеры сайта (email + password + JWT-связь с Marzban)
    `CREATE TABLE IF NOT EXISTS users (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(190) NOT NULL UNIQUE,
      password_hash VARCHAR(120) NOT NULL,
      marzban_username VARCHAR(64) DEFAULT NULL,
      marzban_uuid CHAR(36) DEFAULT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_email (email),
      INDEX idx_marzban_username (marzban_username)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // Сессии / JWT-токены (можно использовать для логаута)
    `CREATE TABLE IF NOT EXISTS sessions (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id INT UNSIGNED NOT NULL,
      token_hash CHAR(64) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      INDEX idx_user (user_id),
      INDEX idx_token (token_hash),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // Лог операций (регистрации, выдачи ссылок, ошибки)
    `CREATE TABLE IF NOT EXISTS audit_log (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id INT UNSIGNED DEFAULT NULL,
      action VARCHAR(64) NOT NULL,
      details TEXT DEFAULT NULL,
      ip VARCHAR(45) DEFAULT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user (user_id),
      INDEX idx_action (action)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
  ];

  try {
    for (const q of queries) {
      await pool.query(q);
    }
    console.log('✅ MySQL: миграция завершена (3 таблицы)');
    return true;
  } catch (err) {
    console.error('❌ MySQL: ошибка миграции:', err.message);
    return false;
  }
}

// ── Хелперы для работы с users ──
const Users = {
  async findByEmail(email) {
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
    return rows[0] || null;
  },

  async findById(id) {
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
    return rows[0] || null;
  },

  async create({ email, passwordHash, marzbanUsername, marzbanUuid }) {
    const [res] = await pool.query(
      `INSERT INTO users (email, password_hash, marzban_username, marzban_uuid)
       VALUES (?, ?, ?, ?)`,
      [email, passwordHash, marzbanUsername || null, marzbanUuid || null]
    );
    return res.insertId;
  },

  async updateMarzban(id, { marzbanUsername, marzbanUuid }) {
    await pool.query(
      `UPDATE users SET marzban_username = ?, marzban_uuid = ? WHERE id = ?`,
      [marzbanUsername, marzbanUuid, id]
    );
  },
};

// ── Хелперы для audit_log ──
const Audit = {
  async log({ userId, action, details, ip }) {
    try {
      await pool.query(
        `INSERT INTO audit_log (user_id, action, details, ip) VALUES (?, ?, ?, ?)`,
        [userId || null, action, details || null, ip || null]
      );
    } catch (err) {
      console.error('audit_log error:', err.message);
    }
  },
};

module.exports = { pool, testConnection, migrate, Users, Audit };
