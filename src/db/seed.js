import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pool from './pool.js';

async function seed() {
  const email = 'admin@demo.cl';
  const password = 'Demo2026!';
  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const { rows } = await pool.query(
      `INSERT INTO companies (name, rut, email, password_hash, company_code, plan, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
       RETURNING id, email, company_code`,
      ['Empresa Demo', '76.000.001-1', email, passwordHash, 'DEMO01', 'freemium', 'active']
    );
    console.log('[seed] Empresa creada/actualizada:');
    console.log('  Email:', rows[0].email);
    console.log('  Código empresa:', rows[0].company_code);
    console.log('  Contraseña:', password);
    console.log('  ID:', rows[0].id);
  } catch (err) {
    console.error('[seed] Error:', err.message);
  }
  process.exit(0);
}

seed();
