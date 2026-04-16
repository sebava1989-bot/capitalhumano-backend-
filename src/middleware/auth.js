import jwt from 'jsonwebtoken';

export function verifyAdmin(req, res, next) {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) return res.status(401).json({ error: 'Token requerido' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin') return res.status(403).json({ error: 'Acceso denegado' });
    req.companyId = decoded.companyId;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}

export function verifyWorker(req, res, next) {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) return res.status(401).json({ error: 'Token requerido' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'worker') return res.status(403).json({ error: 'Acceso denegado' });
    req.workerId = decoded.workerId;
    req.companyId = decoded.companyId;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}

export function verifyAny(req, res, next) {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) return res.status(401).json({ error: 'Token requerido' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    req.companyId = decoded.companyId;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}
