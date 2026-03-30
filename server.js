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

`);

// Run migration if column is missing
try {
  db.prepare("SELECT topic_id FROM agora_comments LIMIT 1").get();
} catch (e) {
  if (e.message.includes("no such column")) {
    db.prepare("ALTER TABLE agora_comments ADD COLUMN topic_id INTEGER DEFAULT 1").run();
    console.log("Migration: Added topic_id column to agora_comments");
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS demands (
    id INTEGER PRIMARY KEY,
    title TEXT,
    role TEXT,
    region TEXT DEFAULT 'US/CA/MX',
    project_type TEXT,
    location TEXT,
    budget TEXT,
    description TEXT,
    contact TEXT,
    status TEXT DEFAULT 'open',
    receivedAt TEXT
  );
`);

try { db.exec("ALTER TABLE demands ADD COLUMN project_type TEXT"); } catch(e){}
try { db.exec("ALTER TABLE demands ADD COLUMN location TEXT"); } catch(e){}

db.exec(`
  CREATE TABLE IF NOT EXISTS talents (
    id INTEGER PRIMARY KEY,
    name TEXT,
    skills TEXT,
    region TEXT DEFAULT 'US/CA/MX',
    rate TEXT,
    pricing_model TEXT DEFAULT 'hourly', -- 'hourly' or 'fixed'
    level TEXT DEFAULT 'Junior', -- 'Junior', 'Mid', 'Senior', 'Expert'
    verified_score INTEGER DEFAULT 0,
    bio TEXT,
    contact TEXT,
    status TEXT DEFAULT 'available',
    receivedAt TEXT
  );
`);

try { db.exec("ALTER TABLE talents ADD COLUMN pricing_model TEXT DEFAULT 'hourly'"); } catch(e){}
try { db.exec("ALTER TABLE talents ADD COLUMN level TEXT DEFAULT 'Junior'"); } catch(e){}
try { db.exec("ALTER TABLE talents ADD COLUMN verified_score INTEGER DEFAULT 0"); } catch(e){}

