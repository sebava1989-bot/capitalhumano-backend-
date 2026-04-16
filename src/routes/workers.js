import { Router } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../db/pool.js';
import { verifyAdmin } from '../middleware/auth.js';

const router = Router();

// Listar trabajadores de la empresa
router.get('/', verifyAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, rut, full_name, email, phone, position, start_date, active, created_at FROM workers WHERE company_id = $1 ORDER BY full_name',
      [req.companyId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// Crear trabajador
router.post('/', verifyAdmin, async (req, res) => {
  const { rut, fullName, email, phone, position, startDate, password } = req.body;
  if (!rut || !fullName || !password) return res.status(400).json({ error: 'RUT, nombre y contraseña requeridos' });
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO workers (company_id, rut, full_name, email, phone, position, start_date, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, rut, full_name, email, position, start_date`,
      [req.companyId, rut, fullName, email, phone, position, startDate, passwordHash]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'RUT ya registrado en esta empresa' });
    res.status(500).json({ error: 'Error interno' });
  }
});

// Actualizar trabajador
router.put('/:id', verifyAdmin, async (req, res) => {
  const { fullName, email, phone, position, startDate, active } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE workers SET full_name=$1, email=$2, phone=$3, position=$4, start_date=$5, active=$6
       WHERE id=$7 AND company_id=$8 RETURNING id, rut, full_name, email, position, active`,
      [fullName, email, phone, position, startDate, active, req.params.id, req.companyId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Trabajador no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/workers/:id/finiquito — finiquitar trabajador
router.post('/:id/finiquito', verifyAdmin, async (req, res) => {
  const { endDate, terminationReason } = req.body;
  if (!endDate) return res.status(400).json({ error: 'Fecha de término requerida' });
  try {
    const { rows } = await pool.query(
      `UPDATE workers SET active = false, end_date = $1, termination_reason = $2
       WHERE id = $3 AND company_id = $4
       RETURNING id, rut, full_name, position, end_date, termination_reason`,
      [endDate, terminationReason || null, req.params.id, req.companyId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Trabajador no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[workers] finiquito error:', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/workers/finiquitados — trabajadores inactivos con sus documentos
router.get('/finiquitados/list', verifyAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, rut, full_name, email, position, start_date, end_date, termination_reason, created_at
       FROM workers WHERE company_id = $1 AND active = false
       ORDER BY end_date DESC NULLS LAST, full_name`,
      [req.companyId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// Obtener trabajador por ID
router.get('/:id', verifyAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, rut, full_name, email, phone, position, start_date, active, created_at FROM workers WHERE id=$1 AND company_id=$2',
      [req.params.id, req.companyId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Trabajador no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

export default router;
