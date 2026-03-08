const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3737;
const DB_FILE = path.join(__dirname, 'data', 'products.json');

// 确保数据目录存在
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'));
}

function readDB() {
  if (!fs.existsSync(DB_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch { return []; }
}

function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
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
  if (req.method === 'GET' && url === '/') {
    serveFile(res, path.join(__dirname, 'index.html'), 'text/html'); return;
  }
  if (req.method === 'GET' && url === '/admin') {
    serveFile(res, path.join(__dirname, 'admin.html'), 'text/html'); return;
  }

  // ── API ───────────────────────────────────────────

  // 获取产品列表（公开：只返回 approved）
  if (req.method === 'GET' && url === '/api/products') {
    const all = readDB();
    const approved = all.filter(p => p.status === 'approved');
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(approved)); return;
  }

  // 获取全部（管理后台用）
  if (req.method === 'GET' && url === '/api/products/all') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(readDB())); return;
  }

  // 提交产品
  if (req.method === 'POST' && url === '/api/products/submit') {
    try {
      const data = await parseBody(req);
      const products = readDB();
      const entry = {
        id: Date.now(),
        name: data.name || '',
        tagline: data.tagline || '',
        desc: data.desc || '',
        url: data.url || '',
        tag: data.tag || '其他',
        contact: data.contact || '',
        icon: data.icon || '🤖',
        votes: 0,
        featured: false,
        status: 'pending',
        source: data.source || 'community', // 'community' | 'genius_plan'
        receivedAt: new Date().toISOString()
      };
      products.unshift(entry);
      writeDB(products);
      console.log(`🌾 [新投稿] ${entry.name} | ${entry.contact} | 来源: ${entry.source}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, id: entry.id }));
    } catch(e) {
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // 审核（approve / reject）
  if (req.method === 'POST' && url === '/api/products/review') {
    try {
      const { id, status } = await parseBody(req);
      const products = readDB();
      const idx = products.findIndex(p => p.id == id);
      if (idx >= 0) {
        products[idx].status = status;
        products[idx].reviewedAt = new Date().toISOString();
        writeDB(products);
        console.log(`[审核] ID ${id} → ${status}`);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch(e) {
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // 投票
  if (req.method === 'POST' && url === '/api/products/vote') {
    try {
      const { id } = await parseBody(req);
      const products = readDB();
      const idx = products.findIndex(p => p.id == id);
      if (idx >= 0) products[idx].votes = (products[idx].votes || 0) + 1;
      writeDB(products);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, votes: products[idx]?.votes }));
    } catch(e) {
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // 健康检查
  if (req.method === 'GET' && url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, products: readDB().length })); return;
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`\n🌾 麦穗社区服务器已启动`);
  console.log(`🌐 http://localhost:${PORT}`);
  console.log(`🔧 管理后台: http://localhost:${PORT}/admin\n`);
});
