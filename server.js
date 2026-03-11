require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');
const Database = require('better-sqlite3');

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
  CREATE TABLE IF NOT EXISTS contributors (
    username TEXT PRIMARY KEY,
    wallet TEXT,
    points INTEGER DEFAULT 0,
    whc INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY,
    product TEXT,
    audience TEXT,
    contact TEXT,
    plan TEXT,
    price TEXT,
    paymentMethod TEXT,
    receivedAt TEXT
  );
`);

function sendToTelegram(order) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  
  const text = encodeURIComponent(
    '🚨 <b>新订单 (天才发射台)</b>\n\n' +
    '<b>单号:</b> ' + order.id + '\n' +
    '<b>产品:</b> ' + (order.product || '无') + '\n' +
    '<b>用户:</b> ' + (order.audience || '无') + '\n' +
    '<b>联系方式:</b> ' + (order.contact || '无') + '\n' +
    '<b>套餐:</b> ' + (order.plan || '无') + '\n' +
    '<b>支付:</b> ' + (order.price || '无') + ' (' + (order.paymentMethod || '无') + ')\n' +
    '<b>时间:</b> ' + order.receivedAt
  );

  const req = https.request({
    hostname: 'api.telegram.org',
    port: 443,
    path: '/bot' + token + '/sendMessage?chat_id=' + chatId + '&parse_mode=HTML&text=' + text,
    method: 'GET'
  });
  req.on('error', (e) => console.error('Telegram 通知失败:', e.message));
  req.end();
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
  if (req.method === 'GET' && url === '/admin') { serveFile(res, path.join(__dirname, 'admin.html'), 'text/html'); return; }
  if (req.method === "GET" && (url === "/leaderboard" || url === "/leaderboard.html")) { serveFile(res, path.join(__dirname, "leaderboard.html"), "text/html"); return; }
  if (req.method === 'GET' && (url === '/launch' || url === '/launch.html')) { serveFile(res, path.join(__dirname, 'launch.html'), 'text/html'); return; }

  // ── API ───────────────────────────────────────────

  function checkAdminAuth(req) {
    const adminPass = process.env.ADMIN_PASSWORD;
    if (!adminPass) return true; // 如果没有配密码，默认放行（方便本地开发）
    const authHeader = req.headers['authorization'];
    if (!authHeader) return false;
    const token = authHeader.replace('Bearer ', '');
    return token === adminPass;
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
      db.prepare("UPDATE products SET votes = votes + 1 WHERE id = ?").run(id);
      const product = db.prepare("SELECT votes FROM products WHERE id = ?").get(id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, votes: product ? product.votes : 0 }));
    } catch(e) {
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (req.method === 'POST' && url === '/api/launch/submit') {
    try {
      const data = await parseBody(req);
      const order = {
        id: Date.now(),
        product: data.product || '',
        audience: data.audience || '',
        contact: data.contact || '',
        plan: data.plan || '',
        price: data.price || '',
        paymentMethod: data.paymentMethod || '',
        receivedAt: new Date().toISOString()
      };
      
      db.prepare(`INSERT INTO orders (id, product, audience, contact, plan, price, paymentMethod, receivedAt)
        VALUES (@id, @product, @audience, @contact, @plan, @price, @paymentMethod, @receivedAt)`).run(order);
        
      console.log(`⚡ [天才发射台] 新订单: ${data.plan} | ${data.contact}`);
      sendToTelegram(order);

      if (data.product) {
        const autoEntry = {
          id: Date.now() + 1,
          name: data.product.substring(0, 40),
          tagline: `来自天才发射台 · ${data.plan}用户`,
          desc: `产品：${data.product}\n目标用户：${data.audience || ''}`,
          url: '',
          tag: 'AI Agent',
          contact: data.contact || '',
          contributor: data.contributor || '',
          wallet: data.wallet || '',
          icon: '⚡',
          votes: 0,
          featured: 0,
          status: 'pending',
          source: 'genius_plan',
          receivedAt: new Date().toISOString()
        };
        db.prepare(`INSERT INTO products (id, name, tagline, desc, url, tag, contact, contributor, wallet, icon, votes, featured, status, source, receivedAt)
          VALUES (@id, @name, @tagline, @desc, @url, @tag, @contact, @contributor, @wallet, @icon, @votes, @featured, @status, @source, @receivedAt)`).run(autoEntry);
        console.log(`🌾 [自动投稿] ${autoEntry.name} 已提交社区审核`);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch(e) {
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
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
  console.log(`🔧 管理后台: http://localhost:${PORT}/admin\n`);
});