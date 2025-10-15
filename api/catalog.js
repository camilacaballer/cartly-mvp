// api/catalog.js
import Airtable from 'airtable';

const AIRTABLE_PAT = process.env.AIRTABLE_PAT;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TABLE = process.env.AIRTABLE_TABLE_NAME || 'Productos';

const base = new Airtable({ apiKey: AIRTABLE_PAT }).base(AIRTABLE_BASE_ID);

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
        ${price ? `<p class="price">${price}</p>` : ``}
        <p class="desc">${f.descripcion_corta || ''}</p>
        <div class="seller">
          <div class="avatar">${initials}</div>
          <div class="seller-meta"><span class="seller-name">${vendedor}</span></div>
        </div>
        <a class="btn" href="${wa}" target="_blank" rel="noopener">💬 Chatear por WhatsApp</a>
      </div>
    </article>
  `;
}

function template({ cardsHtml, total }) {
  const now = new Date();
  const date = now.toLocaleDateString('es-CO', { weekday: 'long', day: '2-digit', month: 'long' });
  return `<!doctype html><html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Catálogo Cartly – ${date}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap">
<style>
  :root{--ink:#0f172a;--muted:#64748b;--card:#fff;--line:#e5e7eb;--brand:#0ea5e9}
  *{box-sizing:border-box}html,body{margin:0;padding:0}
  body{font-family:Inter,ui-sans-serif,system-ui,Segoe UI,Roboto,Arial;background:#f8fafc;color:var(--ink)}
  header{padding:28px 16px 18px;border-bottom:1px solid var(--line);background:#fff}
  .wrap{max-width:1080px;margin:0 auto}
  h1{margin:0;font-size:22px} .sub{margin:6px 0 0;color:var(--muted)}
  main{padding:22px 16px 40px}
  .grid{max-width:1080px;margin:0 auto;display:grid;gap:18px;grid-template-columns:repeat(auto-fill,minmax(260px,1fr))}
  .card{background:var(--card);border:1px solid var(--line);border-radius:14px;box-shadow:0 8px 22px rgba(2,6,23,.06);overflow:hidden}
  .body{padding:14px 14px 16px;display:flex;flex-direction:column;gap:10px}
  .title{margin:0;font-size:16px;line-height:1.25}
  .price{margin:0;font-weight:700}
  .desc{margin:0;color:var(--muted);font-size:14px;min-height:38px}
  .seller{display:flex;align-items:center;gap:10px}
  .avatar{width:28px;height:28px;border-radius:10px;background:#e2f5ff;color:#0369a1;font-weight:700;display:grid;place-items:center;font-size:12px;border:1px solid #bae6fd}
  .seller-name{font-size:13px;color:#334155}
  .btn{display:inline-block;text-align:center;text-decoration:none;padding:10px 12px;border-radius:10px;border:1px solid var(--brand)}
  .btn:hover{background:#e6f6fe}
  footer{padding:24px 16px;color:var(--muted);text-align:center;border-top:1px solid var(--line)}
</style></head>
<body>
<header><div class="wrap"><h1>Cartly • Catálogo</h1><p class="sub">${date} • ${total} productos</p></div></header>
<main><section class="grid">${cardsHtml}</section></main>
<footer>Cartly — ventas entre estudiantes 💙</footer>
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
