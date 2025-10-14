const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// IDs grupos
//MarketPlace  → 120363257753809611@g.us
//Prueba → 120363401876396913@g.us

const GROUP_ID = '120363401876396913@g.us'; // ID GRUPO


const fs = require('fs');
const path = require('path');
const client = (() => {
  // Decide executable path for puppeteer/Chrome more robustly
  let execPath;
  try {
    // puppeteer package may expose an executable path if it downloaded Chromium
    const pp = require('puppeteer');
    const ppExec = pp.executablePath && typeof pp.executablePath === 'function' ? pp.executablePath() : pp.executablePath;
    execPath = ppExec;
  } catch (e) {
    execPath = undefined;
  }

  // Common Windows locations for Chrome/Chromium
  const commonPaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Chromium\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Chromium\\Application\\chrome.exe'
  ];

  // Prefer Puppeteer's Chromium if present (compatible with puppeteer-core), otherwise fall back to system Chrome
  const foundSystem = commonPaths.find(p => fs.existsSync(p));
  if (execPath && fs.existsSync(execPath)) {
    console.log('Using puppeteer/chromium executable at:', execPath);
  } else if (foundSystem) {
    execPath = foundSystem;
    console.log('Using local Chrome executable at:', execPath);
  } else {
    console.warn('No puppeteer chromium or local Chrome found. Puppeteer may fail to launch.');
    execPath = undefined;
  }

  const puppeteerOpts = {
    // Use non-headless to show the browser window for debugging on Windows.
    headless: false,
    dumpio: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--remote-debugging-port=9222'
    ]
  };
  if (execPath) puppeteerOpts.executablePath = execPath;

  return new Client({
    authStrategy: new LocalAuth({ dataPath: '.wwebjs_auth' }),
    puppeteer: puppeteerOpts,
    restartOnAuthFail: true,
    takeoverOnConflict: true,
    takeoverTimeoutMs: 3 * 60 * 1000,
  });
})();

client.on('qr', (qr) => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('Cliente listo. Escuchando grupo:', GROUP_ID));
client.on('auth_failure', (m) => console.error('auth_failure:', m));
client.on('change_state', (s) => console.log('state:', s));
client.on('disconnected', (reason) => {
  console.error('disconnected:', reason, ' → re-init en 5s');
  setTimeout(() => client.initialize(), 5000);
});


function tsISO(sec) {
  const s = typeof sec === 'number' ? sec : Math.floor(Date.now() / 1000);
  return new Date(s * 1000).toISOString();
}

// Reintenta operaciones que tocan la página (getContact, getChat, sendMessage, etc.)
async function retry(fn, tries = 4, baseDelay = 300) {
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) {
      if (i === tries - 1) throw e;
      await new Promise(r => setTimeout(r, baseDelay * (i + 1))); // backoff 300, 600, 900, ...
    }
  }
}

// Cache de números resueltos: key = serialized JID (autor/participante), value = +E164 o id crudo
const contactCache = new Map();

// Convierte JID tipo 57300...@c.us a +57300...
function jidToPlusNumber(jid) {
  if (!jid) return null;
  const user = String(jid).split('@')[0];
  return user ? ('+' + user) : null;
}

