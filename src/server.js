import 'dotenv/config';
import { createApp } from './index.js';
import pool from './db/pool.js';
import { startAlertasCron } from './jobs/alertas.js';

const PORT = process.env.PORT ?? 3001;

const app = createApp();

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`[server] CapitalHumano API corriendo en http://0.0.0.0:${PORT}`);
  try {
    await pool.query('SELECT 1');
    console.log('[db] PostgreSQL conectado');
  } catch (err) {
    console.warn('[db] Sin conexión a PostgreSQL:', err.message);
  }
  startAlertasCron();
});
