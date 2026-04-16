import 'dotenv/config';
import pool from './pool.js';

async function migrate() {
  console.log('[migrate] Iniciando migraciones...');

  const migrations = [
    `ALTER TABLE companies ADD COLUMN IF NOT EXISTS company_code VARCHAR(6) UNIQUE`,
    `ALTER TABLE companies ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '30 days')`,
    `ALTER TABLE companies ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active'`,
    `ALTER TABLE companies ADD COLUMN IF NOT EXISTS admin_signature_url TEXT`,
    `ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_url TEXT`,
    `ALTER TABLE companies ALTER COLUMN plan SET DEFAULT 'freemium'`,
    `CREATE TABLE IF NOT EXISTS certificates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
      worker_id UUID REFERENCES workers(id) ON DELETE CASCADE,
      type VARCHAR(50) NOT NULL,
      file_url VARCHAR(500) NOT NULL,
      generated_at TIMESTAMP DEFAULT NOW()
    )`,
  ];

  for (const sql of migrations) {
    try {
      await pool.query(sql);
      console.log('[migrate] OK:', sql.slice(0, 60) + '...');
    } catch (err) {
      console.error('[migrate] ERROR:', err.message);
    }
  }

  // Generar company_code para empresas existentes que no tienen uno
  await pool.query(`
    UPDATE companies SET company_code = UPPER(SUBSTRING(MD5(RANDOM()::TEXT), 1, 6))
    WHERE company_code IS NULL
  `);

  console.log('[migrate] Migraciones completadas');
  process.exit(0);
}

migrate();
