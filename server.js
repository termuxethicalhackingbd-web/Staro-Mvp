// server.js
// Node 16+
// Run: npm install && node server.js
const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const cors = require('cors');
const db = require('./db');

const app = express();
app.use(bodyParser.json());
app.use(cors());
app.use(express.static('public'));

// --- Boost adjustment table (Paid spin)
const BOOST_TABLE = {
  1: { common:85.00, medium:10.00, high:2.00, star:3.00 },
  2: { common:82.50, medium:12.00, high:2.50, star:3.00 },
  5: { common:78.00, medium:14.50, high:4.50, star:3.00 },
  10:{ common:72.00, medium:17.00, high:8.00, star:3.00 },
  50:{ common:50.00, medium:25.00, high:22.00, star:3.00 }
};

// Free spin distribution (no NFT in final config if you prefer; adjust below)
const FREE_TABLE = {
  star:50.0, token:34.99, common:10.0, nothing:5.01 // sums ~100
};

// helper: secure random float [0,100)
function rand100() {
  const v = crypto.randomInt(0, 1000000) / 10000.0;
  return v;
}

// --- API: get user info
app.get('/api/user/:id', async (req, res) => {
  const user = await db.getUser(req.params.id);
  if (!user) return res.status(404).json({ error: 'user not found' });
  const leaderboards = {
    spins: await db.getTopSpinners(),
    miners: await db.getTopMiners(),
    nfts: await db.getTopCollectors()
  };
  res.json({ user, leaderboards });
});

// --- API: mock deposit (simulate TON deposit -> credit Stars)
// In production: replace with real blockchain verification
app.post('/api/deposit', async (req, res) => {
  const { userId, amountTon } = req.body;
  if (!userId || !amountTon) return res.status(400).json({ error:'invalid' });
  const starsPerTon = 125; // configurable
  const stars = Math.floor(Number(amountTon) * starsPerTon);
  await db.addStars(userId, stars);
  // referral Star commission and token bonus logic:
  const ref = await db.getReferrerOf(userId);
  if (ref) {
    const commission = Math.floor(stars * 0.20);
    await db.addStars(ref, commission);
    const alreadyRewarded = await db.checkReferralRewarded(userId);
    if (!alreadyRewarded) {
      await db.addTokens(ref, 20000);
      await db.markReferralRewarded(userId);
    }
  }
  res.json({ ok:true, creditedStars: stars });
});

// --- API: claim daily login
app.post('/api/daily', async (req, res) => {
  const { userId } = req.body;
  const r = await db.claimDaily(userId);
  if (!r.ok) return res.json({ ok:false, message: r.message });
  res.json({ ok:true, addedTokens: r.addedTokens });
});

// --- API: buy boost box (permanent) - mocked pay
app.post('/api/buyboost', async (req, res) => {
  const { userId, box, paid } = req.body;
  if (!paid) return res.status(400).json({ ok:false, message:'payment required (mock).' });
  const map = { starter:{mult:2, price:1}, pro:{mult:5, price:2}, elite:{mult:10, price:4}, ultimate:{mult:50, price:10} };
  if (!map[box]) return res.status(400).json({ ok:false });
  const mult = map[box].mult;
  await db.setBoost(userId, mult);
  res.json({ ok:true, boost:mult });
});

// --- API: spin (core)
app.post('/api/spin', async (req, res) => {
  const { userId, type } = req.body;
  const user = await db.getUser(userId);
  if (!user) return res.status(404).json({ error:'user not found' });

  if (type === 'free') {
    const allowed = await db.canClaimFreeSpin(userId);
    if (!allowed) return res.json({ ok:false, message:'free spin already used today' });
  } else if (type === 'paid') {
    if (user.stars_balance < 200) return res.json({ ok:false, message:'not enough stars' });
    await db.decrementStars(userId, 200);
  } else return res.status(400).json({ error:'invalid spin type' });

  const boost = user.boost_mult || 1;
  let outcome = null;
  let awarded = { stars:0, tokens:0, nft:null };

  if (type === 'free') {
    const r = rand100();
    if (r < FREE_TABLE.star) {
      const s = 20 + crypto.randomInt(0,31); // 20-50
      awarded.stars = s;
      await db.addStars(userId, s);
      outcome = `Free Star +${s}`;
    } else if (r < FREE_TABLE.star + FREE_TABLE.token) {
      const t = 10000 + crypto.randomInt(0,90001); // 10k-100k
      awarded.tokens = t;
      await db.addTokens(userId, t);
      outcome = `Free Token +${t}`;
    } else if (r < FREE_TABLE.star + FREE_TABLE.token + FREE_TABLE.common) {
      // if you want NO NFT on free, comment out next block
      const nft = await db.assignRandomCommonNFT(userId);
      if (nft) { awarded.nft = nft; outcome = `Free Common NFT ${nft.name}`; }
      else { outcome = 'Free: no prize'; }
    } else {
      outcome = 'Free: Nothing';
    }
    await db.markFreeSpinUsed(userId);
  } else { // paid spin
    const dist = BOOST_TABLE[boost] || BOOST_TABLE[1];
    const r = rand100();
    const cCommon = dist.common;
    const cMedium = dist.medium;
    const cHigh = dist.high;
    if (r < cCommon) {
      const nft = await db.assignRandomNFTOfTier(userId, 'common');
      if (nft) { awarded.nft = nft; outcome = `Common NFT ${nft.name}`; }
      else { outcome='Common: fallback stars'; const s = 50 + crypto.randomInt(0,451); awarded.stars=s; await db.addStars(userId,s); }
    } else if (r < cCommon + cMedium) {
      const nft = await db.assignRandomNFTOfTier(userId, 'rare');
      if (nft) { awarded.nft = nft; outcome = `Rare NFT ${nft.name}`; }
      else { outcome='Rare: fallback tokens'; const t = 200000 + crypto.randomInt(0,300001); awarded.tokens=t; await db.addTokens(userId,t); }
    } else if (r < cCommon + cMedium + cHigh) {
      const nft = await db.assignRandomNFTOfTier(userId, 'legendary');
      if (nft) { awarded.nft = nft; outcome = `Legendary NFT ${nft.name}`; }
      else { outcome='High: fallback tokens'; const t = 1000000 + crypto.randomInt(0,2000001); awarded.tokens=t; await db.addTokens(userId,t); }
    } else {
      const s = 50 + crypto.randomInt(0,951); // 50-1000
      awarded.stars=s;
      await db.addStars(userId,s);
      outcome = `Star +${s}`;
    }
    await db.addSpinCount(userId);
  }

  await db.insertSpinHistory(userId, type, outcome, awarded);
  res.json({ ok:true, outcome, awarded });
});

// --- API: leaderboards
app.get('/api/leaderboards', async (req, res) => {
  const spins = await db.getTopSpinners();
  const miners = await db.getTopMiners();
  const nfts = await db.getTopCollectors();
  res.json({ spins, miners, nfts });
});

const PORT = process.env.PORT || 3030;
db.init().then(()=>{
  app.listen(PORT, ()=> console.log('Server running on', PORT));
});
