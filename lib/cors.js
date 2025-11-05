// Build allowlist from env + defaults
const envOrigins = process.env.ALLOW_ORIGINS || '';
const envList = envOrigins.split(',').map(s => s.trim()).filter(Boolean);

const defaultOrigins = [
  'https://v0-ai-sales-agent-landing-page-3e.vercel.app'
];

const ALLOWED_ORIGINS = [...defaultOrigins, ...envList];

// Check if origin matches *.vusercontent.net pattern
function matchesVercelPreview(origin) {
  if (!origin || typeof origin !== 'string') return false;
  return /^https:\/\/[a-z0-9-]+\.vusercontent\.net$/.test(origin);
}

// Check if origin is in allowlist
function isOriginAllowed(origin) {
  if (!origin) return false;
  return ALLOWED_ORIGINS.includes(origin) || matchesVercelPreview(origin);
}

export async function applyCORS(req, res) {
  const origin = req.headers.origin || req.headers.Origin || '';

  // Set CORS headers
  if (isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }

  // Always set these headers
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight OPTIONS
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }

  return false;
}

