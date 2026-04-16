import express from 'express';
import cors from 'cors';
import authRouter from './routes/auth.js';
import workersRouter from './routes/workers.js';
import documentsRouter from './routes/documents.js';
import requestsRouter from './routes/requests.js';
import dashboardRouter from './routes/dashboard.js';
import certificatesRouter from './routes/certificates.js';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  app.get('/health', (_, res) => res.json({ status: 'ok', service: 'CapitalHumano API' }));

  app.use('/api/auth', authRouter);
  app.use('/api/workers', workersRouter);
  app.use('/api/documents', documentsRouter);
  app.use('/api/requests', requestsRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/certificates', certificatesRouter);

  return app;
}
