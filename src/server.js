import 'dotenv/config';
import Airtable from 'airtable';

// Airtable
const AIRTABLE_PAT = process.env.AIRTABLE_PAT;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME || 'Productos';

const base = AIRTABLE_PAT && AIRTABLE_BASE_ID
  ? new Airtable({ apiKey: AIRTABLE_PAT }).base(AIRTABLE_BASE_ID)
  : null;

// Sesiones en memoria (OK para MVP)
const sessions = new Map();

function startSession(from) {
  sessions.set(from, {
    step: 0,
    data: { telefono_vendedor: (from || '').replace('whatsapp:', '') }
  });
}

const clean = (s = '') => s.trim();

function priceFrom(text = '') {
  const t = text.replace(/\./g, '').replace(/k/gi, '000').replace(/\s/g, '');
  const m = t.match(/(\d{1,3}(?:\d{3})*|\d+)/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isNaN(n) ? null : n;
}

function preview(d) {
  return [
    '🧾 Vista previa:',
    `• Vendedor: ${d.nombre_vendedor || '-'}`,
    `• Teléfono: ${d.telefono_vendedor || '-'}`,
    `• Producto: ${d.nombre_producto || '-'}`,
    `• Precio: ${d.precio ? '$' + d.precio.toLocaleString('es-CO') : '-'}`,
    `• Descripción: ${d.descripcion_corta || '-'}`,
    d.fotos?.length ? `• Foto(s): ${d.fotos.join(', ')}` : null
  ].filter(Boolean).join('\n');
}

// Healthcheck
app.get('/health', (_req, res) => res.send('ok'));

// Webhook de WhatsApp (configura esta URL en Twilio Sandbox)
app.post('/twilio/whatsapp', async (req, res) => {
  const twiml = new MessagingResponse();
  const from = req.body.From || '';
  const body = (req.body.Body || '').trim();
  const numMedia = parseInt(req.body.NumMedia || '0', 10);

  const mediaUrls = [];
  for (let i = 0; i < numMedia; i++) {
    const url = req.body[`MediaUrl${i}`];
    if (url) mediaUrls.push(url);
  }

  if (!sessions.has(from)) {
    startSession(from);
    twiml.message(
      "¡Hola! Soy Cartly 🤖\n" +
      "Te ayudo a publicar en el catálogo. Responde estas preguntas:\n\n" +
      "1/5 ¿Cuál es tu nombre?"
    );
    res.type('text/xml').send(twiml.toString());
    return;
  }

  const session = sessions.get(from);
  const { step, data } = session;

  try {
    if (step === 0) {
      if (!body) {
        twiml.message("¿Cómo te llamas?");
      } else {
        data.nombre_vendedor = clean(body).slice(0, 60);
        session.step = 1;
        twiml.message("2/5 ¿Nombre del producto? (título corto)");
      }
    } else if (step === 1) {
      if (!body) {
        twiml.message("Pon un título corto, ej: 'Bicicleta GW'");
      } else {
        data.nombre_producto = body.slice(0, 60);
        session.step = 2;
        twiml.message("3/5 ¿Precio? (ej: 80k, 120000)");
      }
    } else if (step === 2) {
      const val = priceFrom(body);
      if (val === null) {
        twiml.message("No entendí el precio 😅. Escríbelo como 80k o 120000.");
      } else {
        data.precio = val;
        session.step = 3;
        twiml.message("4/5 Escribe una descripción corta (máx 140 caracteres).");
      }
    } else if (step === 3) {
      if (!body) {
        twiml.message("Necesito una descripción corta (máx 140).");
      } else {
        data.descripcion_corta = body.slice(0, 140);
        session.step = 4;
        twiml.message("5/5 ¿Foto? (opcional) Envía 1–3 imágenes ahora o escribe 'OMITIR'.");
      }
    } else if (step === 4) {
      if (numMedia > 0) data.fotos = mediaUrls.slice(0, 3);
      session.step = 5;
      twiml.message(preview(data) + "\n\n¿Guardar para el catálogo? Responde SI o NO.");
    } else if (step === 5) {
      const ok = ['si', 'sí', 'ok', 'vale', 'dale', 'claro'].includes(body.toLowerCase());
      if (!ok) {
        sessions.delete(from);
        startSession(from);
        twiml.message("Listo, no guardo. Empecemos de nuevo. 1/5 ¿Cuál es tu nombre?");
      } else {
        if (!base) {
          twiml.message("No tengo conexión a la base. Revisa variables de entorno.");
        } else {
          await base(AIRTABLE_TABLE_NAME).create([{
            fields: {
              nombre_vendedor: data.nombre_vendedor || '',
              telefono_vendedor: data.telefono_vendedor || '',
              nombre_producto: data.nombre_producto || '',
              precio: data.precio || null,
              descripcion_corta: data.descripcion_corta || '',
              fotos: (data.fotos || []).map(u => ({ url: u }))
              // fecha_creacion: usa el campo "Created time" en Airtable
            }
          }]);
          twiml.message("¡Listo! ✅ Guardado. Te avisamos cuando salga el catálogo.");
        }
        sessions.delete(from);
      }
    } else {
      sessions.delete(from);
      startSession(from);
      twiml.message("Empecemos de nuevo. 1/5 ¿Cuál es tu nombre?");
    }
  } catch (err) {
    console.error(err);
    twiml.message("Ups, hubo un error guardando. Intenta de nuevo.");
  }

  res.type('text/xml').send(twiml.toString());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Cartly escuchando en http://localhost:${PORT}`));
