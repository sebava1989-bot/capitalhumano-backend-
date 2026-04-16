import { Router } from 'express';
import multer from 'multer';
import pool from '../db/pool.js';
import { verifyAdmin, verifyWorker } from '../middleware/auth.js';
import { uploadBuffer, deleteFile } from '../utils/cloudinary.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// POST /api/documents/upload — sube PDF a Cloudinary (admin)
router.post('/upload', verifyAdmin, upload.single('file'), async (req, res) => {
  const { workerId, type, name, period } = req.body;
  if (!req.file || !workerId || !type || !name) {
    return res.status(400).json({ error: 'Archivo, trabajador, tipo y nombre requeridos' });
  }
  try {
    const { rows: workerRows } = await pool.query(
      'SELECT id FROM workers WHERE id=$1 AND company_id=$2',
      [workerId, req.companyId]
    );
    if (!workerRows[0]) return res.status(404).json({ error: 'Trabajador no encontrado' });

    const result = await uploadBuffer(req.file.buffer, {
      resource_type: 'raw',
      folder: `capitalhumano/${req.companyId}/documents`,
      public_id: `${type}_${workerId}_${Date.now()}`,
      format: 'pdf',
    });

    const { rows } = await pool.query(
      `INSERT INTO documents (company_id, worker_id, type, name, file_url, period, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $1) RETURNING *`,
      [req.companyId, workerId, type, name, result.secure_url, period || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[documents] upload error:', err.message);
    res.status(500).json({ error: 'Error al subir documento' });
  }
});

// GET /api/documents/worker/:workerId — documentos de un trabajador (admin)
router.get('/worker/:workerId', verifyAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM documents WHERE worker_id=$1 AND company_id=$2 ORDER BY created_at DESC',
      [req.params.workerId, req.companyId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/documents — todos los documentos de la empresa (admin)
router.get('/', verifyAdmin, async (req, res) => {
  const { workerId, type } = req.query;
  try {
    let query = `SELECT d.*, w.full_name, w.rut FROM documents d
                 JOIN workers w ON d.worker_id = w.id
                 WHERE d.company_id = $1`;
    const params = [req.companyId];
    if (workerId) { query += ` AND d.worker_id = $${params.length + 1}`; params.push(workerId); }
    if (type) { query += ` AND d.type = $${params.length + 1}`; params.push(type); }
    query += ' ORDER BY d.created_at DESC';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/documents/mine — mis documentos (trabajador)
router.get('/mine', verifyWorker, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM documents WHERE worker_id=$1 AND company_id=$2 ORDER BY created_at DESC',
      [req.workerId, req.companyId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// DELETE /api/documents/:id — eliminar documento (admin)
router.delete('/:id', verifyAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT file_url FROM documents WHERE id=$1 AND company_id=$2',
      [req.params.id, req.companyId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Documento no encontrado' });

    const url = rows[0].file_url;
    const match = url.match(/\/capitalhumano\/[^/]+\/documents\/(.+?)(?:\.[^.]+)?$/);
    if (match) {
      await deleteFile(`capitalhumano/${req.companyId}/documents/${match[1]}`, 'raw').catch(() => {});
    }

    await pool.query('DELETE FROM documents WHERE id=$1 AND company_id=$2', [req.params.id, req.companyId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

export default router;
