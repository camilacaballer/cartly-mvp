const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { default: ProductParser } = require('../src/productParser.js');
const { saveProduct } = require('../src/airtableHandler.js');
require('dotenv').config({ path: '../.env' });

const { ProductParser } = require('../src/productParser.js');
const { saveProduct } = require('../src/airtableHandler.js');
require('dotenv').config();

// IDs grupos
//MarketPlace  → 120363257753809611@g.us
//Prueba → 120363401876396913@g.us

const GROUP_ID = '120363401876396913@g.us'; // ID GRUPO

// Create parser instance
const parser = new ProductParser(process.env.OPENAI_API_KEY);


const fs = require('fs');
const path = require('path');
// Utility function to force-remove a file/directory
// Generate a unique session path for this run
const getUniqueSessionPath = () => {
  const timestamp = new Date().toISOString().replace(/[:]/g, '-').slice(0, 19);
  return path.join(__dirname, '.wwebjs_sessions', `session_${timestamp}`);
};

const forceRemove = async (path) => {
  if (!fs.existsSync(path)) return;
  try {
    if (fs.lstatSync(path).isDirectory()) {
      const files = fs.readdirSync(path);
      for (const file of files) {
        await forceRemove(path + '/' + file);
      }
      fs.rmdirSync(path);
    } else {
      for (let attempts = 0; attempts < 5; attempts++) {
        try {
          fs.unlinkSync(path);
          break;
        } catch (e) {
          if (e.code === 'EBUSY' || e.code === 'EPERM') {
            await new Promise(r => setTimeout(r, 1000)); // wait and retry
            continue;
          }
          throw e;
        }
      }
    }
  } catch (e) {
    console.warn(`Could not remove ${path}:`, e?.message || e);
  }
};

// Manage browser and session cleanup
let browser = null;
const sessionPath = getUniqueSessionPath();

const cleanupSession = async () => {
  console.log('Using session path:', sessionPath);
  
  // Create sessions directory if it doesn't exist
  const sessionsDir = path.join(__dirname, '.wwebjs_sessions');
  if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
  }

  // Clean up old session directories (keep last 5)
  try {
    const sessions = fs.readdirSync(sessionsDir)
      .filter(f => f.startsWith('session_'))
      .sort()
      .reverse();
    
    for (const oldSession of sessions.slice(5)) {
      await forceRemove(path.join(sessionsDir, oldSession));
    }
  } catch (e) {
    console.warn('Error cleaning old sessions:', e?.message || e);
  }
};

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
    // Conservative options for stability on Windows/servers.
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1920x1080',
      '--aggressive-cache-discard',
      '--disable-cache',
      '--disable-application-cache',
      '--disable-offline-load-stale-cache',
      '--disk-cache-size=0'
    ]
  };
  if (execPath) puppeteerOpts.executablePath = execPath;

  return new Client({
    authStrategy: new LocalAuth({ dataPath: sessionPath }),
    puppeteer: {
      ...puppeteerOpts,
      // Browser instance management
      createBrowserFetcher: () => {
        return {
          launch: async () => {
            if (browser) {
              try {
                await browser.close();
              } catch (e) {
                console.warn('Error closing previous browser:', e?.message || e);
              }
            }
            try {
              const puppeteer = require('puppeteer-core');
              browser = await puppeteer.launch(puppeteerOpts);
              return browser;
            } catch (e) {
              console.error('Browser launch error:', e?.message || e);
              throw e;
            }
          }
        };
      }
    },
    restartOnAuthFail: true,
    takeoverOnConflict: true,
    takeoverTimeoutMs: 3 * 60 * 1000,
  });
})();

client.on('qr', (qr) => qrcode.generate(qr, { small: true }));
// Restart/backoff limiter to avoid rapid re-initialization loops
let restartAttempts = 0;
const MAX_RESTARTS = 6; // after this, stop trying to re-init automatically
const BASE_DELAY_MS = 5000;

// Event handlers for client state
client.on('ready', () => {
  restartAttempts = 0; // Reset counter on successful connection
  console.log('Cliente listo. Escuchando grupo:', GROUP_ID);
});

client.on('auth_failure', (m) => console.error('auth_failure:', m));
client.on('change_state', (s) => console.log('state:', s));