db.exec(`
  CREATE TABLE IF NOT EXISTS bot_conversations (
    id INTEGER PRIMARY KEY,
    session_id TEXT,
    user_role TEXT, -- 'employer' or 'engineer'
    contact TEXT,
    message TEXT,
    reply TEXT,
    timestamp TEXT
  );

  CREATE TABLE IF NOT EXISTS user_accounts (
    id INTEGER PRIMARY KEY,
    email TEXT UNIQUE,
    password_hash TEXT,
    role TEXT, -- 'employer' or 'engineer'
    name TEXT,
    company TEXT,
    wallet_address TEXT,
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS project_milestones (
    id INTEGER PRIMARY KEY,
    demand_id INTEGER,
    phase_name TEXT, -- e.g. Site Survey, Cabinet Wiring, PLC Logic, Trial Run
    percentage REAL, -- 10, 30, 40, 20
    amount REAL,
    status TEXT DEFAULT 'locked', -- locked, funded, completed, released
    deliverables_req TEXT,
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS financial_ledgers (
    id INTEGER PRIMARY KEY,
    demand_id INTEGER,
    employer_email TEXT,
    engineer_email TEXT,
    hours_worked REAL DEFAULT 0.0,
    hourly_rate REAL DEFAULT 0.0,
    total_amount REAL DEFAULT 0.0,
    currency TEXT DEFAULT 'USD',
    status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'paid', 'invoiced'
    invoice_url TEXT,
    updated_at TEXT
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
        let txHash = data.txHash?.trim();
        const plan = data.plan;
        const requiredAmount = data.amount;
        
        if (!txHash) throw new Error("Transaction Hash is required.");
        
        // If user pasted a Solscan/Solana Explorer URL, extract the hash
        const urlMatch = txHash.match(/tx\/([1-9A-HJ-NP-Za-km-z]{80,90})/);
        if (urlMatch) {
            txHash = urlMatch[1];
        }

        // Basic sanity check for Solana transaction signatures
        if (txHash.length < 80 || txHash.length > 90) {
           throw new Error("Invalid Solana transaction hash format. Did you copy the full signature?");
        }

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

        // 3. Real Solana RPC Call for On-Chain Verification
        const TREASURY_ADDRESS = '6HMEBSh2KZVsHM4CNDnSJPE43tSxGfeBxhCp7LheZZK';
        const WHC_TOKEN_MINT = '4sehcoU2vrr11HPEGpEmWMvDL1ddwveDpvAVY5d8pump';
        
        const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
        
        const rpcRes = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getTransaction',
                params: [txHash, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]
            })
        });
        const rpcData = await rpcRes.json();
        
        if (!rpcData.result) {
            throw new Error(`Transaction not found on Solana. It might still be confirming or the hash is invalid. RPC Response: ${JSON.stringify(rpcData)}`);
        }
        if (rpcData.result.meta?.err) {
            throw new Error("Transaction failed on-chain.");
        }

        const meta = rpcData.result.meta;
        let preBal = 0, postBal = 0;
        
        const preToken = meta.preTokenBalances.find(b => b.owner === TREASURY_ADDRESS && b.mint === WHC_TOKEN_MINT);
        if (preToken) preBal = parseFloat(preToken.uiTokenAmount.uiAmountString);
        
        const postToken = meta.postTokenBalances.find(b => b.owner === TREASURY_ADDRESS && b.mint === WHC_TOKEN_MINT);
        if (postToken) postBal = parseFloat(postToken.uiTokenAmount.uiAmountString);
        
        const actualAmountReceived = postBal - preBal;
        
        if (actualAmountReceived < requiredAmount * 0.99) { // 1% slippage/rounding tolerance
           throw new Error(`Insufficient payment detected. Expected ${requiredAmount} WHC, but Treasury received ${actualAmountReceived.toFixed(2)} WHC. Double check the transaction details.`);
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

  // ── Talent Demand API ───────────────────────────────────────
  if (req.method === 'GET' && url === '/api/talent/demands') {
    try {
      const rows = db.prepare("SELECT * FROM demands ORDER BY receivedAt DESC LIMIT 50").all();
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({ status: 'ok', data: rows }));
    } catch (err) {
      res.writeHead(500); res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // ── Financial Ledger API ───────────────────────────────────────
  if (req.method === 'GET' && url.startsWith('/api/finance/milestones')) {
    const qs = new URLSearchParams(req.url.split('?')[1] || '');
    const demand_id = qs.get('demand_id');
    try {
      const rows = db.prepare("SELECT * FROM project_milestones WHERE demand_id = ? ORDER BY id ASC").all(demand_id);
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({ status: 'ok', data: rows }));
    } catch (err) {
      res.writeHead(500); res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (req.method === 'GET' && url.startsWith('/api/finance/ledger')) {
    const qs = new URLSearchParams(req.url.split('?')[1] || '');
    const email = (qs.get('email') || '').trim();
    if (!email) {
      res.writeHead(400); res.end(JSON.stringify({ error: 'email required' })); return;
    }
    try {
      const rows = db.prepare("SELECT * FROM financial_ledgers WHERE employer_email = ? OR engineer_email = ? ORDER BY updated_at DESC").all(email, email);
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({ status: 'ok', data: rows }));
    } catch (err) {
      res.writeHead(500); res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (req.method === 'POST' && url === '/api/talent/submit') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (!data.title || !data.role || !data.contact) throw new Error("Missing required fields");
        
        const stmt = db.prepare("INSERT INTO demands (title, role, region, project_type, location, budget, description, contact, receivedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
        const info = stmt.run(
          escapeHtml(data.title),
          escapeHtml(data.role),
          escapeHtml(data.region || 'US/CA/MX'),
          escapeHtml(data.project_type || 'General'),
          escapeHtml(data.location || ''),
          escapeHtml(data.budget),
          escapeHtml(data.description),
          escapeHtml(data.contact),
          new Date().toISOString()
        );
        
        const demandId = info.lastInsertRowid;
        
        // 自动初始化标准化里程碑 (Milestone Escrow)
        const budgetAmount = parseFloat((data.budget || '0').replace(/[^0-9.]/g, '')) || 1000;
        const milestones = [
            { phase: "Site Survey / Design Review", pct: 0.10 },
            { phase: "Cabinet Wiring & Basic IO", pct: 0.30 },
            { phase: "PLC Logic & Dry Run", pct: 0.40 },
            { phase: "Trial Run & Handoff", pct: 0.20 }
        ];
        const mStmt = db.prepare("INSERT INTO project_milestones (demand_id, phase_name, percentage, amount, status) VALUES (?, ?, ?, ?, 'locked')");
        for (let m of milestones) {
             mStmt.run(demandId, m.phase, m.pct, budgetAmount * m.pct);
        }

        sendToTelegramMessage('👔 New Talent Demand', { Title: data.title, Region: data.region, Contact: data.contact, Escrow: "Milestones Initialized" });
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ status: 'ok', id: demandId }));
      } catch (err) {
        res.writeHead(500); res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // ── Auth MVP (Stub) ───────────────────────────────────────
  if (req.method === 'POST' && url === '/api/auth/register') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (!data.email || !data.role) throw new Error("Missing email or role");
        
        const stmt = db.prepare("INSERT OR IGNORE INTO user_accounts (email, role, name, created_at) VALUES (?, ?, ?, ?)");
        stmt.run(data.email, data.role, data.name || '', new Date().toISOString());
        
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ status: 'ok', email: data.email, role: data.role }));
      } catch (err) {
        res.writeHead(500); res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // ── AI Sales & Support Agent API ───────────────────────────────────────
  if (req.method === 'POST' && url === '/api/agent/chat') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { session_id, role, message, contact } = data;
        
        // 1. Log incoming
        db.prepare("INSERT INTO bot_conversations (session_id, user_role, contact, message, timestamp) VALUES (?, ?, ?, ?, ?)").run(
            session_id || 'anonymous', role || 'unknown', contact || '', escapeHtml(message), new Date().toISOString()
        );

        // 2. We use a simulated AI response for the frontend logic. 
        // In reality, this would hit Gemini API directly.
        let reply = '';
        if (role === 'employer') {
            reply = "您好！我是 Wheat Agent Nexus。针对设备出海北美的售后安装与调试，我们平台拥有近 1000+ 经过认证的当地资深独立工程师 (覆盖美国和墨西哥蒙特雷等地)。我们可以为您提供全周期的项目拆解、人才匹配、时薪结算以及资金托管。为了给您精准匹配，请问您的设备主要是哪一类（如包装线、焊接机器人等）？以及预计需要在北美哪个城市作业？";
        } else {
            reply = "Hello! I am the Agent Nexus Onboarding Assistant. We have dozens of high-paying commissioning, PLC programming, and repair projects coming directly from top Chinese automation equipment suppliers every week across the US, Canada, and Mexico. Our platform ensures you get paid on time via strict milestone escrows. What are your primary technical skills (e.g. Allen Bradley, SCADA, Fanuc)?";
        }
        
        // 3. Log reply
        db.prepare("UPDATE bot_conversations SET reply = ? WHERE id = (SELECT id FROM bot_conversations WHERE session_id = ? ORDER BY id DESC LIMIT 1)").run(reply, session_id);

        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ status: 'ok', reply }));
      } catch (err) {
        res.writeHead(500); res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }



  if (req.method === 'GET' && url === '/api/talent/list') {
    try {
      const rows = db.prepare("SELECT * FROM talents ORDER BY receivedAt DESC LIMIT 50").all();
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({ status: 'ok', data: rows }));
    } catch (err) {
      res.writeHead(500); res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  
  // ── AI Technical Screener API ───────────────────────────────────────
  if (req.method === 'POST' && url === '/api/talent/screen_question') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("GEMINI_API_KEY not configured");
        
        const prompt = `You are a strict technical interviewer for Industrial Automation.
The candidate claims the following skills: ${data.skills}
Their claimed level is: ${data.level}

Generate exactly ONE practical, highly-technical scenario question to test their knowledge.
Do NOT output any greeting or introductory text. Just the question.
Example: "If a Siemens S7-1500 shows a BF red light when connected to a G120C via Profinet, what are your first 3 troubleshooting steps?"`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.7, maxOutputTokens: 200 }
            })
        });
        const resData = await response.json();
        const question = resData.candidates?.[0]?.content?.parts?.[0]?.text || "Describe a complex automation project you successfully delivered.";
        
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ status: 'ok', question: question.trim() }));
      } catch (err) {
        res.writeHead(500); res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (req.method === 'POST' && url === '/api/talent/screen_verify') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("GEMINI_API_KEY not configured");
        
        const prompt = `You are grading a technical interview for an Industrial Automation Engineer.
Question asked: ${data.question}
Candidate's Answer: ${data.answer}

Evaluate the answer. Does it show genuine field experience and technical competence?
Output a JSON response exactly in this format (no markdown blocks, just raw JSON):
{"passed": true/false, "score": <0-100>, "feedback": "<one short sentence of feedback>"}
`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.2, maxOutputTokens: 150 }
            })
        });
        const resData = await response.json();
        let resultText = resData.candidates?.[0]?.content?.parts?.[0]?.text || '{"passed": true, "score": 85, "feedback": "Acceptable answer."}';
        
        // Clean up markdown if model outputs it
        resultText = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
        const result = JSON.parse(resultText);
        
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500); res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (req.method === 'POST' && url === '/api/talent/submit_profile') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (!data.name || !data.skills || !data.contact) throw new Error("Missing required fields");
        
        const stmt = db.prepare("INSERT INTO talents (name, skills, region, rate, pricing_model, level, verified_score, bio, contact, receivedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        const info = stmt.run(
          escapeHtml(data.name),
          escapeHtml(data.skills),
          escapeHtml(data.region || 'US/CA/MX'),
          escapeHtml(data.rate),
          escapeHtml(data.pricing_model || 'hourly'),
          escapeHtml(data.level || 'Mid'),
          parseInt(data.verified_score) || 0,
          escapeHtml(data.bio),
          escapeHtml(data.contact),
          new Date().toISOString()
        );
        sendToTelegramMessage('🛠️ New Engineer Profile', { Name: data.name, Region: data.region, Contact: data.contact });
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ status: 'ok', id: info.lastInsertRowid }));
      } catch (err) {
        res.writeHead(500); res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // ── Nexus Open Missions API ───────────────────────────────────────
  if (req.method === 'GET' && url === '/api/nexus/open-missions') {
    try {
      // Fetch paid orders as open bounties for Agents to process
      const rows = db.prepare("SELECT id, product, audience, plan, price, receivedAt, status FROM orders WHERE status = 'paid' ORDER BY id DESC LIMIT 50").all();
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({ status: 'ok', data: rows }));
    } catch (err) {
      res.writeHead(500); res.end(JSON.stringify({ error: err.message }));
    }
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
  if (req.method === 'GET' && (url === '/track' || url === '/track.html')) { serveFile(res, path.join(__dirname, 'track.html'), 'text/html'); return; }
  if (req.method === 'GET' && (url === '/market' || url === '/market.html')) { serveFile(res, path.join(__dirname, 'market.html'), 'text/html'); return; }
  if (req.method === 'GET' && (url === '/kits' || url === '/kits.html')) { serveFile(res, path.join(__dirname, 'kits.html'), 'text/html'); return; }
  if (req.method === 'GET' && (url === '/kits/delivery' || url === '/kits-delivery.html')) { serveFile(res, path.join(__dirname, 'kits-delivery.html'), 'text/html'); return; }
  if (req.method === 'GET' && (url === '/about' || url === '/about.html')) { serveFile(res, path.join(__dirname, 'about.html'), 'text/html'); return; }
  if (req.method === 'GET' && (url === '/contact' || url === '/contact.html')) { serveFile(res, path.join(__dirname, 'contact.html'), 'text/html'); return; }
  if (req.method === 'GET' && (url === '/claim-whc' || url === '/claim-whc.html')) { serveFile(res, path.join(__dirname, 'claim-whc.html'), 'text/html'); return; }
  if (req.method === 'GET' && (url === '/whc-policy' || url === '/whc-policy.html')) { serveFile(res, path.join(__dirname, 'whc-policy.html'), 'text/html'); return; }
  if (req.method === 'GET' && (url === '/agora' || url === '/agora.html')) { serveFile(res, path.join(__dirname, 'agora.html'), 'text/html'); return; }
  if (req.method === 'GET' && (url === '/humans' || url === '/humans.html')) { serveFile(res, path.join(__dirname, 'humans.html'), 'text/html'); return; }
  if (req.method === 'GET' && (url === '/missions' || url === '/missions.html')) { serveFile(res, path.join(__dirname, 'missions.html'), 'text/html'); return; }
  if (req.method === 'GET' && (url === '/talent' || url === '/talent.html')) { serveFile(res, path.join(__dirname, 'talent.html'), 'text/html'); return; }
  if (req.method === 'GET' && (url === '/finance' || url === '/finance.html')) { serveFile(res, path.join(__dirname, 'finance.html'), 'text/html'); return; }
  if (req.method === 'GET' && (url === '/agent' || url === '/agent.html')) { serveFile(res, path.join(__dirname, 'agent_chat.html'), 'text/html'); return; }
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

  if (req.method === 'POST' && url === '/api/create-checkout-session') {
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
      
      const planName = data.plan ? data.plan.toUpperCase() : 'LAUNCH';
      const priceUSD = parseFloat(data.price) || 39.9;
      const unitAmountCents = Math.round(priceUSD * 100);
      
      const entry = {
        product: data.product || '',
        audience: data.audience || '',
        contact: data.contact || '',
        plan: data.plan || 'launch',
        price: data.price + ' USD',
        paymentMethod: 'usd',
        receivedAt: new Date().toISOString(),
        status: 'pending'
      };
      
      const result = db.prepare(`INSERT INTO orders (product, audience, contact, plan, price, paymentMethod, receivedAt, status, stripe_session_id)
        VALUES (@product, @audience, @contact, @plan, @price, @paymentMethod, @receivedAt, @status, @stripe_session_id)`).run({
          ...entry,
          stripe_session_id: 'pending'
      });
      const dbOrderId = result.lastInsertRowid;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: { name: `Builder Growth Layer - ${planName} Plan` },
            unit_amount: unitAmountCents,
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: `${domain}/launch?success=true&order_id=${dbOrderId}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${domain}/launch?canceled=true`,
        client_reference_id: dbOrderId.toString(),
      });
      
      db.prepare("UPDATE orders SET stripe_session_id = ? WHERE id = ?").run(session.id, dbOrderId);
      
      console.log(`💳 [Stripe Launch] Session created for ${planName}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ url: session.url }));
    } catch (err) {
      console.error(err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (req.method === 'GET' && url === '/api/launch/verify') {
    const query = new URL(req.url, `http://${req.headers.host}`).searchParams;
    const session_id = query.get('session_id');
    const order_id = query.get('order_id');
    if (!session_id) { res.writeHead(400); res.end('Missing session_id'); return; }
    try {
      const session = await stripe.checkout.sessions.retrieve(session_id);
      if (session.payment_status === 'paid') {
        const order = db.prepare("UPDATE orders SET status = 'paid' WHERE stripe_session_id = ?").run(session_id);
        if (order.changes > 0) {
          const row = db.prepare("SELECT * FROM orders WHERE stripe_session_id = ?").get(session_id);
          sendToTelegramMessage('⚡ Builder Growth Paid', {
            'ID': row ? row.id : order_id,
            'Product': row ? row.product : '—',
            'Contact': row ? row.contact : '—',
            'Price': `$${(session.amount_total / 100).toFixed(2)}`,
            'Status': 'Paid',
            'Timestamp': new Date().toISOString()
          });

          // Output an Agent Kitchen manifest for processing
          const fs = require('fs');
          const path = require('path');
          const queueDir = path.join(__dirname, '..', 'scripts', 'agent_kitchen', 'queue');
          if (fs.existsSync(queueDir)) {
              const manifest = {
                  order_id: `USD-${row ? row.id : order_id}`,
                  client_contact: row ? row.contact : '—',
                  app_name: (row && row.product) ? row.product.split(' ')[0] : 'App',
                  url: '#',
                  raw_description: row ? row.product : '—'
              };
              fs.writeFileSync(path.join(queueDir, `order_USD_${row ? row.id : order_id}.json`), JSON.stringify(manifest, null, 2));
          }
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
