import { Router } from 'express';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import pool from '../db/pool.js';
import { verifyAdmin, verifyWorker } from '../middleware/auth.js';
import { uploadBuffer } from '../utils/cloudinary.js';

const router = Router();

const CERT_TYPES = {
  antiguedad: 'Antigüedad Laboral',
  vacaciones: 'Vacaciones Disponibles',
  renta: 'Renta Mensual',
};

// POST /api/certificates/generate — el admin genera un certificado para un trabajador
router.post('/generate', verifyAdmin, async (req, res) => {
  const { workerId, type } = req.body;
  if (!workerId || !type || !CERT_TYPES[type]) {
    return res.status(400).json({ error: 'workerId y type (antiguedad|vacaciones|renta) requeridos' });
  }
  try {
    const [workerRes, companyRes] = await Promise.all([
      pool.query(
        'SELECT * FROM workers WHERE id=$1 AND company_id=$2 AND active=true',
        [workerId, req.companyId]
      ),
      pool.query(
        'SELECT name, rut, admin_signature_url FROM companies WHERE id=$1',
        [req.companyId]
      ),
    ]);

    const worker = workerRes.rows[0];
    const company = companyRes.rows[0];
    if (!worker) return res.status(404).json({ error: 'Trabajador no encontrado' });

    const startDate = worker.start_date ? new Date(worker.start_date) : null;
    const now = new Date();
    let antiguedadTexto = 'No registrada';
    if (startDate) {
      const years = Math.floor((now - startDate) / (365.25 * 24 * 3600 * 1000));
      const months = Math.floor(((now - startDate) % (365.25 * 24 * 3600 * 1000)) / (30.44 * 24 * 3600 * 1000));
      antiguedadTexto = `${years} año${years !== 1 ? 's' : ''} y ${months} mes${months !== 1 ? 'es' : ''}`;
    }

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]); // A4
    const { width, height } = page.getSize();

    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const skyBlue = rgb(0.055, 0.647, 0.914);
    const darkGray = rgb(0.1, 0.1, 0.1);
    const medGray = rgb(0.4, 0.4, 0.4);

    // Header azul
    page.drawRectangle({ x: 0, y: height - 120, width, height: 120, color: skyBlue });

    page.drawText('CERTIFICADO LABORAL', {
      x: 50, y: height - 55, size: 22, font: fontBold, color: rgb(1, 1, 1),
    });
    page.drawText(CERT_TYPES[type].toUpperCase(), {
      x: 50, y: height - 82, size: 12, font: fontRegular, color: rgb(0.8, 0.93, 0.98),
    });
    page.drawText(company.name, {
      x: 50, y: height - 104, size: 10, font: fontRegular, color: rgb(0.8, 0.93, 0.98),
    });

    page.drawRectangle({ x: 0, y: height - 125, width, height: 5, color: rgb(0.02, 0.22, 0.37) });

    const startY = height - 180;
    const lineH = 30;

    page.drawText('A QUIEN CORRESPONDA:', {
      x: 50, y: startY, size: 12, font: fontBold, color: darkGray,
    });

    page.drawText(`Por medio del presente documento, ${company.name} certifica que:`, {
      x: 50, y: startY - lineH, size: 11, font: fontRegular, color: medGray,
    });

    // Recuadro con datos del trabajador
    page.drawRectangle({
      x: 50, y: startY - lineH * 6 - 20,
      width: width - 100, height: lineH * 4 + 20,
      color: rgb(0.97, 0.97, 0.97),
      borderColor: rgb(0.85, 0.85, 0.85),
      borderWidth: 1,
    });

    const fields = [
      ['Nombre completo', worker.full_name],
      ['RUT', worker.rut],
      ['Cargo', worker.position || 'No especificado'],
      ['Fecha de ingreso', startDate ? startDate.toLocaleDateString('es-CL') : 'No registrada'],
    ];

    fields.forEach(([label, value], i) => {
      page.drawText(`${label}:`, {
        x: 65, y: startY - lineH * (i + 2) - 10, size: 10, font: fontBold, color: darkGray,
      });
      page.drawText(String(value), {
        x: 210, y: startY - lineH * (i + 2) - 10, size: 10, font: fontRegular, color: darkGray,
      });
    });

    let specificText = '';
    if (type === 'antiguedad') {
      specificText = `El trabajador tiene una antiguedad de ${antiguedadTexto} en nuestra empresa.`;
    } else if (type === 'vacaciones') {
      specificText = `El trabajador se encuentra al dia en sus obligaciones laborales y tiene derecho a vacaciones segun la legislacion laboral chilena vigente.`;
    } else if (type === 'renta') {
      specificText = `El trabajador se desempena actualmente en el cargo de ${worker.position || 'empleado'} en nuestra organizacion con contrato vigente.`;
    }

    page.drawText(specificText, {
      x: 50, y: startY - lineH * 7 - 10, size: 11, font: fontRegular, color: darkGray,
    });

    const fechaEmision = now.toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' });
    page.drawText(`Santiago, ${fechaEmision}`, {
      x: 50, y: 200, size: 11, font: fontRegular, color: medGray,
    });

    // Firma digital si existe
    if (company.admin_signature_url) {
      try {
        const sigResponse = await fetch(company.admin_signature_url);
        const sigBuffer = Buffer.from(await sigResponse.arrayBuffer());
        let sigImage;
        try {
          sigImage = await pdfDoc.embedPng(sigBuffer);
        } catch {
          sigImage = await pdfDoc.embedJpg(sigBuffer);
        }
        const sigDims = sigImage.scale(0.3);
        page.drawImage(sigImage, {
          x: 50, y: 100,
          width: Math.min(sigDims.width, 180),
          height: Math.min(sigDims.height, 80),
        });
      } catch {
        // Firma no disponible, continuar sin ella
      }
    }

    page.drawLine({
      start: { x: 50, y: 95 }, end: { x: 250, y: 95 },
      thickness: 1, color: darkGray,
    });
    page.drawText('Firma Representante Legal', {
      x: 50, y: 78, size: 10, font: fontRegular, color: medGray,
    });
    page.drawText(company.name, {
      x: 50, y: 63, size: 10, font: fontBold, color: darkGray,
    });

    // Pie de página
    page.drawRectangle({ x: 0, y: 0, width, height: 40, color: skyBlue });
    page.drawText('Documento generado por CapitalHumano · Tu Amigo Digital SpA', {
      x: 50, y: 14, size: 9, font: fontRegular, color: rgb(1, 1, 1),
    });

    const pdfBytes = await pdfDoc.save();
    const pdfBuffer = Buffer.from(pdfBytes);

    const cloudResult = await uploadBuffer(pdfBuffer, {
      resource_type: 'raw',
      folder: `capitalhumano/${req.companyId}/certificates`,
      public_id: `cert_${type}_${workerId}_${Date.now()}`,
      format: 'pdf',
    });

    const { rows } = await pool.query(
      `INSERT INTO certificates (company_id, worker_id, type, file_url)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.companyId, workerId, type, cloudResult.secure_url]
    );

    res.status(201).json({ certificate: rows[0], url: cloudResult.secure_url });
  } catch (err) {
    console.error('[certificates] generate error:', err.message);
    res.status(500).json({ error: 'Error al generar certificado' });
  }
});

// GET /api/certificates/worker/:workerId — certificados de un trabajador (admin)
router.get('/worker/:workerId', verifyAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM certificates WHERE worker_id=$1 AND company_id=$2 ORDER BY generated_at DESC',
      [req.params.workerId, req.companyId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/certificates/mine — mis certificados (trabajador)
router.get('/mine', verifyWorker, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM certificates WHERE worker_id=$1 AND company_id=$2 ORDER BY generated_at DESC',
      [req.workerId, req.companyId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

export default router;