client.on('disconnected', async (reason) => {
  console.error('disconnected:', reason);
  if (restartAttempts >= MAX_RESTARTS) {
    console.error(`Reached max restart attempts (${MAX_RESTARTS}). Manual intervention required.`);
    console.error('Please scan QR code again to re-authenticate.');
    
    // Try to clean up browser
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        console.warn('Error closing browser:', e?.message || e);
      }
      browser = null;
    }
    
    // Exit process for a clean restart
    process.exit(1);
  }
  
  restartAttempts += 1;
  const delay = BASE_DELAY_MS * Math.pow(2, restartAttempts - 1); // exponential backoff: 5s,10s,20s...
  console.warn(`re-init attempt #${restartAttempts} in ${delay/1000}s`);
  
  // Clean up browser before retry
  if (browser) {
    try {
      await browser.close();
    } catch (e) {
      console.warn('Error closing browser:', e?.message || e);
    }
    browser = null;
  }
  
  // Wait for the backoff delay
  await new Promise(resolve => setTimeout(resolve, delay));
  
  try {
    await client.initialize();
  } catch (e) {
    console.error('Error during re-initialize:', e?.message || e);
  }
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

  execFile(process.execPath, [finalCli, input], { timeout: 10_000 }, async (err, stdout, stderr) => {
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

      // Add the sender's phone number to the parsed data
      parsed.telefono_vendedor = sender.startsWith('+') ? sender.slice(1) : sender;

      // Save to Airtable
      try {
        await saveProduct(parsed);
        console.log('Product saved to Airtable successfully');
      } catch (airtableError) {
        console.error('Error saving to Airtable:', airtableError);
      }
    } catch (e) {
      console.error('Could not parse CLI output as JSON. Raw stdout:', stdout);
    }
  });
});

// --- Enhanced watchdog and keep-alive system ---
let lastActivity = Date.now();
let lastPingSent = 0;
const PING_INTERVAL = 30_000; // Send ping every 30 seconds
const WATCHDOG_INTERVAL = 60_000; // Check connection every minute
const ACTIVITY_TIMEOUT = 180_000; // Consider inactive after 3 minutes of no events

// Update activity timestamp on any important event
const updateActivity = () => {
  lastActivity = Date.now();
};

client.on('message', updateActivity);
client.on('message_ack', updateActivity);
client.on('state_change', updateActivity);

// Keep-alive ping to group
const sendKeepAlivePing = async () => {
  try {
    const chat = await client.getChatById(GROUP_ID);
    if (chat) {
      // Send invisible typing notification as keep-alive
      await chat.sendStateTyping();
      await new Promise(r => setTimeout(r, 100));
      await chat.clearState();
      lastPingSent = Date.now();
      updateActivity();
    }
  } catch (e) {
    console.warn('Keep-alive ping failed:', e?.message || e);
  }
};

// Enhanced watchdog
setInterval(async () => {
  try {
    const now = Date.now();
    const state = await client.getState(); // CONNECTED | OPENING | PAIRING ...
    
    // Log current status periodically (helps with monitoring)
    console.log(`[${new Date().toISOString()}] Watchdog check - State: ${state}, Last activity: ${Math.floor((now - lastActivity)/1000)}s ago`);

    // Check if we need to send a keep-alive ping
    if (state === 'CONNECTED' && (now - lastPingSent) >= PING_INTERVAL) {
      await sendKeepAlivePing();
    }

    // If no activity and bad state, attempt recovery
    if ((now - lastActivity) >= ACTIVITY_TIMEOUT || state !== 'CONNECTED') {
      console.warn('Watchdog: No recent activity or disconnected state detected');
      if (restartAttempts < MAX_RESTARTS) {
        console.warn('Attempting recovery...');
        await client.destroy().catch(() => {});
        await new Promise(r => setTimeout(r, 1000));
        await client.initialize();
      } else {
        console.error('Max restart attempts reached - requires manual intervention');
      }
    }
  } catch (e) {
    console.warn('Watchdog error:', e?.message || e);
    if (restartAttempts < MAX_RESTARTS) {
      await client.destroy().catch(() => {});
      await new Promise(r => setTimeout(r, 1000));
      await client.initialize();
    }
  }
}, WATCHDOG_INTERVAL);

// Start the client
(async () => {
  try {
    await cleanupSession();
    updateActivity();
    await client.initialize();
  } catch (e) {
    console.error('Error during startup:', e?.message || e);
    process.exit(1);
  }
})();