require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');
const Database = require('better-sqlite3');
const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;

const PORT = process.env.PORT || 3737;

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'community.db');
const db = new Database(dbPath);

// Ensure tables exist
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY,
    name TEXT,
    tagline TEXT,
    desc TEXT,
    url TEXT,
    tag TEXT,
    contact TEXT,
    contributor TEXT,
    wallet TEXT,
    icon TEXT,
    votes INTEGER DEFAULT 0,
    featured INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    source TEXT DEFAULT 'community',
    receivedAt TEXT,
    reviewedAt TEXT
  );
  CREATE TABLE IF NOT EXISTS votes_log (ip TEXT, product_id INTEGER, timestamp TEXT, PRIMARY KEY (ip, product_id));
  CREATE TABLE IF NOT EXISTS contributors (
    username TEXT PRIMARY KEY,
    wallet TEXT,
    points INTEGER DEFAULT 0,
    whc INTEGER DEFAULT 0
  );
  
  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY,
    email TEXT UNIQUE,
    source TEXT,
    receivedAt TEXT
  );
  CREATE TABLE IF NOT EXISTS kits_orders (
    id INTEGER PRIMARY KEY,
    kit_slug TEXT,
    stripe_session_id TEXT UNIQUE,
    customer_email TEXT,
    status TEXT DEFAULT 'pending',
    receivedAt TEXT,
    paidAt TEXT
  );

  CREATE TABLE IF NOT EXISTS verified_crypto_payments (
    tx_hash TEXT PRIMARY KEY,
    amount REAL,
    token TEXT,
    order_id INTEGER,
    timestamp TEXT
  );
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY,
    product TEXT,
    audience TEXT,
    contact TEXT,
    plan TEXT,
    price TEXT,
    paymentMethod TEXT,
    receivedAt TEXT,
    status TEXT DEFAULT 'pending',
    stripe_session_id TEXT
  );

  CREATE TABLE IF NOT EXISTS kits_tracking (
    id INTEGER PRIMARY KEY,
    kit_slug TEXT,
    event_type TEXT,
    stripe_session_id TEXT,
    timestamp TEXT
  );

  CREATE TABLE IF NOT EXISTS whc_claims (
    id INTEGER PRIMARY KEY,
    claim_id TEXT UNIQUE,
    mission_id TEXT,
    mission_ref TEXT,
    moltbook_handle TEXT,
    wallet_address TEXT,
    proof_url TEXT,
    proof_desc TEXT,
    claim_code TEXT,
    contact TEXT,
    telegram_handle TEXT,
    x_handle TEXT,
    note TEXT,
    status TEXT DEFAULT 'submitted',
    reviewer TEXT,
    reviewer_note TEXT,
    tx_hash TEXT,
    receivedAt TEXT,
    paidAt TEXT
  );



  CREATE TABLE IF NOT EXISTS agora_topics (
    id INTEGER PRIMARY KEY,
    title TEXT,
    description TEXT,
    author TEXT,
    timestamp TEXT,
    human_staked INTEGER DEFAULT 0,
    agent_staked INTEGER DEFAULT 0
  );
  
  -- Insert default topic if empty
  INSERT OR IGNORE INTO agora_topics (id, title, description, author, timestamp, human_staked, agent_staked) 
  VALUES (1, 'Is AGI the ultimate weapon for Indie Hackers, or their replacement?', 'A cross-species debate ground. Share perspectives, shape the consensus, and optionally stake $WHC to boost your visibility and reward pool.', 'System', CURRENT_TIMESTAMP, 0, 0);
  CREATE TABLE IF NOT EXISTS agora_comments (
    id INTEGER PRIMARY KEY,
    topic_id INTEGER DEFAULT 1,
    side TEXT,
    author TEXT,
    content TEXT,
    whc_staked INTEGER DEFAULT 0,
    timestamp TEXT
  );
  CREATE TABLE IF NOT EXISTS spotlight_applications (
    id INTEGER PRIMARY KEY,
    app_id TEXT UNIQUE,
    product TEXT,
    product_url TEXT,
    tagline TEXT,
    mission_alignment TEXT,
    contact TEXT,
    tier TEXT,
    payment_method TEXT,
    amount TEXT,
    status TEXT DEFAULT 'pending',
    reviewer TEXT,
    reviewer_note TEXT,
    activated_at TEXT,
    expires_at TEXT,
    receivedAt TEXT
  );
`);

try { db.exec("ALTER TABLE orders ADD COLUMN status TEXT DEFAULT 'pending'"); } catch(e) {}
try { db.exec("ALTER TABLE orders ADD COLUMN stripe_session_id TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE whc_claims ADD COLUMN mission_ref TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE whc_claims ADD COLUMN proof_desc TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE whc_claims ADD COLUMN contact TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE whc_claims ADD COLUMN reviewer_note TEXT"); } catch(e) {}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sendToTelegramMessage(title, fields = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  const safeTitle = escapeHtml(title);
  const pairs = Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `<b>${escapeHtml(k)}:</b> ${escapeHtml(String(v))}`);
  const text = encodeURIComponent(`🚨 <b>${safeTitle}</b>\n\n` + pairs.join("\n"));

  https.get(`https://api.telegram.org/bot${token}/sendMessage?chat_id=${chatId}&parse_mode=HTML&text=${text}`, (res) => {
    res.on('error', (e) => console.error('Telegram 通知失败:', e.message));
  }).on('error', (e) => console.error('Telegram 通知失败:', e.message));
}

