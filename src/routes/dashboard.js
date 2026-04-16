import { Router } from 'express';
import multer from 'multer';
import pool from '../db/pool.js';
import { verifyAdmin } from '../middleware/auth.js';
import { uploadBuffer, deleteFile } from '../utils/cloudinary.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// GET /api/dashboard/stats
router.get('/stats', verifyAdmin, async (req, res) => {
  const { companyId } = req;
  try {
    const [workersRes, docsRes, requestsRes, company] = await Promise.all([
      pool.query(
        'SELECT COUNT(*) FILTER (WHERE active) AS active, COUNT(*) AS total FROM workers WHERE company_id = $1',
        [companyId]
      ),
      pool.query('SELECT COUNT(*) AS total FROM documents WHERE company_id = $1', [companyId]),
      pool.query(
        `SELECT COUNT(*) FILTER (WHERE status = 'pendiente') AS pending, COUNT(*) AS total FROM requests WHERE company_id = $1`,
        [companyId]
      ),
      pool.query('SELECT name, plan, plan_expires_at, company_code, logo_url, admin_signature_url FROM companies WHERE id = $1', [companyId]),
    ]);

    res.json({
      workers: {
        active: parseInt(workersRes.rows[0].active),
        total: parseInt(workersRes.rows[0].total),
      },
      documents: { total: parseInt(docsRes.rows[0].total) },
      requests: {
        pending: parseInt(requestsRes.rows[0].pending),
        total: parseInt(requestsRes.rows[0].total),
      },
      company: company.rows[0],
    });
  } catch (err) {
    console.error('[dashboard] stats error:', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

// PUT /api/dashboard/company-code — cambiar código de empresa
router.put('/company-code', verifyAdmin, async (req, res) => {
  const { companyCode } = req.body;
  if (!companyCode) return res.status(400).json({ error: 'companyCode requerido' });
  const clean = companyCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length < 2 || clean.length > 8) {
    return res.status(400).json({ error: 'El código debe tener entre 2 y 8 caracteres (solo letras y números)' });
  }
  try {
    const existing = await pool.query(
      'SELECT id FROM companies WHERE company_code = $1 AND id != $2',
      [clean, req.companyId]
    );
    if (existing.rows[0]) return res.status(409).json({ error: 'Ese código ya está en uso por otra empresa' });
    await pool.query('UPDATE companies SET company_code = $1 WHERE id = $2', [clean, req.companyId]);
    res.json({ ok: true, companyCode: clean });
  } catch (err) {
    console.error('[dashboard] company-code error:', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

// PUT /api/dashboard/logo — logo como base64 en DB
router.put('/logo', verifyAdmin, async (req, res) => {
  const { logoBase64 } = req.body;
  if (!logoBase64) return res.status(400).json({ error: 'logoBase64 requerido' });
  if (logoBase64.length > 500000) return res.status(400).json({ error: 'Logo demasiado grande (máx ~350KB)' });
  try {
    await pool.query('UPDATE companies SET logo_url = $1 WHERE id = $2', [logoBase64, req.companyId]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[dashboard] logo error:', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

// PUT /api/dashboard/signature — sube firma digital a Cloudinary
router.put('/signature', verifyAdmin, upload.single('signature'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Imagen de firma requerida' });
  const allowedMimes = ['image/png', 'image/jpeg', 'image/jpg'];
  if (!allowedMimes.includes(req.file.mimetype)) {
    return res.status(400).json({ error: 'Solo se aceptan imágenes PNG o JPG' });
  }
  try {
    const { rows } = await pool.query('SELECT admin_signature_url FROM companies WHERE id=$1', [req.companyId]);
    const oldUrl = rows[0]?.admin_signature_url;
    if (oldUrl && oldUrl.includes('cloudinary.com')) {
      const match = oldUrl.match(/\/capitalhumano\/[^/]+\/signatures\/([^.]+)/);
      if (match) {
        await deleteFile(`capitalhumano/${req.companyId}/signatures/${match[1]}`, 'image').catch(() => {});
      }
    }

    const result = await uploadBuffer(req.file.buffer, {
      resource_type: 'image',
      folder: `capitalhumano/${req.companyId}/signatures`,
      public_id: `admin_signature`,
      overwrite: true,
    });

    await pool.query('UPDATE companies SET admin_signature_url = $1 WHERE id = $2', [result.secure_url, req.companyId]);
    res.json({ ok: true, url: result.secure_url });
  } catch (err) {
    console.error('[dashboard] signature error:', err.message);
    res.status(500).json({ error: 'Error al subir firma' });
  }
});

export default router;
