-- Empresas (clientes SaaS)
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  rut VARCHAR(20) UNIQUE NOT NULL,
  email VARCHAR(200) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  company_code VARCHAR(6) UNIQUE NOT NULL,
  plan VARCHAR(20) DEFAULT 'freemium',
  plan_expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '30 days'),
  status VARCHAR(20) DEFAULT 'active',
  admin_signature_url TEXT,
  logo_url TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Trabajadores
CREATE TABLE IF NOT EXISTS workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  rut VARCHAR(20) NOT NULL,
  full_name VARCHAR(200) NOT NULL,
  email VARCHAR(200),
  phone VARCHAR(20),
  position VARCHAR(100),
  start_date DATE,
  password_hash VARCHAR(255),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(company_id, rut)
);

-- Documentos (liquidaciones, contratos, anexos)
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  worker_id UUID REFERENCES workers(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  name VARCHAR(200) NOT NULL,
  file_url VARCHAR(500) NOT NULL,
  period VARCHAR(20),
  uploaded_by UUID REFERENCES companies(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Certificados generados
CREATE TABLE IF NOT EXISTS certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  worker_id UUID REFERENCES workers(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  file_url VARCHAR(500) NOT NULL,
  generated_at TIMESTAMP DEFAULT NOW()
);

-- Solicitudes (vacaciones, anticipos)
CREATE TABLE IF NOT EXISTS requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  worker_id UUID REFERENCES workers(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'pendiente',
  details JSONB,
  admin_note TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Logs de actividad
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  actor_type VARCHAR(20) NOT NULL,
  actor_id UUID NOT NULL,
  action VARCHAR(100) NOT NULL,
  resource VARCHAR(100),
  resource_id UUID,
  created_at TIMESTAMP DEFAULT NOW()
);
