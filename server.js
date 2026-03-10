const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');

const PORT = process.env.PORT || 3737;
const DB_FILE = path.join(__dirname, 'data', 'products.json');

// 确保数据目录存在
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'));
}


// ==========================================
// 🚨 发送订单通知到 Telegram 的无数据库接单逻辑
// ==========================================
function sendToTelegram(order) {
  // 填写你的 Telegram 机器人 Token
  const token = process.env.TELEGRAM_BOT_TOKEN || '8584844135:AAHdTAgCz5mTrcpImpH7hMlcbcuG2ExB1GQ';
  const chatId = '8309413776'; // 你的 Telegram Chat ID (Terry)
  
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

const DB_CONTRIB = path.join(__dirname, "data", "contributors.json");

function readContributors() {
  if (!fs.existsSync(DB_CONTRIB)) return [];
  try { return JSON.parse(fs.readFileSync(DB_CONTRIB, "utf8")); } catch { return []; }
}

function writeContributors(data) {
  fs.writeFileSync(DB_CONTRIB, JSON.stringify(data, null, 2), "utf8");
}

function addPoints(username, wallet, points) {
  if (!username) return;
  const contributors = readContributors();
  let user = contributors.find(c => c.username === username);
  if (!user) {
    user = { username, wallet: wallet || "", points: 0, whc: 0 };
    contributors.push(user);
  }
  user.points += points;
  user.whc += points;
  if (wallet && !user.wallet) user.wallet = wallet;
  contributors.sort((a, b) => b.points - a.points);
  writeContributors(contributors);
  console.log(`🏆 [积分增加] ${username} +${points} pts (Total: ${user.points})`);
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
  if (req.method === "GET" && (url === "/leaderboard" || url === "/leaderboard.html")) {
    serveFile(res, path.join(__dirname, "leaderboard.html"), "text/html"); return;
  }
  // 天才发射台 / 营销方案
  if (req.method === 'GET' && (url === '/launch' || url === '/launch.html')) {
    serveFile(res, path.join(__dirname, 'launch.html'), 'text/html'); return;
  }

  // ── API ───────────────────────────────────────────

  // 排行榜 API
  if (req.method === "GET" && url === "/api/leaderboard") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(readContributors())); return;
  }

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
        contributor: data.contributor || '',
        wallet: data.wallet || '',
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
        // Check if status changed to approved to grant points
        const wasApproved = products[idx].status === "approved";
        products[idx].status = status;
        products[idx].reviewedAt = new Date().toISOString();
        writeDB(products);
        console.log(`[审核] ID ${id} → ${status}`);
        
        // 发放积分: +50 WHC points for submission approval
        if (status === "approved" && !wasApproved && products[idx].contributor) {
          addPoints(products[idx].contributor, products[idx].wallet, 50);
        }
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

  // ── 天才发射台提交（下单 → 自动发布到社区）───────────
  if (req.method === 'POST' && url === '/api/launch/submit') {
    try {
      const data = await parseBody(req);
      // 保存订单
      const orderFile = path.join(__dirname, 'data', 'orders.json');
      let orders = fs.existsSync(orderFile) ? JSON.parse(fs.readFileSync(orderFile, 'utf8')) : [];
      const order = { ...data, id: Date.now(), receivedAt: new Date().toISOString() };
      orders.unshift(order);
      fs.writeFileSync(orderFile, JSON.stringify(orders, null, 2), 'utf8');
      console.log(`⚡ [天才发射台] 新订单: ${data.plan} | ${data.contact}`);
      sendToTelegram(order);

      // 自动发布产品到社区（状态 pending，待审核）
      if (data.product) {
        const products = readDB();
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
          featured: false,
          status: 'pending',
          source: 'genius_plan',
          receivedAt: new Date().toISOString()
        };
        products.unshift(autoEntry);
        writeDB(products);
        console.log(`🌾 [自动投稿] ${autoEntry.name} 已提交社区审核`);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
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
