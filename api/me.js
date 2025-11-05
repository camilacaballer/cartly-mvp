import { findUserByPhone } from '../lib/airtable.js';
import { applyCORS } from '../lib/cors.js';

function isValidPhone(telefono) {
  return typeof telefono === 'string' && /^\+[0-9]{10,15}$/.test(telefono);
}

export default async function handler(req, res) {
  if (await applyCORS(req, res)) return;

  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
    return;
  }

  try {
    const { telefono } = req.query || {};
    if (!isValidPhone(telefono)) {
      res.status(400).json({ ok: false, error: 'INVALID_INPUT' });
      return;
    }

    const record = await findUserByPhone(telefono);
    if (!record) {
      res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      return;
    }

    const user = { nombre: record.fields.nombre, telefono: record.fields.telefono };
    res.status(200).json({ ok: true, user });
  } catch (err) {
    console.error('me error', err);
    res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
}


