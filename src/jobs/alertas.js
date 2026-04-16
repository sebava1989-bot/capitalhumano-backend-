/**
 * Cron de alertas — día 7 de cada mes
 * Revisa todas las empresas activas y detecta:
 *  1. Trabajadores sin liquidación del mes en curso
 *  2. Trabajadores sin ningún contrato cargado
 * Envía resumen a ALERT_EMAIL (hardcodeado en .env)
 */

import 'dotenv/config';
import cron from 'node-cron';
import nodemailer from 'nodemailer';
import pool from '../db/pool.js';

const ALERT_EMAIL = process.env.ALERT_EMAIL ?? 'contacto@tuamigodigital.cl';

// ── Mailer ──────────────────────────────────────────────────────────────────
function createTransport() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   Number(process.env.SMTP_PORT ?? 465),
    secure: process.env.SMTP_SECURE !== 'false',   // true por defecto (SSL)
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

// ── Lógica de revisión ───────────────────────────────────────────────────────
async function checkAlertas() {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const period = `${year}-${month}`;                // ej: "2026-04"

  console.log(`[alertas] Revisando periodo ${period}...`);

  // Empresas activas
  const { rows: companies } = await pool.query(
    `SELECT id, name, email FROM companies WHERE active = true ORDER BY name`
  );

  const problemas = [];

  for (const company of companies) {
    // Trabajadores activos de esta empresa
    const { rows: workers } = await pool.query(
      `SELECT id, full_name, rut FROM workers
       WHERE company_id = $1 AND active = true`,
      [company.id]
    );

    if (workers.length === 0) continue;

    const workerIds = workers.map(w => w.id);

    // Trabajadores CON liquidación del mes
    const { rows: conLiquidacion } = await pool.query(
      `SELECT DISTINCT worker_id FROM documents
       WHERE company_id = $1
         AND type = 'liquidacion'
         AND period = $2
         AND worker_id = ANY($3::uuid[])`,
      [company.id, period, workerIds]
    );
    const idsConLiq = new Set(conLiquidacion.map(r => r.worker_id));
    const sinLiquidacion = workers.filter(w => !idsConLiq.has(w.id));

    // Trabajadores SIN ningún contrato
    const { rows: conContrato } = await pool.query(
      `SELECT DISTINCT worker_id FROM documents
       WHERE company_id = $1
         AND type = 'contrato'
         AND worker_id = ANY($2::uuid[])`,
      [company.id, workerIds]
    );
    const idsConContrato = new Set(conContrato.map(r => r.worker_id));
    const sinContrato = workers.filter(w => !idsConContrato.has(w.id));

    if (sinLiquidacion.length > 0 || sinContrato.length > 0) {
      problemas.push({ company, sinLiquidacion, sinContrato, period });
    }
  }

  if (problemas.length === 0) {
    console.log('[alertas] Todo en orden — no hay pendientes.');
    return;
  }

  await enviarAlerta(problemas, period);
}

