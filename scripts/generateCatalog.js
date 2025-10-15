// scripts/generateCatalog.js
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import Airtable from 'airtable';

const AIRTABLE_PAT = process.env.AIRTABLE_PAT;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TABLE = process.env.AIRTABLE_TABLE_NAME || 'Productos';

if (!AIRTABLE_PAT || !AIRTABLE_BASE_ID) {
  console.error('❌ Falta AIRTABLE_PAT o AIRTABLE_BASE_ID en .env');
  process.exit(1);
}

const base = new Airtable({ apiKey: AIRTABLE_PAT }).base(AIRTABLE_BASE_ID);

const outDir = path.join(process.cwd(), 'public');
const outPath = path.join(outDir, 'catalogo.html');

function rowToCard(f) {
  const phoneRaw = (f.telefono_vendedor || '').replace(/\s/g, '');
  const phone = phoneRaw.replace(/^\+/, ''); // wa.me no necesita el '+'
  const prefill = encodeURIComponent(
    `Hola, vi tu producto "${f.nombre_producto || ''}" en el catálogo de Cartly 👋 ¿sigue disponible?`
  );
  const wa = phone ? `https://wa.me/${phone}?text=${prefill}` : '#';

  const price = f.precio ? '$' + Number(f.precio).toLocaleString('es-CO') : '';
  const img = f.fotos?.[0]?.url || '';
  const vendedor = f.nombre_vendedor || 'Vendedor';

  // Iniciales del vendedor (avatar)
  const initials = vendedor
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(s => s[0].toUpperCase())
    .join('');

  return `
    <article class="card">
      <div class="media">
        ${img ? `<img src="${img}" alt="${f.nombre_producto || 'Producto'}" loading="lazy">` :
        `<div class="placeholder">📦</div>`}
        ${price ? `<span class="chip price">${price}</span>` : ``}
      </div>

      <div class="body">
        <h3 class="title">${f.nombre_producto || ''}</h3>
        <p class="desc">${f.descripcion_corta || ''}</p>

        <div class="seller">
          <div class="avatar">${initials}</div>
          <div class="seller-meta">
            <span class="seller-name">${vendedor}</span>
          </div>
        </div>

        <a class="btn" href="${wa}" target="_blank" rel="noopener">💬 Chatear por WhatsApp</a>
      </div>
    </article>
  `;
}


function template({ cardsHtml, total }) {
  const now = new Date();
  const date = now.toLocaleDateString('es-CO', { weekday: 'long', day: '2-digit', month: 'long' });

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Catálogo Cartly – ${date}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap">
<style>
  :root{
    --bg:#0b1220;
    --ink:#0f172a;
    --muted:#64748b;
    --card:#ffffff;
    --line:#e5e7eb;
    --brand:#0ea5e9;
    --brand-2:#22c55e;
  }
  *{box-sizing:border-box}
  html,body{margin:0;padding:0}
  body{
    font-family:Inter, ui-sans-serif, system-ui, Segoe UI, Roboto, Arial;
    background: linear-gradient(180deg,#f8fbff 0%, #f8fafc 100%);
    color:var(--ink);
  }

  header{
    padding:28px 16px 20px;
    background: radial-gradient(1200px 400px at 10% -40%, #e0f2fe 0%, rgba(224,242,254,0) 70%), #ffffffaa;
    border-bottom:1px solid var(--line);
    backdrop-filter: blur(6px);
    position: sticky; top:0; z-index:10;
  }
  .wrap{max-width:1080px;margin:0 auto}
  .top{display:flex;align-items:center;gap:12px}
  .logo{
    width:36px;height:36px;border-radius:10px;
    display:grid;place-items:center;
    background:linear-gradient(135deg, var(--brand), #60a5fa);
    color:white;font-weight:700;
    box-shadow:0 6px 16px rgba(14,165,233,0.35);
  }
  h1{margin:0;font-size:22px;letter-spacing:.2px}
  .sub{margin:4px 0 0 48px;color:var(--muted)}

  main{padding:22px 16px 40px}
  .grid{
    max-width:1080px;margin:0 auto;
    display:grid;gap:18px;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  }

  .card{
    background:var(--card);
    border:1px solid var(--line);
    border-radius:16px;
    overflow:hidden;
    box-shadow: 0 8px 24px rgba(2,6,23,0.06);
    display:flex;flex-direction:column;
    transition: transform .18s ease, box-shadow .18s ease;
  }
  .card:hover{
    transform: translateY(-2px);
    box-shadow: 0 14px 34px rgba(2,6,23,0.10);
  }

  .media{position:relative;background:#f1f5f9}
  .media img{display:block;width:100%;height:190px;object-fit:cover}
  .placeholder{height:190px;display:grid;place-items:center;color:#94a3b8;font-size:28px}
  .chip.price{
    position:absolute;left:12px;bottom:12px;
    background:#0ea5e9; color:white; font-weight:700;
    padding:6px 10px; border-radius:999px; font-size:14px;
    box-shadow:0 6px 14px rgba(14,165,233,0.35);
  }

  .body{padding:12px 14px 16px;display:flex;flex-direction:column;gap:10px}
  .title{margin:0;font-size:16px;line-height:1.25}
  .desc{margin:0;color:var(--muted);font-size:14px;min-height:38px}

  .seller{display:flex;align-items:center;gap:10px}
  .avatar{
    width:28px;height:28px;border-radius:10px;
    background:#e2f5ff;color:#0369a1;font-weight:700;
    display:grid;place-items:center;font-size:12px;border:1px solid #bae6fd;
  }
  .seller-name{font-size:13px;color:#334155}

  .btn{
    display:inline-block;text-align:center;text-decoration:none;
    padding:10px 12px;border-radius:10px;border:1px solid var(--brand);
    transition: background .2s ease, transform .1s ease;
  }
  .btn:hover{background:#e6f6fe}
  .btn:active{transform: translateY(1px)}
  footer{padding:26px 16px;color:var(--muted);text-align:center;border-top:1px solid var(--line)}
</style>
</head>
<body>
  <header>
    <div class="wrap">
      <div class="top">
        <div class="logo">C</div>
        <h1>Cartly • Catálogo</h1>
      </div>
      <p class="sub">${date} • ${total} productos</p>
    </div>
  </header>

  <main>
    <section class="grid">
      ${cardsHtml}
    </section>
  </main>

  <footer>Cartly — ventas entre estudiantes. Hecho con cariño 💙</footer>
</body>
</html>`;
}


async function run() {
  // lee todo y ordena por fecha_creacion desc (campo "Created time" en Airtable)
  const records = await base(AIRTABLE_TABLE).select({
    sort: [{ field: 'fecha_creacion', direction: 'desc' }]
  }).all();

  const cards = records.map(r => rowToCard(r.fields)).join('\n');
  const html = template({ cardsHtml: cards, total: records.length });

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, html, 'utf-8');
  console.log(`✅ Catálogo generado: ${outPath}`);
}

run().catch(err => { console.error(err); process.exit(1); });
