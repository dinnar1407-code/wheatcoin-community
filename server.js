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
    moltbook_handle TEXT,
    wallet_address TEXT,
    proof_url TEXT,
    claim_code TEXT,
    telegram_handle TEXT,
    x_handle TEXT,
    note TEXT,
    status TEXT DEFAULT 'submitted',
    reviewer TEXT,
    tx_hash TEXT,
    receivedAt TEXT,
    paidAt TEXT
  );
`);

try { db.exec("ALTER TABLE orders ADD COLUMN status TEXT DEFAULT 'pending'"); } catch(e) {}
try { db.exec("ALTER TABLE orders ADD COLUMN stripe_session_id TEXT"); } catch(e) {}

function sendToTelegramMessage(title, fields = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  const pairs = Object.entries(fields).map(([k,v]) => `<b>${k}:</b> ${v}`);
  const text = encodeURIComponent(`🚨 <b>${title}</b>\n\n` + pairs.join("\n"));

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

  // ── 页面路由 ───────────────────────────────────────
  if (req.method === 'GET' && url === '/') { serveFile(res, path.join(__dirname, 'index.html'), 'text/html'); return; }
  if (req.method === 'GET' && url === '/admin') {
    if (!checkAdminAuth(req)) {
      res.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Unauthorized'); return;
    }
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

  
  if (req.method === 'POST' && url === '/api/leads/submit') {
    try {
      const data = await parseBody(req);
      if(data.email) {
        db.prepare("INSERT OR IGNORE INTO leads (email, source, receivedAt) VALUES (?, ?, ?)").run(data.email, data.source || 'website', new Date().toISOString());
        console.log(`📧 [New Lead] ${data.email}`);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
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

  
  if (req.method === 'GET' && url === '/api/orders') {
    if (!checkAdminAuth(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' })); return;
    }
    const rows = db.prepare("SELECT * FROM orders ORDER BY receivedAt DESC").all();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(rows)); return;
  }

  if (req.method === 'POST' && url === '/api/orders/update') {
    if (!checkAdminAuth(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' })); return;
    }
    try {
      const { id, status } = await parseBody(req);
      db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, id);
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
