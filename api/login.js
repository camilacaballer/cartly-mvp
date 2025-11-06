import bcrypt from 'bcryptjs';
import { findUserByPhone } from '../lib/airtable.js';
import { applyCORS } from '../lib/cors.js';

function isValidPhone(telefono) {
  return typeof telefono === 'string' && /^\+[0-9]{10,15}$/.test(telefono);
}

function isValidPassword(pass) {
  return typeof pass === 'string' && pass.length >= 6;
}

export default async function handler(req, res) {
  if (await applyCORS(req, res)) return;

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
    return;
  }

  try {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('application/json')) {
      res.status(400).json({ ok: false, error: 'INVALID_CONTENT_TYPE' });
      return;
    }

    const body = req.body && typeof req.body === 'object' ? req.body : await new Promise((resolve, reject) => {
      let data = '';
      req.on('data', chunk => (data += chunk));
      req.on('end', () => {
        try { resolve(JSON.parse(data || '{}')); } catch (e) { reject(e); }
      });
      req.on('error', reject);
    });

    const { telefono, contraseña } = body || {};

    if (!isValidPhone(telefono) || !isValidPassword(contraseña)) {
      res.status(401).json({ ok: false, error: 'INVALID_CREDENTIALS' });
      return;
    }

    const record = await findUserByPhone(telefono);
    if (!record) {
      res.status(401).json({ ok: false, error: 'INVALID_CREDENTIALS' });
      return;
    }

    const hash = record.fields.password_hash || '';
    const ok = await bcrypt.compare(contraseña, hash);
    if (!ok) {
      res.status(401).json({ ok: false, error: 'INVALID_CREDENTIALS' });
      return;
    }

    const user = { nombre: record.fields.nombre, telefono: record.fields.telefono };
    res.status(200).json({ ok: true, user });
  } catch (err) {
    console.error('login error', err);
    res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
}


