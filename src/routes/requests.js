import { Router } from 'express';
import pool from '../db/pool.js';
import { verifyAdmin, verifyWorker } from '../middleware/auth.js';

const router = Router();

// Crear solicitud (trabajador)
router.post('/', verifyWorker, async (req, res) => {
  const { type, details, amount } = req.body;
  if (!type) return res.status(400).json({ error: 'Tipo de solicitud requerido' });

  if (type === 'anticipo') {
    const amt = parseFloat(amount);
    if (!amount || isNaN(amt) || amt <= 0) {
      return res.status(400).json({ error: 'Monto requerido para anticipo' });
    }
    const { rows: compRows } = await pool.query(
      'SELECT max_advance_amount FROM companies WHERE id=$1',
      [req.companyId]
    );
    const maxAmt = parseFloat(compRows[0]?.max_advance_amount || 0);
    if (maxAmt > 0 && amt > maxAmt) {
      return res.status(400).json({ error: `El monto supera el máximo permitido de $${maxAmt.toLocaleString('es-CL')}` });
    }
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO requests (company_id, worker_id, type, details, amount)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.companyId, req.workerId, type, details, type === 'anticipo' ? parseFloat(amount) : null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// Monto máximo de anticipo (trabajador consulta)
router.get('/max-advance', verifyWorker, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT max_advance_amount FROM companies WHERE id=$1',
      [req.companyId]
    );
    res.json({ maxAmount: parseFloat(rows[0]?.max_advance_amount || 0) });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// Mis solicitudes (trabajador)
router.get('/mine', verifyWorker, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM requests WHERE worker_id=$1 ORDER BY created_at DESC',
      [req.workerId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// Listar todas las solicitudes (admin)
router.get('/', verifyAdmin, async (req, res) => {
  const { status } = req.query;
  try {
    let query = `SELECT r.*, w.full_name, w.rut FROM requests r
                 JOIN workers w ON r.worker_id = w.id
                 WHERE r.company_id = $1`;
    const params = [req.companyId];
    if (status) { query += ` AND r.status = $2`; params.push(status); }
    query += ' ORDER BY r.created_at DESC';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// Aprobar o rechazar solicitud (admin)
router.put('/:id', verifyAdmin, async (req, res) => {
  const { status, adminNote } = req.body;
  if (!['aprobada', 'rechazada'].includes(status)) return res.status(400).json({ error: 'Estado inválido' });
  try {
    const { rows } = await pool.query(
      `UPDATE requests SET status=$1, admin_note=$2, updated_at=NOW()
       WHERE id=$3 AND company_id=$4 RETURNING *`,
      [status, adminNote, req.params.id, req.companyId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Solicitud no encontrada' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

export default router;