// Intenta resolver el número del remitente (maneja @c.us, @lid y privacidad)
async function resolveNumber(msg) {
  const rawAuthor = msg.author || null;         // en grupos: autor real (participante)
  const rawFrom   = msg.from || null;           // id de chat (grupo @g.us) o privado @c.us
  const key = rawAuthor || rawFrom;             // llave para cache

  // 0) Cache
  if (key && contactCache.has(key)) {
    return contactCache.get(key);
  }

  // 1) Caso fácil: ya viene @c.us
  if (rawAuthor && rawAuthor.endsWith('@c.us')) {
    const num = jidToPlusNumber(rawAuthor);
    if (key && num) contactCache.set(key, num);
    return num;
  }
  if (!rawAuthor && rawFrom && rawFrom.endsWith('@c.us')) {
    const num = jidToPlusNumber(rawFrom);
    if (key && num) contactCache.set(key, num);
    return num;
  }

  // 2) Consultar Contact (puede fallar en recargas → retry)
  try {
    const contact = await retry(() => msg.getContact(), 4, 300);
    // contact.number = "573001234567" (sin +) cuando WhatsApp lo expone
    if (contact?.number) {
      const num = '+' + contact.number;
      if (key) contactCache.set(key, num);
      return num;
    }
    // a veces viene en contact.id.user
    if (contact?.id?.user) {
      const num = '+' + contact.id.user;
      if (key) contactCache.set(key, num);
      return num;
    }
  } catch (_) {
    // seguimos al fallback de participantes / id crudo
  }

  // 3) Fallback por participantes del grupo (si WhatsApp los expone)
  try {
    if (rawFrom && rawFrom.endsWith('@g.us')) {
      const chat = await retry(() => msg.getChat(), 4, 300);
      const serialized = rawAuthor || ''; // autor del mensaje dentro del grupo
      const p = chat?.participants?.find(x => x?.id?._serialized === serialized);
      if (p?.id?.user) {
        const num = '+' + p.id.user;
        if (key) contactCache.set(key, num);
        return num;
      }
    }
  } catch (_) {
    // sin problema, último fallback abajo
  }

  // 4) Último recurso: devuelve el id crudo (puede ser @lid) para no perder trazabilidad
  const fallback = String(rawAuthor || rawFrom || 'desconocido');
  if (key) contactCache.set(key, fallback);
  return fallback;
}

// --- SOLO MENSAJES ENTRANTES (NO PROPIOS) ---
const { execFile } = require('child_process');

client.on('message', async (msg) => {
  // En grupos, msg.from es SIEMPRE el ID del grupo (@g.us)
  if (msg.from !== GROUP_ID) return;

  // Resuelve número
  let sender;
  try {
    sender = await resolveNumber(msg);
  } catch (e) {
    sender = String(msg.author || msg.from); // fallback absoluto
  }

  const body = msg.body || (msg.hasMedia ? '[MEDIA]' : '[VACÍO]');
  const when = tsISO(msg.timestamp);

  console.log(`[IN] [${when}] (${msg.from}) ${sender}: ${body}`);

  // Prepare input for parser CLI
  const mediaUrls = [];
  if (msg.hasMedia) {
    try {
      const media = await retry(() => msg.downloadMedia(), 3, 300);
      if (media && media.data) {
        // We can't host the media here; send the mimetype as a placeholder
        mediaUrls.push(`data:${media.mimetype};base64,${media.data.slice(0, 64)}...`);
      }
    } catch (e) {
      // ignore media download errors and proceed without media URLs
    }
  }

  const input = JSON.stringify({ text: body, mediaUrls });

  // Path to the parser CLI within the current cartly-mvp project
  const cliPath = path.resolve(__dirname, '..', 'src', 'parseMessageCli.js');
  const fallbackCli = path.resolve(__dirname, '..', '..', 'Cartly', 'cartly-mvp', 'src', 'parseMessageCli.js');
  const finalCli = require('fs').existsSync(cliPath) ? cliPath : fallbackCli;

  execFile(process.execPath, [finalCli, input], { timeout: 10_000 }, (err, stdout, stderr) => {
    if (err) {
      console.error('Parser CLI error:', err.message);
      if (stderr) console.error('Parser stderr:', stderr);
      return;
    }

    try {
      const marker = '---PARSED_JSON---';
      const idx = stdout.indexOf(marker);
      const jsonText = idx >= 0 ? stdout.slice(idx + marker.length).trim() : stdout.trim();
      const parsed = JSON.parse(jsonText);
      console.log('Parsed JSON:', JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.error('Could not parse CLI output as JSON. Raw stdout:', stdout);
    }
  });
});

// --- Watchdog opcional: si se cae el estado, reinicia ---
setInterval(async () => {
  try {
    const state = await client.getState(); // CONNECTED | OPENING | PAIRING ...
    if (state !== 'CONNECTED') {
      console.warn('watchdog: state=', state, ' → re-init');
      await client.destroy().catch(() => {});
      client.initialize();
    }
  } catch (e) {
    console.warn('watchdog error → re-init', e?.message || e);
    await client.destroy().catch(() => {});
    client.initialize();
  }
}, 60_000);

client.initialize();