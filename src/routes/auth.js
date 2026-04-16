import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../db/pool.js';

const router = Router();

// Login empresa (admin)
router.post('/admin/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });
  try {
    const { rows } = await pool.query(
      'SELECT * FROM companies WHERE email = $1 AND active = true',
      [email]
    );
    const company = rows[0];
    if (!company) return res.status(401).json({ error: 'Credenciales inválidas' });
    const valid = await bcrypt.compare(password, company.password_hash);
    if (!valid) return res.status(401).json({ error: 'Credenciales inválidas' });
    const token = jwt.sign(
      { role: 'admin', companyId: company.id, companyName: company.name },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );
    res.json({
      token,
      company: {
        id: company.id,
        name: company.name,
        email: company.email,
        plan: company.plan,
        companyCode: company.company_code,
      },
    });
  } catch (err) {
    console.error('[auth] admin login error:', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

// Login trabajador: company_code + RUT + password
router.post('/worker/login', async (req, res) => {
  const { companyCode, rut, password } = req.body;
  if (!companyCode || !rut || !password) {
    return res.status(400).json({ error: 'Código empresa, RUT y contraseña requeridos' });
  }
  try {
    // Buscar empresa por company_code
    const { rows: companyRows } = await pool.query(
      'SELECT id FROM companies WHERE company_code = $1 AND active = true',
      [companyCode.toUpperCase()]
    );
    if (!companyRows[0]) return res.status(401).json({ error: 'Código de empresa inválido' });
    const companyId = companyRows[0].id;

    // Buscar trabajador por RUT dentro de esa empresa
    const { rows: workerRows } = await pool.query(
      'SELECT * FROM workers WHERE rut = $1 AND company_id = $2 AND active = true',
      [rut, companyId]
    );
    const worker = workerRows[0];
    if (!worker) return res.status(401).json({ error: 'Credenciales inválidas' });

    const valid = await bcrypt.compare(password, worker.password_hash);
    if (!valid) return res.status(401).json({ error: 'Credenciales inválidas' });

    const token = jwt.sign(
      { role: 'worker', workerId: worker.id, companyId: worker.company_id },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );
    res.json({
      token,
      worker: {
        id: worker.id,
        fullName: worker.full_name,
        rut: worker.rut,
        position: worker.position,
      },
    });
  } catch (err) {
    console.error('[auth] worker login error:', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

// Registro empresa (auto-activa con freemium 30 días)
router.post('/register', async (req, res) => {
  const { name, rut, email, password, phone } = req.body;
  if (!name || !rut || !email || !password) {
    return res.status(400).json({ error: 'Nombre, RUT, email y contraseña requeridos' });
  }
  try {
    const passwordHash = await bcrypt.hash(password, 12);

    // Generar company_code desde iniciales del nombre de empresa
    // Ignora palabras genéricas (SpA, SPA, Ltda, S.A., etc.)
    const STOP_WORDS = new Set(['SPA', 'LTDA', 'SA', 'EIRL', 'SRL', 'Y', 'DE', 'DEL', 'LA', 'LAS', 'LOS', 'EL']);
    const initials = name
      .toUpperCase()
      .replace(/[^A-ZÁÉÍÓÚÑ\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 0 && !STOP_WORDS.has(w))
      .map(w => w[0])
      .join('');
    const base = initials.length >= 2 ? initials.slice(0, 4) : name.replace(/\s/g, '').toUpperCase().slice(0, 4);

    // Buscar sufijo numérico para garantizar unicidad
    let companyCode;
    for (let i = 0; i <= 99; i++) {
      const candidate = i === 0 ? base : `${base}${i}`;
      const { rows } = await pool.query('SELECT id FROM companies WHERE company_code = $1', [candidate]);
      if (!rows[0]) { companyCode = candidate; break; }
    }
    if (!companyCode) return res.status(500).json({ error: 'No se pudo generar código único' });

    const { rows } = await pool.query(
      `INSERT INTO companies (name, rut, email, password_hash, company_code, plan, status)
       VALUES ($1, $2, $3, $4, $5, 'freemium', 'active')
       RETURNING id, name, email, company_code, plan`,
      [name, rut, email, passwordHash, companyCode]
    );
    const company = rows[0];
    const token = jwt.sign(
      { role: 'admin', companyId: company.id, companyName: company.name },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );
    res.status(201).json({
      token,
      company: {
        id: company.id,
        name: company.name,
        email: company.email,
        plan: company.plan,
        companyCode: company.company_code,
      },
    });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email o RUT ya registrado' });
    console.error('[auth] register error:', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

export default router;
