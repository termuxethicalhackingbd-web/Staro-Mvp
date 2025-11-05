// db.js
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

let db;
module.exports = {
  init: async () => {
    db = await open({ filename: path.join(__dirname,'staro.db'), driver: sqlite3.Database });
    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT,
        stars_balance INTEGER DEFAULT 0,
        token_balance INTEGER DEFAULT 0,
        spins_count INTEGER DEFAULT 0,
        boost_mult INTEGER DEFAULT 1,
        last_free_date TEXT,
        referrer TEXT,
        referral_rewarded INTEGER DEFAULT 0,
        last_claim_date TEXT
      );
      CREATE TABLE IF NOT EXISTS nfts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        tier TEXT,
        owner TEXT
      );
      CREATE TABLE IF NOT EXISTS spin_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        type TEXT,
        outcome TEXT,
        awarded TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const existing = await db.get("SELECT id FROM users LIMIT 1");
    if (!existing) {
      const seedUsers = [
        ['u1','DarkKnight',10000,12450000,278,50,null,0,null],
        ['u2','GhostPepe',8000,8320000,244,25,null,0,null],
        ['u3','MatrixKing',6500,4980000,210,10,null,0,null],
        ['u4','LunaPepe',5200,2640000,188,5,null,0,null]
      ];
      const stmt = await db.prepare('INSERT INTO users(id,username,stars_balance,token_balance,spins_count,boost_mult,last_free_date,referral_rewarded,referrer) VALUES (?,?,?,?,?,?,?,?,?)');
      for (const r of seedUsers) await stmt.run(...r);
      await stmt.finalize();
      const nstmt = await db.prepare('INSERT INTO nfts(name,tier,owner) VALUES (?,?,?)');
      await nstmt.run('Dark Knight Pepe #777','legendary','u1');
      await nstmt.run('Matrix Pepe #900','rare','u2');
      await nstmt.run('Mini Pepe #95','common','u3');
      await nstmt.finalize();
    }
  },

  getUser: async (id) => {
    return db.get('SELECT * FROM users WHERE id = ?', id);
  },
  addStars: async (id, amount) => {
    await db.run('UPDATE users SET stars_balance = stars_balance + ? WHERE id = ?', amount, id);
  },
  addTokens: async (id, amount) => {
    await db.run('UPDATE users SET token_balance = token_balance + ? WHERE id = ?', amount, id);
  },
  setBoost: async (id, mult) => {
    await db.run('UPDATE users SET boost_mult = ? WHERE id = ?', mult, id);
  },
  canClaimFreeSpin: async (id) => {
    const u = await db.get('SELECT last_free_date FROM users WHERE id = ?', id);
    const last = u?.last_free_date;
    const today = (new Date()).toISOString().slice(0,10);
    return last !== today;
  },
  markFreeSpinUsed: async (id) => {
    const today = (new Date()).toISOString().slice(0,10);
    await db.run('UPDATE users SET last_free_date = ? WHERE id = ?', today, id);
  },
  decrementStars: async (id, amt) => {
    await db.run('UPDATE users SET stars_balance = stars_balance - ? WHERE id = ?', amt, id);
  },
  addSpinCount: async (id) => {
    await db.run('UPDATE users SET spins_count = spins_count + 1 WHERE id = ?', id);
  },
  insertSpinHistory: async (userId, type, outcome, awarded) => {
    await db.run('INSERT INTO spin_history(user_id,type,outcome,awarded) VALUES (?,?,?,?)', userId, type, outcome, JSON.stringify(awarded));
  },
  assignRandomNFTOfTier: async (userId, tier) => {
    const name = `${tier.toUpperCase()} Pepe #${Math.floor(Math.random()*10000)}`;
    const r = await db.run('INSERT INTO nfts(name,tier,owner) VALUES (?,?,?)', name, tier, userId);
    return { id: r.lastID, name, tier };
  },
  assignRandomCommonNFT: async (userId) => {
    return module.exports.assignRandomNFTOfTier(userId, 'common');
  },
  getTopSpinners: async () => {
    return db.all('SELECT username,spins_count FROM users ORDER BY spins_count DESC LIMIT 10');
  },
  getTopMiners: async () => {
    return db.all('SELECT username,token_balance FROM users ORDER BY token_balance DESC LIMIT 10');
  },
  getTopCollectors: async () => {
    const rows = await db.all('SELECT owner, COUNT(*) as cnt FROM nfts GROUP BY owner ORDER BY cnt DESC LIMIT 10');
    const res = [];
    for (const r of rows) {
      const u = await db.get('SELECT username FROM users WHERE id = ?', r.owner);
      res.push({ username: u?.username || r.owner, nfts: r.cnt, totalValueStars: r.cnt * 2500 });
    }
    return res;
  },

  // referral
  getReferrerOf: async (userId) => {
    const row = await db.get('SELECT referrer FROM users WHERE id = ?', userId);
    return row?.referrer || null;
  },
  checkReferralRewarded: async (userId) => {
    const row = await db.get('SELECT referral_rewarded FROM users WHERE id = ?', userId);
    return row?.referral_rewarded === 1;
  },
  markReferralRewarded: async (userId) => {
    await db.run('UPDATE users SET referral_rewarded = 1 WHERE id = ?', userId);
  },

  // daily claim
  claimDaily: async (userId) => {
    const u = await db.get('SELECT last_claim_date FROM users WHERE id = ?', userId).catch(()=>null);
    const today = (new Date()).toISOString().slice(0,10);
    if (!u || u.last_claim_date !== today) {
      await db.run('UPDATE users SET token_balance = token_balance + ? WHERE id = ?', 1000, userId);
      await db.run('UPDATE users SET last_claim_date = ? WHERE id = ?', today, userId);
      return { ok:true, addedTokens:1000 };
    } else return { ok:false, message:'already claimed today' };
  }
};
