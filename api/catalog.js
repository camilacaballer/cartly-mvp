// api/catalog.js — versión “cute” sin fotos ✨
import Airtable from 'airtable';

const AIRTABLE_PAT = process.env.AIRTABLE_PAT;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TABLE = process.env.AIRTABLE_TABLE_NAME || 'Productos';

const base = new Airtable({ apiKey: AIRTABLE_PAT }).base(AIRTABLE_BASE_ID);

// --- UI helpers ---
function rowToCard(f) {
  const phone = (f.telefono_vendedor || '').replace(/\s/g, '').replace(/^\+/, '');
  const prefill = encodeURIComponent(
    `Hola, vi tu producto "${f.nombre_producto || ''}" en el catálogo de Cartly 👋 ¿sigue disponible?`
  );
  const wa = phone ? `https://wa.me/${phone}?text=${prefill}` : '#';

  const price = f.precio ? '$' + Number(f.precio).toLocaleString('es-CO') : '';
  const vendedor = f.nombre_vendedor || 'Vendedor';
  const initials = vendedor.split(' ').filter(Boolean).slice(0,2).map(s=>s[0].toUpperCase()).join('');

  return `
    <article class="card">
      <div class="body">
        <h3 class="title">${f.nombre_producto || ''}</h3>
        ${price ? `<div class="pill">${price}</div>` : ``}
        <p class="desc">${f.descripcion_corta || ''}</p>

        <div class="seller">
          <div class="avatar">${initials}</div>
          <div class="seller-meta">
            <span class="seller-name">${vendedor}</span>
          </div>
        </div>

        <a class="btn" href="${wa}" target="_blank" rel="noopener">
          <span class="whats">💬</span> Escríbeme por WhatsApp
        </a>
      </div>
    </article>
  `;
}

function template({ cardsHtml, total }) {
  const now = new Date();
  const date = now.toLocaleDateString('es-CO', { weekday: 'long', day: '2-digit', month: 'long' });

  return `<!doctype html><html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cartly • Catálogo</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Plus+Jakarta+Sans:wght@600;700&display=swap">
<style>
  :root{
    --ink:#0b1220;
    --muted:#64748b;
    --line:#e6e8ee;
    --card:#ffffff;
    --brand:#6d5ef1;      /* morado suave */
    --brand-2:#22c55e;    /* verde acento */
    --bg1:#f7f8ff;        /* fondo claro */
    --bg2:#f8fafc;
  }
  *{box-sizing:border-box}
  html,body{margin:0;padding:0}
  body{
    font-family:Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial;
    color:var(--ink);
    background: radial-gradient(1200px 400px at 10% -40%, #e9e7ff 0%, rgba(233,231,255,0) 70%), var(--bg2);
  }

  /* Header */
  header{
    position:sticky; top:0; z-index:10;
    background:linear-gradient(180deg,#ffffffcc, #ffffff99);
    backdrop-filter:saturate(1.2) blur(6px);
    border-bottom:1px solid var(--line);
  }
  .wrap{max-width:1100px;margin:0 auto;padding:20px 16px}
  .head{
    display:flex;align-items:center;gap:12px;justify-content:space-between;flex-wrap:wrap;
  }
  .brand{
    display:flex;align-items:center;gap:12px;
  }
  .logo{
    width:40px;height:40px;border-radius:12px;display:grid;place-items:center;
    background: conic-gradient(from 220deg at 50% 50%, var(--brand), #9b8cff, #60a5fa, var(--brand));
    color:#fff;font-weight:800;font-family:"Plus Jakarta Sans", Inter, sans-serif;
    box-shadow:0 8px 20px rgba(109,94,241,.35);
  }
  h1{
    margin:0;font-family:"Plus Jakarta Sans", Inter, sans-serif;
    font-size:22px; letter-spacing:.2px;
  }
  .meta{
    margin:0;color:var(--muted);font-size:14px;
  }

  /* Grid */
  main{padding:24px 16px 40px}
  .grid{
    max-width:1100px;margin:0 auto;
    display:grid;gap:18px;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  }

  /* Card */
  .card{
    background:var(--card);
    border:1px solid var(--line);
    border-radius:16px;
    overflow:hidden;
    box-shadow: 0 8px 24px rgba(2,6,23,.06);
    transition: transform .18s ease, box-shadow .18s ease;
  }
  .card:hover{
    transform: translateY(-2px);
    box-shadow: 0 14px 34px rgba(2,6,23,.12);
  }
  .body{padding:14px 14px 16px;display:flex;flex-direction:column;gap:12px}
  .title{margin:0;font-size:16px;line-height:1.25;font-weight:700}
  .pill{
    display:inline-block;align-self:flex-start;
    padding:6px 10px; border-radius:999px; font-weight:700; font-size:13px;
    background: #eef2ff; color:#3b2fe0; border:1px solid #dbdefa;
  }
  .desc{margin:0;color:var(--muted);font-size:14px;min-height:38px}

  .seller{display:flex;align-items:center;gap:10px}
  .avatar{
    width:28px;height:28px;border-radius:10px;
    background:#ecebff;color:#3b2fe0;font-weight:800;
    display:grid;place-items:center;font-size:12px;border:1px solid #dcd9ff;
  }
  .seller-name{font-size:13px;color:#334155}

  .btn{
    display:inline-flex;align-items:center;gap:8px;
    justify-content:center;text-decoration:none;text-align:center;
    padding:11px 12px;border-radius:12px;font-weight:600;
    border:1px solid #10b981; color:#065f46;
    background: linear-gradient(180deg, #ecfdf5, #d1fae5);
    transition: transform .1s ease, box-shadow .15s ease, filter .15s ease;
  }
  .btn:hover{filter: saturate(1.1); box-shadow:0 8px 20px rgba(16,185,129,.18)}
  .btn:active{transform: translateY(1px)}
  .btn .whats{font-size:16px}

  /* Footer */
  footer{padding:24px 16px;color:var(--muted);text-align:center;border-top:1px solid var(--line)}
</style></head>
<body>
  <header>
    <div class="wrap">
      <div class="head">
        <div class="brand">
          <div class="logo">C</div>
          <div>
            <h1>Cartly • Catálogo</h1>
            <p class="meta">${date} • ${total} productos</p>
          </div>
        </div>
      </div>
    </div>
  </header>

  <main>
    <section class="grid">
      ${cardsHtml}
    </section>
  </main>

  <footer>Cartly — ventas entre estudiantes. Hecho con cariño 💙</footer>
</body></html>`;
}

export default async function handler(req, res) {
  try {
    const records = await base(AIRTABLE_TABLE).select({
      sort: [{ field: 'fecha_creacion', direction: 'desc' }]
    }).all();
    const cards = records.map(r => rowToCard(r.fields)).join('\n');
    const html = template({ cardsHtml: cards, total: records.length });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(html);
  } catch (e) {
    console.error(e);
    res.status(500).send('Error generando el catálogo');
  }
}
