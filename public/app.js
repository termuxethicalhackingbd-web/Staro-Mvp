// public/app.js
const userId = document.getElementById('userid').innerText || 'u1';
async function reload() {
  const r = await fetch('/api/user/' + userId);
  const data = await r.json();
  const u = data.user;
  document.getElementById('username').innerText = u.username;
  document.getElementById('stars').innerText = u.stars_balance;
  document.getElementById('tokens').innerText = u.token_balance;
  document.getElementById('boost').innerText = 'x' + (u.boost_mult || 1);
  document.getElementById('spins').innerText = u.spins_count;
  const lb = data.leaderboards;
  let html = '<b>Top Spinners</b><br>';
  html += lb.spins.map(s=>`${s.username} — ${s.spins_count}`).join('<br>');
  html += '<br><br><b>Top Miners</b><br>' + lb.miners.map(m=>`${m.username} — ${m.token_balance}`).join('<br>');
  html += '<br><br><b>Top Collectors</b><br>' + lb.nfts.map(n=>`${n.username} — ${n.nfts} NFTs (~${n.totalValueStars}⭐)`).join('<br>');
  document.getElementById('leaderboards').innerHTML = html;
}
reload();

document.getElementById('freeSpin').onclick = async ()=>{
  const res = await fetch('/api/spin',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({userId, type:'free'})});
  const j = await res.json();
  document.getElementById('result').innerText = JSON.stringify(j);
  await reload();
};
document.getElementById('paidSpin').onclick = async ()=>{
  const res = await fetch('/api/spin',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({userId, type:'paid'})});
  const j = await res.json();
  document.getElementById('result').innerText = JSON.stringify(j);
  await reload();
};
document.getElementById('buyBoost').onclick = async ()=>{
  const body = { userId, box:'elite', paid:true };
  const res = await fetch('/api/buyboost',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const j = await res.json();
  document.getElementById('result').innerText = JSON.stringify(j);
  await reload();
};
