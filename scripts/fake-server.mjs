// Helyi teszt-szerver a Firestore helyett: csak létrehozást enged (mint a valódi szabályok), időbélyeggel rendez.
import http from 'node:http';
const db = new Map(); let ts = 0;
const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }); res.end(JSON.stringify(body)); };
const put = (path, data) => { if (db.has(path)) return false; db.set(path, { ...data, ...(data.t === '__ts__' ? { t: ++ts } : {}), ...(data.at === '__ts__' ? { at: ++ts } : {}) }); return true; };
http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 200, {});
  const u = new URL(req.url, 'http://x');
  let body = ''; for await (const c of req) body += c;
  if (u.pathname === '/set') { const b = JSON.parse(body); return json(res, put(b.path, b.data) ? 200 : 403, {}); }
  if (u.pathname === '/batch') { const ops = JSON.parse(body); if (ops.some((o) => db.has(o.path))) return json(res, 403, {}); ops.forEach((o) => put(o.path, o.data)); return json(res, 200, {}); }
  if (u.pathname === '/get') return json(res, 200, db.get(u.searchParams.get('path')) ?? null);
  if (u.pathname === '/list') {
    const p = u.searchParams.get('path') + '/';
    const rows = [...db].filter(([k]) => k.startsWith(p) && !k.slice(p.length).includes('/')).map(([k, v]) => ({ id: k.slice(p.length), data: v })).sort((a, b) => a.data.t - b.data.t);
    return json(res, 200, rows);
  }
  if (u.pathname === '/dump') return json(res, 200, [...db.keys()]);
  json(res, 404, {});
}).listen(8787, () => console.log('fake firestore on 8787'));
