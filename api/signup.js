import bcrypt from 'bcryptjs';
import { findUserByPhone, createUser } from '../lib/airtable.js';
import { applyCORS } from '../lib/cors.js';

function isValidName(nombre) {
  return typeof nombre === 'string' && nombre.trim().length >= 1 && nombre.trim().length <= 60;
}

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

    const { nombre, telefono, contraseña } = body || {};

    if (!isValidName(nombre) || !isValidPhone(telefono) || !isValidPassword(contraseña)) {
      res.status(400).json({ ok: false, error: 'INVALID_INPUT' });
      return;
    }

    const existing = await findUserByPhone(telefono);
    if (existing) {
      res.status(409).json({ ok: false, error: 'PHONE_TAKEN' });
      return;
    }

    const passwordHash = await bcrypt.hash(contraseña, 10);
    const record = await createUser({ nombre: nombre.trim(), telefono: telefono.trim(), passwordHash });

    const user = { nombre: record.fields.nombre, telefono: record.fields.telefono };
    res.status(201).json({ ok: true, user });
  } catch (err) {
    console.error('signup error', err);
    res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
}