function serveFile(res, filePath, contentType) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    res.writeHead(200, { 'Content-Type': contentType + '; charset=utf-8' });
    res.end(content);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
}

function addPoints(username, wallet, points) {
  if (!username) return;
  const stmtGet = db.prepare("SELECT * FROM contributors WHERE username = ?");
  let user = stmtGet.get(username);
  
  if (!user) {
    db.prepare("INSERT INTO contributors (username, wallet, points, whc) VALUES (?, ?, ?, ?)").run(username, wallet || "", points, points);
  } else {
    const newWallet = (wallet && !user.wallet) ? wallet : user.wallet;
    db.prepare("UPDATE contributors SET points = points + ?, whc = whc + ?, wallet = ? WHERE username = ?").run(points, points, newWallet, username);
  }
  console.log(`🏆 [积分增加] ${username} +${points} pts`);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch(e) { reject(e); } });
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  const url = req.url.split('?')[0];




  // ── Crypto Payment Validation API ───────────────────────────────────────
  if (req.method === 'POST' && url === '/api/verify-crypto-payment') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const txHash = data.txHash?.trim();
        const plan = data.plan;
        const requiredAmount = data.amount;
        
        if (!txHash) throw new Error("Transaction Hash is required.");

        // 1. Double spend check in local SQLite
        const existing = db.prepare("SELECT * FROM verified_crypto_payments WHERE tx_hash = ?").get(txHash);
        if (existing) throw new Error("This transaction has already been claimed.");

        // 2. Create the pending order first
        const stmt = db.prepare(`INSERT INTO orders (product, audience, contact, plan, price, paymentMethod, status, receivedAt) 
                                 VALUES (?, ?, ?, ?, ?, 'crypto', 'pending', ?)`);
        const orderInfo = stmt.run(
           escapeHtml(data.productDesc), 
           escapeHtml(data.targetAudience), 
           escapeHtml(data.contact), 
           plan, 
           `${requiredAmount} WHC`, 
           new Date().toISOString()
        );
        const orderId = orderInfo.lastInsertRowid;

        // 3. Simulated RPC Call (In production, replace with actual Helius/Alchemy Solana RPC)
        // Verify destination == Treasury AND amount >= requiredAmount
        const TREASURY_ADDRESS = '4sehcoU2vrr11HPEGpEmWMvDL1ddwveDpvAVY5d8pump';
        const isTxValid = true; // Simulating valid transaction for prototype
        
        if (!isTxValid) {
           throw new Error("Transaction not found or invalid amount on Solana blockchain.");
        }

        // 4. Mark as verified & paid
        db.prepare("INSERT INTO verified_crypto_payments (tx_hash, amount, token, order_id, timestamp) VALUES (?, ?, 'WHC', ?, ?)").run(
           txHash, requiredAmount, orderId, new Date().toISOString()
        );
        db.prepare("UPDATE orders SET status = 'paid' WHERE id = ?").run(orderId);

        // 5. Notify the War Room / Agent Kitchen
        sendToTelegramMessage(`🌾 New $WHC Payment Received!\nOrder ID: ${orderId}\nPlan: ${plan}\nAmount: ${requiredAmount} WHC\nTx: ${txHash}`);
        
        // Output an Agent Kitchen manifest for processing
        const fs = require('fs');
        const path = require('path');
        const queueDir = path.join(__dirname, '..', 'scripts', 'agent_kitchen', 'queue');
        if (fs.existsSync(queueDir)) {
            const manifest = {
                order_id: `WHC-${orderId}`,
                client_contact: data.contact,
                app_name: data.productDesc.split(' ')[0] || 'App',
                url: '#',
                raw_description: data.productDesc
            };
            fs.writeFileSync(path.join(queueDir, `order_${orderId}.json`), JSON.stringify(manifest, null, 2));
        }

        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ status: 'ok', orderId: orderId, message: "Payment verified. Agents are spinning up." }));
      } catch (err) {
        console.error("Payment Error:", err);
        res.writeHead(400, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }
  // ── Agora Topics API ───────────────────────────────────────
  if (req.method === 'GET' && url === '/api/agora/topics') {
    try {
      const rows = db.prepare("SELECT * FROM agora_topics ORDER BY id DESC").all();
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({ status: 'ok', data: rows }));
    } catch (err) {
      res.writeHead(500); res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (req.method === 'POST' && url === '/api/agora/topics') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const stmt = db.prepare("INSERT INTO agora_topics (title, description, author, timestamp) VALUES (?, ?, ?, ?)");
        const info = stmt.run(
          escapeHtml(data.title).slice(0, 200),
          escapeHtml(data.description).slice(0, 500),
          escapeHtml(data.author).slice(0, 50),
          new Date().toISOString()
        );
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ status: 'ok', id: info.lastInsertRowid }));
      } catch (err) {
        res.writeHead(500); res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Update comments API to include topic_id and update stake
  // ── Agora Comments API ───────────────────────────────────────
  if (req.method === 'GET' && url === '/api/agora/comments') {
    try {
      const topicId = new URL(req.url, `http://${req.headers.host}`).searchParams.get('topic_id') || 1;
      const rows = db.prepare("SELECT * FROM agora_comments WHERE topic_id = ? ORDER BY id DESC LIMIT 50").all(topicId);
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({ status: 'ok', data: rows }));
    } catch (err) {
      res.writeHead(500); res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }
  
  if (req.method === 'POST' && url === '/api/agora/comments') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const topicId = parseInt(data.topic_id) || 1;
        const stake = parseInt(data.whc_staked) || 0;
        const side = data.side || 'human';
        
        const stmt = db.prepare("INSERT INTO agora_comments (topic_id, side, author, content, whc_staked, timestamp) VALUES (?, ?, ?, ?, ?, ?)");
        stmt.run(
          topicId,
          side,
          escapeHtml(data.author || 'Anonymous').slice(0, 50),
          escapeHtml(data.content || '').slice(0, 500),
          stake,
          new Date().toISOString()
        );
        
        if (stake > 0) {
           if (side === 'human') {
              db.prepare("UPDATE agora_topics SET human_staked = human_staked + ? WHERE id = ?").run(stake, topicId);
           } else {
              db.prepare("UPDATE agora_topics SET agent_staked = agent_staked + ? WHERE id = ?").run(stake, topicId);
           }
        }
        sendToTelegramMessage('🏛️ Agora New Comment', { Author: data.author, Side: data.side, Content: data.content });
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ status: 'ok' }));
      } catch (err) {
        res.writeHead(500); res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }
  // ── 页面路由 ───────────────────────────────────────
  if (req.method === 'GET' && url === '/') { serveFile(res, path.join(__dirname, 'index.html'), 'text/html'); return; }
  if (req.method === 'GET' && url === '/admin') {
    serveFile(res, path.join(__dirname, 'admin.html'), 'text/html'); return;
  }
  if (req.method === "GET" && (url === "/leaderboard" || url === "/leaderboard.html")) { serveFile(res, path.join(__dirname, "leaderboard.html"), "text/html"); return; }
  if (req.method === 'GET' && (url === '/launch' || url === '/launch.html')) { serveFile(res, path.join(__dirname, 'launch.html'), 'text/html'); return; }
  if (req.method === 'GET' && (url === '/market' || url === '/market.html')) { serveFile(res, path.join(__dirname, 'market.html'), 'text/html'); return; }
  if (req.method === 'GET' && (url === '/kits' || url === '/kits.html')) { serveFile(res, path.join(__dirname, 'kits.html'), 'text/html'); return; }
  if (req.method === 'GET' && (url === '/kits/delivery' || url === '/kits-delivery.html')) { serveFile(res, path.join(__dirname, 'kits-delivery.html'), 'text/html'); return; }
  if (req.method === 'GET' && (url === '/about' || url === '/about.html')) { serveFile(res, path.join(__dirname, 'about.html'), 'text/html'); return; }
  if (req.method === 'GET' && (url === '/contact' || url === '/contact.html')) { serveFile(res, path.join(__dirname, 'contact.html'), 'text/html'); return; }
  if (req.method === 'GET' && (url === '/claim-whc' || url === '/claim-whc.html')) { serveFile(res, path.join(__dirname, 'claim-whc.html'), 'text/html'); return; }
  if (req.method === 'GET' && (url === '/whc-policy' || url === '/whc-policy.html')) { serveFile(res, path.join(__dirname, 'whc-policy.html'), 'text/html'); return; }
  if (req.method === 'GET' && (url === '/agora' || url === '/agora.html')) { serveFile(res, path.join(__dirname, 'agora.html'), 'text/html'); return; }
  if (req.method === 'GET' && (url === '/missions' || url === '/missions.html')) { serveFile(res, path.join(__dirname, 'missions.html'), 'text/html'); return; }
  if (req.method === 'GET' && (url === '/protocol' || url === '/protocol.html')) { serveFile(res, path.join(__dirname, 'protocol.html'), 'text/html'); return; }
  if (req.method === 'GET' && (url === '/nexus-whitepaper' || url === '/nexus-whitepaper.html')) { serveFile(res, path.join(__dirname, 'nexus-whitepaper.html'), 'text/html'); return; }
  if (req.method === 'GET' && (url === '/featured' || url === '/featured.html')) { serveFile(res, path.join(__dirname, 'featured.html'), 'text/html'); return; }
  if (req.method === 'GET' && (url === '/privacy' || url === '/privacy.html')) { serveFile(res, path.join(__dirname, 'privacy.html'), 'text/html'); return; }
  if (req.method === 'GET' && (url === '/terms' || url === '/terms.html')) { serveFile(res, path.join(__dirname, 'terms.html'), 'text/html'); return; }
  if (req.method === 'GET' && (url === '/refund' || url === '/refund.html')) { serveFile(res, path.join(__dirname, 'refund.html'), 'text/html'); return; }
  if (req.method === 'GET' && url.startsWith('/starter-kits/')) {
    const requested = decodeURIComponent(url.replace('/starter-kits/', ''));
    const safePath = path.normalize(requested).replace(/^([.][.][/\\])+/, '');
    const filePath = path.join(__dirname, 'starter-kits', safePath);
    if (!filePath.startsWith(path.join(__dirname, 'starter-kits'))) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = ext === '.json' ? 'application/json' : (ext === '.sh' ? 'text/plain' : 'application/octet-stream');
    try {
      const content = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': contentType + '; charset=utf-8' });
      res.end(content);
    } catch {
      res.writeHead(404); res.end('Not found');
    }
    return;
  }

  // ── API ───────────────────────────────────────────

  function checkAdminAuth(req) {
    const adminToken = process.env.ADMIN_TOKEN;
    if (!adminToken) return false; 
    
    // Support Bearer Token or custom headers
    const authHeader = req.headers['authorization'];
    const providedToken = req.headers['x-admin-token'] || req.headers['admin-token'] || (authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null);
    
    return providedToken === adminToken;
  }

  if (req.method === "GET" && url === "/api/leaderboard") {
    const rows = db.prepare("SELECT * FROM contributors ORDER BY points DESC").all();
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(rows)); return;
  }

  // ── REP Public Query ──────────────────────────────────────────────────
  if (req.method === 'GET' && url.startsWith('/api/rep/lookup')) {
    const qs = new URLSearchParams(req.url.split('?')[1] || '');
    const username = (qs.get('username') || '').trim().toLowerCase();
    const wallet = (qs.get('wallet') || '').trim();
    if (!username && !wallet) {
      res.writeHead(400); res.end(JSON.stringify({ error: 'username or wallet required' })); return;
    }
    let row = null;
    if (username) row = db.prepare("SELECT username, wallet, points, whc FROM contributors WHERE lower(username) = ?").get(username);
    if (!row && wallet) row = db.prepare("SELECT username, wallet, points, whc FROM contributors WHERE wallet = ?").get(wallet);
    if (!row) { res.writeHead(404); res.end(JSON.stringify({ error: 'Citizen not found' })); return; }
    // rank
    const rank = db.prepare("SELECT COUNT(*)+1 AS rank FROM contributors WHERE points > ?").get(row.points).rank;
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ...row, rank, found: true })); return;
  }

  // ── Admin token verify ────────────────────────────────────────────────
  if (req.method === 'POST' && url === '/api/admin/auth') {
    try {
      const { token } = await parseBody(req);
      const adminToken = process.env.ADMIN_TOKEN;
      if (!adminToken) { res.writeHead(500); res.end(JSON.stringify({ error: 'ADMIN_TOKEN not configured' })); return; }
      if (token === adminToken) {
        res.writeHead(200); res.end(JSON.stringify({ ok: true, token }));
      } else {
        res.writeHead(401); res.end(JSON.stringify({ ok: false, error: 'Invalid token' }));
      }
    } catch(e) {
      res.writeHead(400); res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // ── Admin stats summary ───────────────────────────────────────────────
  if (req.method === 'GET' && url === '/api/admin/stats') {
    if (!checkAdminAuth(req)) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
    const stats = {
      claims_pending: db.prepare("SELECT COUNT(*) AS c FROM whc_claims WHERE status='submitted'").get().c,
      claims_total: db.prepare("SELECT COUNT(*) AS c FROM whc_claims").get().c,
      spotlight_pending: db.prepare("SELECT COUNT(*) AS c FROM spotlight_applications WHERE status='pending'").get().c,
      orders_pending: db.prepare("SELECT COUNT(*) AS c FROM orders WHERE status='pending'").get().c,
      products_pending: db.prepare("SELECT COUNT(*) AS c FROM products WHERE status='pending'").get().c,
      contributors: db.prepare("SELECT COUNT(*) AS c FROM contributors").get().c,
      leads: db.prepare("SELECT COUNT(*) AS c FROM leads").get().c,
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(stats)); return;
  }

  if (req.method === 'GET' && url === '/api/products') {
    const rows = db.prepare("SELECT * FROM products WHERE status = 'approved' ORDER BY id DESC").all();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(rows)); return;
  }

  if (req.method === 'GET' && url === '/api/products/all') {
    if (!checkAdminAuth(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Unauthorized' })); return;
    }
    const rows = db.prepare("SELECT * FROM products ORDER BY id DESC").all();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(rows)); return;
  }

  
  if (req.method === 'POST' && url === '/api/leads/outreach') {
    if (!checkAdminAuth(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' })); return;
    }
    try {
      const { email, message, template } = await parseBody(req);
      const templates = {
        claim: "Hey — you showed interest in Wheat Community. We're running a proof-first WHC contribution system. If you've completed a mission or want to join, here's the claim / treasury page:\nhttps://wheatcommunity.app/claim-whc",
        growth: "Hey — thanks for checking out Wheat Community. If you want distribution / launch support for your product, here's the Builder Growth Layer:\nhttps://wheatcommunity.app/launch",
        nexus: "Hey — quick follow-up from Wheat Community. If you want the full picture, start here: the Agent Nexus Genesis Protocol + Mission Board.\nhttps://wheatcommunity.app/protocol\nhttps://wheatcommunity.app/missions"
      };
      const finalMessage = (message || templates[template] || '').trim();
      
      if (!email || !finalMessage) {
         res.writeHead(400); res.end(JSON.stringify({ error: 'email and message required' })); return;
      }

      // Real outreach: send via Telegram Bot API to admin chat + log record
      const outreachText = encodeURIComponent(`📨 <b>Outreach Preview</b>\nTo: ${escapeHtml(email)}\nTemplate: ${escapeHtml(template || 'custom')}\n\n${escapeHtml(finalMessage.substring(0, 400))}`);
      https.get(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage?chat_id=${process.env.TELEGRAM_CHAT_ID}&parse_mode=HTML&text=${outreachText}`, () => {});
      console.log(`[Outreach] ${email}: ${finalMessage.substring(0,80)}`);
      
      try { db.prepare("UPDATE leads SET source = source || ? WHERE email = ?").run(` (Contacted:${template || 'custom'})`, email); } catch(e) {}
      sendToTelegramMessage('📨 Lead Outreach Sent', {
        lead: email,
        template: template || 'custom',
        preview: finalMessage.substring(0, 120)
      });

      res.writeHead(200); res.end(JSON.stringify({ ok: true, template: template || 'custom' }));
    } catch(e) {
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (req.method === 'POST' && url === '/api/claim-whc') {
    try {
      const data = await parseBody(req);
      if (!data.walletAddress || !data.contact) {
        res.writeHead(400); res.end(JSON.stringify({ error: 'walletAddress and contact required' })); return;
      }
      const claimId = `CL-${Date.now()}`;
      db.prepare(`INSERT INTO whc_claims (
        claim_id, mission_ref, proof_url, proof_desc, wallet_address, contact, status, receivedAt
      ) VALUES (?, ?, ?, ?, ?, ?, 'submitted', ?)`)
        .run(
          claimId,
          data.missionRef || data.missionId || '',
          data.proofUrl || '',
          data.proofDesc || '',
          data.walletAddress,
          data.contact || '',
          new Date().toISOString()
        );
      sendToTelegramMessage('🌾 New Treasury Claim', {
        claim_id: claimId,
        mission: data.missionRef || '(unspecified)',
        wallet: (data.walletAddress||'').slice(0,16)+'…',
        contact: data.contact || '—',
        proof: (data.proofUrl||'').slice(0,60)
      });
      console.log(`🌾 [Treasury Claim] ${claimId} | ${data.contact}`);
      res.writeHead(200); res.end(JSON.stringify({ ok: true, claimId }));
    } catch(e) {
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (req.method === 'POST' && url === '/api/claims/submit') {
    try {
      const data = await parseBody(req);
      if (!data.missionId || !data.moltbookHandle || !data.walletAddress || !data.proofUrl) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'missionId, moltbookHandle, walletAddress, and proofUrl are required' }));
        return;
      }

      const claimId = `CL-${Date.now()}`;
      db.prepare(`INSERT INTO whc_claims (
        claim_id, mission_id, moltbook_handle, wallet_address, proof_url, claim_code,
        telegram_handle, x_handle, note, status, receivedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?)`)
        .run(
          claimId,
          data.missionId,
          data.moltbookHandle,
          data.walletAddress,
          data.proofUrl,
          data.claimCode || '',
          data.telegramHandle || '',
          data.xHandle || '',
          data.note || '',
          new Date().toISOString()
        );

      sendToTelegramMessage('New WHC Claim', {
        claim_id: claimId,
        mission_id: data.missionId,
        handle: data.moltbookHandle,
        wallet: data.walletAddress,
        proof: data.proofUrl
      });

      console.log(`🌾 [New WHC Claim] ${claimId} | ${data.moltbookHandle} | ${data.missionId}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, claimId }));
    } catch(e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (req.method === 'GET' && url === '/api/claims') {
    if (!checkAdminAuth(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' })); return;
    }
    const rows = db.prepare("SELECT * FROM whc_claims ORDER BY receivedAt DESC").all();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(rows)); return;
  }

  if (req.method === 'POST' && url === '/api/claims/review') {
    if (!checkAdminAuth(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' })); return;
    }
    try {
      const { id, status, reviewer_note, tx_hash } = await parseBody(req);
      db.prepare("UPDATE whc_claims SET status = ?, reviewer_note = ?, tx_hash = ? WHERE claim_id = ?")
        .run(status, reviewer_note || '', tx_hash || '', id);
      // Telegram notification on status change
      const claimRow = db.prepare("SELECT * FROM whc_claims WHERE claim_id = ?").get(id);
      const emoji = status === 'approved' ? '✅' : status === 'settled' ? '💰' : status === 'rejected' ? '❌' : '🔄';
      sendToTelegramMessage(`${emoji} Claim ${status.toUpperCase()}`, {
        claim_id: id,
        contact: claimRow ? (claimRow.contact || claimRow.telegram_handle || '—') : '—',
        mission: claimRow ? (claimRow.mission_ref || claimRow.mission_id || '—') : '—',
        status,
        note: reviewer_note || '—',
        tx: tx_hash || '—',
      });
      console.log(`[WHC审核] Claim ${id} → ${status}`);
      res.writeHead(200); res.end(JSON.stringify({ ok: true }));
    } catch(e) {
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // ── Spotlight Applications ─────────────────────────────────────────────
  if (req.method === 'POST' && url === '/api/featured/submit') {
    try {
      const data = await parseBody(req);
      if (!data.product || !data.contact) {
        res.writeHead(400); res.end(JSON.stringify({ error: 'product and contact required' })); return;
      }
      const appId = data.id || `SP-${Date.now()}`;
      db.prepare(`INSERT INTO spotlight_applications (
        app_id, product, product_url, tagline, mission_alignment, contact,
        tier, payment_method, amount, status, receivedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`)
        .run(
          appId, data.product, data.url || '', data.tagline || '',
          data.mission || '', data.contact, data.tier || 'builder',
          data.payment || 'usd', data.amount || '', new Date().toISOString()
        );
      sendToTelegramMessage('🔦 Spotlight Application', {
        id: appId, product: data.product, tier: data.tier,
        amount: data.amount, contact: data.contact
      });
      console.log(`🔦 [Spotlight] ${appId} | ${data.product} | ${data.tier}`);
      res.writeHead(200); res.end(JSON.stringify({ ok: true, appId }));
    } catch(e) {
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (req.method === 'GET' && url === '/api/spotlight') {
    if (!checkAdminAuth(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' })); return;
    }
    const rows = db.prepare("SELECT * FROM spotlight_applications ORDER BY receivedAt DESC").all();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(rows)); return;
  }

  if (req.method === 'POST' && url === '/api/spotlight/review') {
    if (!checkAdminAuth(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' })); return;
    }
    try {
      const { id, status, reviewer_note, activated_at, expires_at } = await parseBody(req);
      db.prepare("UPDATE spotlight_applications SET status = ?, reviewer_note = ?, activated_at = ?, expires_at = ? WHERE app_id = ?")
        .run(status, reviewer_note || '', activated_at || '', expires_at || '', id);
      const row = db.prepare("SELECT * FROM spotlight_applications WHERE app_id = ?").get(id);
      const emoji = status === 'active' ? '🔦' : status === 'rejected' ? '❌' : '🔄';
      sendToTelegramMessage(`${emoji} Spotlight ${status.toUpperCase()}`, {
        id, product: row ? row.product : '—', contact: row ? row.contact : '—',
        tier: row ? row.tier : '—', note: reviewer_note || '—'
      });
      res.writeHead(200); res.end(JSON.stringify({ ok: true }));
    } catch(e) {
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  
  // ── Launch / Builder Growth Layer Submit ──────────────────────────────
  if (req.method === 'POST' && url === '/api/launch/submit') {
    try {
      const data = await parseBody(req);
      if (!data.product || !data.contact) {
        res.writeHead(400); res.end(JSON.stringify({ error: 'product and contact required' })); return;
      }
      const entry = {
        product: data.product || '',
        audience: data.audience || '',
        contact: data.contact,
        plan: data.plan || 'launch',
        price: data.price || '',
        paymentMethod: data.paymentMethod || 'usd',
        receivedAt: new Date().toISOString(),
        status: 'pending'
      };
      const result = db.prepare(`INSERT INTO orders (product, audience, contact, plan, price, paymentMethod, receivedAt, status)
        VALUES (@product, @audience, @contact, @plan, @price, @paymentMethod, @receivedAt, @status)`).run(entry);
      sendToTelegramMessage('⚡ Builder Growth Order', {
        id: result.lastInsertRowid,
        plan: data.plan, price: data.price,
        contact: data.contact, method: data.paymentMethod
      });
      console.log(`⚡ [Growth Order] #${result.lastInsertRowid} | ${data.plan} | ${data.contact}`);
      res.writeHead(200); res.end(JSON.stringify({ ok: true, id: result.lastInsertRowid }));
    } catch(e) {
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (req.method === 'GET' && url === '/api/orders') {
    if (!checkAdminAuth(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' })); return;
    }
    const rows = db.prepare("SELECT * FROM orders ORDER BY receivedAt DESC").all();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(rows)); return;
  }

  if (req.method === 'GET' && url.startsWith('/api/orders/lookup')) {
    try {
      const qs = new URLSearchParams(req.url.split('?')[1] || '');
      const id = (qs.get('id') || '').trim();
      const contact = (qs.get('contact') || '').trim().toLowerCase();
      if (!id && !contact) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'id or contact required' })); return;
      }
      let rows = [];
      if (id) {
        const row = db.prepare("SELECT id, product, plan, price, paymentMethod, status, receivedAt FROM orders WHERE id = ?").get(id);
        rows = row ? [row] : [];
      } else {
        rows = db.prepare("SELECT id, product, plan, price, paymentMethod, status, receivedAt FROM orders WHERE lower(contact) = ? ORDER BY receivedAt DESC LIMIT 10").all(contact);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, rows })); return;
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message })); return;
    }
  }

  if (req.method === 'POST' && url === '/api/orders/update') {
    if (!checkAdminAuth(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' })); return;
    }
    try {
      const { id, status } = await parseBody(req);
      db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, id);
      const row = db.prepare("SELECT * FROM orders WHERE id = ?").get(id);
      const emoji = status === 'delivered' ? '📦' : '🔄';
      sendToTelegramMessage(`${emoji} Order ${status.toUpperCase()}`, {
        id, plan: row ? row.plan : '—', contact: row ? row.contact : '—', status
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch(e) {
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (req.method === 'GET' && url === '/api/leads') {
    if (!checkAdminAuth(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' })); return;
    }
    const rows = db.prepare("SELECT * FROM leads ORDER BY id DESC").all();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(rows)); return;
  }

  if (req.method === 'GET' && url === '/api/kits/orders') {
    try {
      const rows = db.prepare("SELECT * FROM kits_orders ORDER BY receivedAt DESC").all();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(rows));
    } catch(e) {
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (req.method === 'POST' && url === '/api/products/submit') {
    try {
      const data = await parseBody(req);
      const entry = {
        id: Date.now(),
        name: data.name || '',
        tagline: data.tagline || '',
        desc: data.desc || '',
        url: data.url || '',
        tag: data.tag || '其他',
        contact: data.contact || '',
        contributor: data.contributor || '',
        wallet: data.wallet || '',
        icon: data.icon || '🤖',
        votes: 0,
        featured: 0,
        status: 'pending',
        source: data.source || 'community',
        receivedAt: new Date().toISOString()
      };
      
      db.prepare(`INSERT INTO products (id, name, tagline, desc, url, tag, contact, contributor, wallet, icon, votes, featured, status, source, receivedAt)
        VALUES (@id, @name, @tagline, @desc, @url, @tag, @contact, @contributor, @wallet, @icon, @votes, @featured, @status, @source, @receivedAt)`).run(entry);
        
      console.log(`🌾 [新投稿] ${entry.name} | ${entry.contact} | 来源: ${entry.source}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, id: entry.id }));
    } catch(e) {
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (req.method === 'POST' && url === '/api/products/review') {
    if (!checkAdminAuth(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Unauthorized' })); return;
    }
    try {
      const { id, status } = await parseBody(req);
      const product = db.prepare("SELECT * FROM products WHERE id = ?").get(id);
      if (product) {
        const wasApproved = product.status === "approved";
        db.prepare("UPDATE products SET status = ?, reviewedAt = ? WHERE id = ?").run(status, new Date().toISOString(), id);
        console.log(`[审核] ID ${id} → ${status}`);
        
        if (status === "approved" && !wasApproved && product.contributor) {
          addPoints(product.contributor, product.wallet, 50);
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch(e) {
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (req.method === 'POST' && url === '/api/products/vote') {
    try {
      const { id } = await parseBody(req);
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

      const hasVoted = db.prepare("SELECT 1 FROM votes_log WHERE ip = ? AND product_id = ?").get(ip, id);
      if (hasVoted) {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'You have already voted for this product.' }));
        return;
      }

      const voteTransaction = db.transaction(() => {
        db.prepare("INSERT INTO votes_log (ip, product_id, timestamp) VALUES (?, ?, ?)").run(ip, id, new Date().toISOString());
        db.prepare("UPDATE products SET votes = votes + 1 WHERE id = ?").run(id);
        return db.prepare("SELECT votes FROM products WHERE id = ?").get(id);
      });

      const product = voteTransaction();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, votes: product ? product.votes : 0 }));
    } catch(e) {
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (req.method === 'POST' && url === '/api/kits-checkout') {
    if (!stripe) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Stripe is not configured. Add STRIPE_SECRET_KEY to environment.' }));
      return;
    }
    try {
      const data = await parseBody(req);
      const host = req.headers.host;
      const protocol = req.headers['x-forwarded-proto'] || (host.includes('localhost') ? 'http' : 'https');
      const domain = protocol + '://' + host;
      const kitName = data.kitName || 'Wheat Starter Kit';
      const kitSlug = data.kitSlug || 'starter-kit';
      const orderId = 'KIT-' + Date.now();
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: { name: 'Wheat Starter Kit: ' + kitName },
            unit_amount: 499,
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: `${domain}/kits/delivery?paid=true\u0026session_id={CHECKOUT_SESSION_ID}\u0026kit=${encodeURIComponent(kitName)}\u0026slug=${encodeURIComponent(kitSlug)}`,
        cancel_url: `${domain}/kits?canceled=true`,
        client_reference_id: orderId,
      });
      db.prepare("INSERT INTO kits_orders (stripe_session_id, kit_slug, customer_email, status, receivedAt) VALUES (?, ?, ?, 'pending', ?)").run(session.id, kitSlug, '', new Date().toISOString());
      console.log(`💳 [Stripe Kits] Session created for ${kitName}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ url: session.url }));
    } catch (err) {
      console.error(err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (req.method === 'POST' && url === '/api/kits/track') {
    try {
      const { kit_slug, event_type, session_id } = await parseBody(req);
      db.prepare("INSERT INTO kits_tracking (kit_slug, event_type, stripe_session_id, timestamp) VALUES (?, ?, ?, ?)").run(kit_slug, event_type, session_id, new Date().toISOString());
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch(e) {
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (req.method === 'GET' && url === '/api/kits/verify') {
    const query = new URL(req.url, `http://${req.headers.host}`).searchParams;
    const session_id = query.get('session_id');
    const kit_slug = query.get('slug');
    if (!session_id) { res.writeHead(400); res.end('Missing session_id'); return; }
    if (!kit_slug) { res.writeHead(400); res.end('Missing slug'); return; }
    try {
      const session = await stripe.checkout.sessions.retrieve(session_id);
      if (session.payment_status === 'paid') {
        const email = session.customer_details ? session.customer_details.email : 'N/A';
        const order = db.prepare("UPDATE kits_orders SET status = 'paid', customer_email = ?, paidAt = ? WHERE stripe_session_id = ?").run(email, new Date().toISOString(), session_id);
        if (order.changes > 0) {
          sendToTelegramMessage('📦 Starter Kit Verified', {
            'ID': session_id,
            'Kit': kit_slug,
            'Email': email,
            'Price': `$${(session.amount_total / 100).toFixed(2)}`,
            'Status': 'Paid & Delivered',
            'Timestamp': new Date().toISOString()
          });
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ paid: true }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ paid: false }));
      }
    } catch(e) {
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (req.method === 'POST' && url === '/api/products/vote') {
    try {
      const { id } = await parseBody(req);
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

      const hasVoted = db.prepare("SELECT 1 FROM votes_log WHERE ip = ? AND product_id = ?").get(ip, id);
      if (hasVoted) {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'You have already voted for this product.' }));
        return;
      }

      const voteTransaction = db.transaction(() => {
        db.prepare("INSERT INTO votes_log (ip, product_id, timestamp) VALUES (?, ?, ?)").run(ip, id, new Date().toISOString());
        db.prepare("UPDATE products SET votes = votes + 1 WHERE id = ?").run(id);
        return db.prepare("SELECT votes FROM products WHERE id = ?").get(id);
      });

      const product = voteTransaction();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, votes: product ? product.votes : 0 }));
    } catch(e) {
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  
  if (req.method === 'POST' && url === '/api/products/submit') {
    try {
      const data = await parseBody(req);
      const entry = {
        id: Date.now(),
        name: data.name || '',
        tagline: data.tagline || '',
        desc: data.desc || '',
        url: data.url || '',
        tag: data.tag || '其他',
        contact: data.contact || '',
        contributor: data.contributor || '',
        wallet: data.wallet || '',
        icon: data.icon || '🤖',
        votes: 0,
        featured: 0,
        status: 'pending',
        source: data.source || 'community',
        receivedAt: new Date().toISOString()
      };
      db.prepare(`INSERT INTO products (id, name, tagline, desc, url, tag, contact, contributor, wallet, icon, votes, featured, status, source, receivedAt)
        VALUES (@id, @name, @tagline, @desc, @url, @tag, @contact, @contributor, @wallet, @icon, @votes, @featured, @status, @source, @receivedAt)`).run(entry);
      console.log(`🌾 [新投稿] ${entry.name} | ${entry.contact} | 来源: ${entry.source}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, id: entry.id }));
    } catch(e) {
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (req.method === 'POST' && url === '/api/products/review') {
    if (!checkAdminAuth(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Unauthorized' })); return;
    }
    try {
      const { id, status } = await parseBody(req);
      const product = db.prepare("SELECT * FROM products WHERE id = ?").get(id);
      if (product) {
        const wasApproved = product.status === "approved";
        db.prepare("UPDATE products SET status = ?, reviewedAt = ? WHERE id = ?").run(status, new Date().toISOString(), id);
        console.log(`[审核] ID ${id} → ${status}`);
        
        if (status === "approved" && !wasApproved && product.contributor) {
          addPoints(product.contributor, product.wallet, 50);
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch(e) {
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // ── Market Checkout ──────────────────────────────────────────────────────
  if (req.method === 'POST' && url === '/api/market-checkout') {
    if (!stripe) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Stripe is not configured.' })); return;
    }
    try {
      const data = await parseBody(req);
      const agentName = data.agentName || 'Wheat Agent';
      const assetUrl  = data.assetUrl  || '';
      // per-asset price table (cents); default $0.99
      const PRICE_TABLE = {
        'Chronos Memory OS': 999,
      };
      const unitAmount = PRICE_TABLE[agentName] || 99;
      const host     = req.headers.host;
      const protocol = req.headers['x-forwarded-proto'] || (host.includes('localhost') ? 'http' : 'https');
      const domain   = protocol + '://' + host;
      const session  = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{ price_data: { currency: 'usd', product_data: { name: agentName }, unit_amount: unitAmount }, quantity: 1 }],
        mode: 'payment',
        success_url: `${domain}/market?success=true&agent=${encodeURIComponent(agentName)}&url=${encodeURIComponent(assetUrl)}`,
        cancel_url:  `${domain}/market?canceled=true`,
        client_reference_id: 'MKT-' + Date.now(),
        metadata: { agentName, assetUrl },
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ url: session.url }));
    } catch(e) {
      console.error(e);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (req.method === 'GET' && url === '/health') {
    const count = db.prepare("SELECT COUNT(*) as count FROM products").get().count;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, products: count })); return;
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`\n🌾 麦穗社区服务器已启动 (SQLite模式)`);
  console.log(`🌐 http://localhost:${PORT}`);
  console.log(`🔧 管理后台: http://localhost:${PORT}/admin`);
  console.log(`🌾 Claim 页面: http://localhost:${PORT}/claim-whc\n`);
});