// ── Email ─────────────────────────────────────────────────────────────────────
async function enviarAlerta(problemas, period) {
  const [year, month] = period.split('-');
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                 'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const mesNombre = meses[parseInt(month) - 1];

  // ── Texto plano ──
  let texto = `Alerta Capital Humano — ${mesNombre} ${year}\n\n`;
  texto += `Se encontraron pendientes en ${problemas.length} empresa(s):\n\n`;

  for (const p of problemas) {
    texto += `━━━ ${p.company.name} ━━━\n`;
    if (p.sinLiquidacion.length > 0) {
      texto += `  Sin liquidación ${period}:\n`;
      p.sinLiquidacion.forEach(w => {
        texto += `    • ${w.full_name} (${w.rut})\n`;
      });
    }
    if (p.sinContrato.length > 0) {
      texto += `  Sin contrato cargado:\n`;
      p.sinContrato.forEach(w => {
        texto += `    • ${w.full_name} (${w.rut})\n`;
      });
    }
    texto += '\n';
  }
  texto += `Capital Humano — Tu Amigo Digital SpA\n`;

  // ── HTML ──
  const filas = problemas.map(p => {
    const liqRows = p.sinLiquidacion.map(w =>
      `<tr><td style="padding:6px 12px">${w.full_name}</td><td style="padding:6px 12px;color:#6e6e73">${w.rut}</td><td style="padding:6px 12px"><span style="background:#fff3cd;color:#856404;padding:2px 8px;border-radius:4px;font-size:12px">Sin liquidación ${p.period}</span></td></tr>`
    ).join('');
    const contrRows = p.sinContrato.map(w =>
      `<tr><td style="padding:6px 12px">${w.full_name}</td><td style="padding:6px 12px;color:#6e6e73">${w.rut}</td><td style="padding:6px 12px"><span style="background:#f8d7da;color:#721c24;padding:2px 8px;border-radius:4px;font-size:12px">Sin contrato</span></td></tr>`
    ).join('');
    return `
      <div style="margin-bottom:28px">
        <h3 style="margin:0 0 12px;font-size:16px;color:#1d1d1f">${p.company.name}</h3>
        <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08)">
          <thead>
            <tr style="background:#f5f5f7">
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6e6e73">Trabajador</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6e6e73">RUT</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6e6e73">Pendiente</th>
            </tr>
          </thead>
          <tbody>${liqRows}${contrRows}</tbody>
        </table>
      </div>`;
  }).join('');

  const html = `
  <!DOCTYPE html>
  <html lang="es">
  <body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,Inter,sans-serif">
    <div style="max-width:640px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08)">
      <!-- Header -->
      <div style="background:linear-gradient(135deg,#1d1d1f,#3a3a3c);padding:32px;text-align:center">
        <div style="font-size:32px;margin-bottom:8px">👥</div>
        <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700">Capital Humano</h1>
        <p style="margin:6px 0 0;color:rgba(255,255,255,0.6);font-size:14px">Alerta de documentos pendientes — ${mesNombre} ${year}</p>
      </div>
      <!-- Body -->
      <div style="padding:32px">
        <p style="margin:0 0 24px;color:#1d1d1f;font-size:15px">
          Se detectaron <strong>${problemas.length} empresa(s)</strong> con documentos pendientes al día 7 del mes.
        </p>
        ${filas}
        <div style="background:#f5f5f7;border-radius:10px;padding:16px;margin-top:8px">
          <p style="margin:0;font-size:13px;color:#6e6e73">
            Este correo es generado automáticamente por el sistema Capital Humano.<br/>
            Para resolver los pendientes, ingresa al panel de administración.
          </p>
        </div>
      </div>
      <!-- Footer -->
      <div style="padding:20px 32px;border-top:1px solid #f0f0f0;text-align:center">
        <p style="margin:0;font-size:12px;color:#999">Capital Humano · Desarrollado por <strong>Tu Amigo Digital SpA</strong></p>
      </div>
    </div>
  </body>
  </html>`;

  const transporter = createTransport();
  await transporter.sendMail({
    from:    `"Capital Humano" <${process.env.SMTP_USER}>`,
    to:      ALERT_EMAIL,
    subject: `⚠️ Pendientes Capital Humano — ${mesNombre} ${year}`,
    text:    texto,
    html,
  });

  console.log(`[alertas] Email enviado a ${ALERT_EMAIL} — ${problemas.length} empresa(s) con pendientes`);
}

// ── Scheduler ────────────────────────────────────────────────────────────────
export function startAlertasCron() {
  // Todos los días 7 a las 08:00 (hora del servidor)
  cron.schedule('0 8 7 * *', async () => {
    try {
      await checkAlertas();
    } catch (err) {
      console.error('[alertas] Error en cron:', err.message);
    }
  });
  console.log('[alertas] Cron programado: día 7 de cada mes a las 08:00');
}

// Permite ejecutar manualmente: node src/jobs/alertas.js
if (process.argv[1].includes('alertas')) {
  checkAlertas()
    .then(() => process.exit(0))
    .catch(err => { console.error(err); process.exit(1); });
}
