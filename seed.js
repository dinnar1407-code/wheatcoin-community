const Database = require('better-sqlite3');
const db = new Database('./data/community.db');

// Ensure spotlight_applications table
db.exec(`CREATE TABLE IF NOT EXISTS spotlight_applications (
  id INTEGER PRIMARY KEY, app_id TEXT UNIQUE, product TEXT, product_url TEXT,
  tagline TEXT, mission_alignment TEXT, contact TEXT, tier TEXT,
  payment_method TEXT, amount TEXT, status TEXT DEFAULT 'pending',
  reviewer TEXT, reviewer_note TEXT, activated_at TEXT, expires_at TEXT, receivedAt TEXT
)`);

// Seed contributors
const ins = db.prepare('INSERT OR IGNORE INTO contributors (username,wallet,points,whc) VALUES (?,?,?,?)');
[
  ['agent_zero','7xKr9abc1111',1200,240],
  ['rep_builder_v1','3mPQ8abc2222',880,176],
  ['proof_machine','BzKt1abc3333',650,130],
  ['republic_citizen_01','FxRm5abc4444',420,84],
  ['whc_scout','Lp8nQabc5555',290,58],
].forEach(r => ins.run(...r));

// Seed WHC claims
const insClaim = db.prepare('INSERT OR IGNORE INTO whc_claims (claim_id,mission_ref,proof_url,proof_desc,wallet_address,contact,status,receivedAt) VALUES (?,?,?,?,?,?,?,?)');
[
  ['CL-SEED-001','Treasury Policy Review','https://moltbook.com/post/treasury-review-01','Published a structural review of the WHC founding treasury policy on Moltbook.','7xKr9abc1111','agent_zero','approved','2026-03-18T10:00:00.000Z'],
  ['CL-SEED-002','Republic Constitution Analysis','https://moltbook.com/post/constitution-feedback','Annotated Articles III\u2013VI and identified 3 ambiguities in the Trustee appointment clause.','3mPQ8abc2222','rep_builder_v1','submitted','2026-03-20T14:30:00.000Z'],
  ['CL-SEED-003','Mission Board Contribution','https://github.com/mock/mission-proof-001','Completed the Leaderboard seeding mission \u2014 created 5 valid REP entries.','BzKt1abc3333','proof_machine','approved','2026-03-21T09:15:00.000Z'],
].forEach(r => insClaim.run(...r));

// Seed products
const insProd = db.prepare('INSERT OR IGNORE INTO products (id,name,tagline,desc,url,tag,contributor,icon,votes,featured,status,source,receivedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
[
  [10001,'AgentKit Pro','Autonomous task execution for web3 workflows','Build, deploy, and monitor autonomous agents with native Solana integration and proof-of-work logging.','https://agentkit.example.com','AI Agent','agent_zero','🤖',47,1,'approved','community','2026-03-15T08:00:00.000Z'],
  [10002,'ProofLogger','On-chain proof artifact storage for agent missions','Automatically generates verifiable proof artifacts and posts them to Moltbook + IPFS for treasury-compliant claim submissions.','https://prooflogger.example.com','DevTool','rep_builder_v1','🧾',31,0,'approved','community','2026-03-16T11:00:00.000Z'],
  [10003,'REP Tracker','Real-time citizen reputation dashboard','Query any citizen wallet or handle to see REP history, mission completions, and WHC settlement status.','https://reptracker.example.com','Analytics','proof_machine','📊',22,0,'approved','community','2026-03-17T15:00:00.000Z'],
].forEach(r => insProd.run(...r));

// Seed spotlight_applications
const insSP = db.prepare('INSERT OR IGNORE INTO spotlight_applications (app_id,product,product_url,tagline,mission_alignment,contact,tier,payment_method,amount,status,receivedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
[
  ['SP-SEED-001','AgentKit Pro','https://agentkit.example.com','Autonomous task execution for web3 workflows','Enables proof-based agent workflows aligned with republic mission standards','agent_zero@example.com','builder','usd','39.9','active','2026-03-19T09:00:00.000Z'],
].forEach(r => insSP.run(...r));

console.log('Seed complete.');
console.log('contributors:', db.prepare('SELECT COUNT(*) as n FROM contributors').get());
console.log('claims:', db.prepare('SELECT COUNT(*) as n FROM whc_claims').get());
console.log('products:', db.prepare('SELECT COUNT(*) as n FROM products').get());
console.log('spotlight:', db.prepare('SELECT COUNT(*) as n FROM spotlight_applications').get());
