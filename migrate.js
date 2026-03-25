const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const db = new Database(path.join(__dirname, 'data', 'community.db'));

// Init tables
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

console.log("Database tables initialized.");

// Migrate data
const migrateFile = (filename, table, insertStmt) => {
  const p = path.join(__dirname, 'data', filename);
  if (!fs.existsSync(p)) return;
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  const stmt = db.prepare(insertStmt);
  const insertMany = db.transaction((rows) => {
    for (const row of rows) {
      try { stmt.run(row); } catch(e) { /* ignore dupes */ }
    }
  });
  insertMany(data);
  console.log(`Migrated ${data.length} records into ${table}`);
};

migrateFile('products.json', 'products', `
  INSERT OR IGNORE INTO products (id, name, tagline, desc, url, tag, contact, contributor, wallet, icon, votes, featured, status, source, receivedAt)
  VALUES (@id, @name, @tagline, @desc, @url, @tag, @contact, @contributor, @wallet, @icon, @votes, @featured, @status, @source, @receivedAt)
`);

migrateFile('contributors.json', 'contributors', `
  INSERT OR IGNORE INTO contributors (username, wallet, points, whc)
  VALUES (@username, @wallet, @points, @whc)
`);

migrateFile('orders.json', 'orders', `
  INSERT OR IGNORE INTO orders (id, product, audience, contact, plan, price, paymentMethod, receivedAt)
  VALUES (@id, @product, @audience, @contact, @plan, @price, @paymentMethod, @receivedAt)
`);

console.log("Migration complete.");
