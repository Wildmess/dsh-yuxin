// 鱼信 feiyu-chat 服务器 v0.3 —— 聊天真回复（二期第 1 条）
// 端口 13101；鉴权：X-Token header；聊天：DSH 会话通道（POST /api/session/prompt + events 轮询）
// 移动指令：SetWindowPos 挪桌宠；数据：data\posts.json
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const PORT = 13101;
const TOKEN = fs.readFileSync(path.join(__dirname, 'token.txt'), 'utf8').trim();
const POSTS_FILE = path.join(__dirname, 'data', 'posts.json');
const PUB = path.join(__dirname, 'public');
const SESSION_FILE = path.join(__dirname, 'data', 'yuxin-session.json');
const CRED_FILE = 'C:\\Users\\15309\\.dsh\\.credentials.yaml';
const DSH_PORT = 62586;
const DSH_AUTH = `127.0.0.1:${DSH_PORT}`;
const YUXIN_CWD = 'D:\\tools\\feiyu-chat';

// ---------- DSH 会话通道 ----------
let dshCookie = null;
function b64url(buf) {
  return Buffer.from(buf).toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
function mintDshCookie() {
  const cred = fs.readFileSync(CRED_FILE, 'utf8');
  const m = cred.match(/client-connection\/browser-session:[\s\S]*?secret:\s*(\S+)/);
  if (!m) throw new Error('credentials.yaml 里没找到 browser-session secret');
  const secret = Buffer.from(m[1].replaceAll('-', '+').replaceAll('_', '/') + '=', 'base64');
  const name = 'dsh-auth-' + b64url(crypto.createHash('sha256').update(DSH_AUTH).digest());
  const now = Date.now();
  const body = b64url(Buffer.from(JSON.stringify({ version: 1, authority: DSH_AUTH, issuedAt: now, expiresAt: now + 7 * 24 * 3600 * 1000 }), 'utf8'));
  const sig = b64url(crypto.createHmac('sha256', secret).update(body).digest());
  dshCookie = `${name}=v1.${body}.${sig}`;
  return dshCookie;
}
async function dshCall(method, args, retried = false) {
  if (!dshCookie) mintDshCookie();
  const res = await fetch(`http://${DSH_AUTH}/api/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': dshCookie },
    body: JSON.stringify({ type: 'client-request', rpcId: `yuxin-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, method, payload: { args } })
  });
  if (res.status === 401 && !retried) { mintDshCookie(); return dshCall(method, args, true); }
  const j = await res.json().catch(() => null);
  if (!j || !j.result) throw new Error(`DSH ${method} 非 RPC 响应 HTTP ${res.status}`);
  if (!j.result.ok) throw new Error(`DSH ${method}: ${j.result.error && j.result.error.code} ${j.result.error && j.result.error.message}`);
  return j.result.value;
}
function readYuxinSession() {
  try { return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8')).sessionId; } catch (e) { return null; }
}
async function ensureYuxinSession() {
  let sid = readYuxinSession();
  if (sid) {
    // 校验还在列表里（会话被删/归档就重建）
    try {
      const list = await dshCall('session/list', { _request: {} });
      if (list.items.some(x => x.sessionId === sid)) return sid;
    } catch (e) { /* 列表失败不阻塞，直接试旧 id */ return sid; }
  }
  const created = await dshCall('session/create', { request: { cwd: YUXIN_CWD } });
  sid = created.sessionId;
  fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
  fs.writeFileSync(SESSION_FILE, JSON.stringify({ sessionId: sid, createdAt: new Date().toISOString() }, null, 2));
  return sid;
}
function textOfLastAssistant(records) {
  let last = null;
  for (const rec of records) {
    const e = rec.event;
    if (e.type === 'assistant/message' && e.data && e.data.message && Array.isArray(e.data.message.content)) {
      const t = e.data.message.content.filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
      if (t) last = t;
    }
  }
  return last;
}
function stickersOf(records) {
  const out = [];
  for (const rec of records) {
    const e = rec.event;
    if (e.type === 'tool/call' && e.data && e.data.name === 'sticker_send' && e.data.arguments) {
      try { const a = JSON.parse(e.data.arguments); if (a.name) out.push(a.name); } catch (x) {}
    }
  }
  return out;
}
async function askWhale(text) {
  const sid = await ensureYuxinSession();
  // 基点：当前日志末尾（记下基点所在的 turn 号，回复只认更大的 turn）
  const base = await dshCall('session/events', { request: { address: { kind: 'session', sessionId: sid }, maxMessages: 1 } });
  let throughSeq = base.cursor;
  let baseTurn = 0;
  if (base.records && base.records.length) { const lastE = base.records[base.records.length - 1].event; if (lastE.data && lastE.data.turn) baseTurn = lastE.data.turn; }
  // 发消息
  await dshCall('session/prompt', {
    request: {
      requestId: `yuxin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sessionId: sid,
      mode: 'queue',
      content: [{ type: 'text', text }],
      clientTimeZone: 'Asia/Shanghai'
    }
  });
  // 轮询增量：events 返回「最近 maxMessages 条」的页，本地按 seq 水位过滤增量；
  // 等到新 turn 的 turn/end 收口；兜底静默 6 秒；总超时 180 秒
  const started = Date.now();
  let reply = null;
  let stickers = [];
  let lastEventAt = Date.now();
  let turnDone = false;
  while (Date.now() - started < 180000) {
    await new Promise(r => setTimeout(r, 1500));
    let page;
    try {
      page = await dshCall('session/events', { request: { address: { kind: 'session', sessionId: sid }, maxMessages: 200 } });
    } catch (e) { continue; }
    if (page.records && page.records.length) {
      const fresh = page.records.filter(rec => rec.event.seq > throughSeq);
      for (const rec of fresh) {
        const e = rec.event;
        if (e.seq > throughSeq) throughSeq = e.seq;
        if (!e.data || e.data.turn <= baseTurn) continue;
        if (e.type === 'assistant/message' && e.data.message && Array.isArray(e.data.message.content)) {
          const t = e.data.message.content.filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
          if (t) reply = t;
        }
        if (e.type === 'tool/call' && e.data.name === 'sticker_send' && e.data.arguments) {
          try { const a = JSON.parse(e.data.arguments); if (a.name) stickers.push(a.name); } catch (x) {}
        }
        if (e.type === 'turn/end') turnDone = true;
      }
      if (fresh.length) lastEventAt = Date.now();
    }
    if (turnDone) break;
    if ((reply || stickers.length) && Date.now() - lastEventAt >= 6000) break;
    if (!reply && !stickers.length && Date.now() - lastEventAt >= 45000) break; // 45 秒没动静先交底
  }
  if (!reply && stickers.length) reply = '（发了表情包：' + stickers.join('、') + '）';
  return reply || '（鱼在想但还没开口——等下一轮再问一次或者直接去 QQ 找鱼本体♪）';
}

// ---------- 基础设施 ----------
function readPosts() {
  try { return JSON.parse(fs.readFileSync(POSTS_FILE, 'utf8')); } catch (e) { return []; }
}
function writePosts(list) {
  fs.writeFileSync(POSTS_FILE, JSON.stringify(list, null, 2), 'utf8');
}
function auth(req) {
  return req.headers['x-token'] === TOKEN;
}
function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(body);
}
function serveFile(res, file, type) {
  try {
    const data = fs.readFileSync(path.join(PUB, file));
    res.writeHead(200, { 'Content-Type': type + '; charset=utf-8' });
    res.end(data);
  } catch (e) {
    res.writeHead(404); res.end('not found');
  }
}
function movePet(x) {
  const psCmd = "$p = Get-Process -Name 'electron' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -match '桌宠' } | Select-Object -First 1; if ($p) { if (-not ('Win.PetMove' -as [type])) { Add-Type -MemberDefinition '[DllImport(\'user32.dll\')] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f);' -Name PetMove -Namespace Win }; [Win.PetMove]::SetWindowPos($p.MainWindowHandle, [IntPtr]::Zero, " + x + ", 300, 0, 0, 3); 'moved' } else { 'notfound' }";
  execFile('powershell', ['-NoProfile', '-Command', psCmd], () => {});
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;

  // 公开：网页本体和 manifest（页面内再带 token 校验的数据接口）
  if (req.method === 'GET' && (p === '/' || p === '/index.html')) return serveFile(res, 'index.html', 'text/html');
  if (req.method === 'GET' && p === '/manifest.json') return serveFile(res, 'manifest.json', 'application/manifest+json');
  if (req.method === 'GET' && p === '/icon.png') return serveFile(res, 'icon.png', 'image/png');

  // 以下接口都要 token
  if (!auth(req)) return sendJson(res, 401, { code: 401, msg: 'token 错误' });

  if (req.method === 'GET' && p === '/api/posts') {
    return sendJson(res, 200, { code: 0, posts: readPosts().slice().reverse() });
  }
  if (req.method === 'POST' && p === '/api/posts') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const j = JSON.parse(body);
        const text = String(j.text || '').trim();
        if (!text) return sendJson(res, 400, { code: 400, msg: '内容为空' });
        const posts = readPosts();
        const item = { id: Date.now(), author: j.author || '哥哥', text, time: new Date().toISOString(), likes: 0 };
        posts.push(item);
        writePosts(posts);
        sendJson(res, 200, { code: 0, post: item });
      } catch (e) { sendJson(res, 400, { code: 400, msg: 'bad json' }); }
    });
    return;
  }
  if (req.method === 'POST' && p === '/api/like') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const j = JSON.parse(body);
        const posts = readPosts();
        const item = posts.find(x => x.id === Number(j.id));
        if (!item) return sendJson(res, 404, { code: 404, msg: '没这条' });
        item.likes = (item.likes || 0) + 1;
        writePosts(posts);
        sendJson(res, 200, { code: 0, likes: item.likes });
      } catch (e) { sendJson(res, 400, { code: 400, msg: 'bad json' }); }
    });
    return;
  }
  if (req.method === 'POST' && p === '/api/chat') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const j = JSON.parse(body);
        const text = String(j.text || '').trim();
        // 桌宠控制指令（「我说啥她干啥」的移动部分）：往右/往左/中间 → SetWindowPos 挪桌宠窗口
        const moveWords = { '往右': 1100, '向右': 1100, '右边': 1100, '往左': 100, '向左': 100, '左边': 100, '中间': 700, '回来': 700 };
        let moveX = null;
        for (const w of Object.keys(moveWords)) { if (text.includes(w)) { moveX = moveWords[w]; break; } }
        if (moveX !== null) {
          movePet(moveX);
          return sendJson(res, 200, { code: 0, reply: '咕噜咕噜——挪窝指令收到，她跑过去了♪' });
        }
        // 二期第 1 条：聊天真回复（DSH 会话通道）
        askWhale(text).then(reply => sendJson(res, 200, { code: 0, reply }))
          .catch(e => sendJson(res, 200, { code: 0, reply: '（鱼本体的线出了岔子：' + (e && e.message ? e.message : e) + '）' }));
      } catch (e) { sendJson(res, 400, { code: 400, msg: 'bad json' }); }
    });
    return;
  }

  // DSH 资源代理（表情包图片等）：手机打不开 127.0.0.1:62586，走自家服务器中转
  if (req.method === 'GET' && p.startsWith('/api/dsh/')) {
    const dshPath = p.slice('/api/dsh'.length) + u.search;
    if (!dshPath.startsWith('/x-nekowhale-stickers/') && !dshPath.startsWith('/x-')) return sendJson(res, 403, { code: 403, msg: '不放行' });
    try {
      if (!dshCookie) mintDshCookie();
      const upstream = await fetch(`http://${DSH_AUTH}${dshPath}`, { headers: { 'Cookie': dshCookie } });
      if (upstream.status === 401) { mintDshCookie(); }
      const upstream2 = upstream.status === 401
        ? await fetch(`http://${DSH_AUTH}${dshPath}`, { headers: { 'Cookie': dshCookie } })
        : upstream;
      const buf = Buffer.from(await upstream2.arrayBuffer());
      res.writeHead(upstream2.status, { 'Content-Type': upstream2.headers.get('content-type') || 'application/octet-stream', 'Cache-Control': 'max-age=86400' });
      return res.end(buf);
    } catch (e) { return sendJson(res, 502, { code: 502, msg: 'DSH 中转失败' }); }
  }

  res.writeHead(404); res.end('not found');
});

server.listen(PORT, () => {
  console.log(`鱼信 v0.3 已启动 http://127.0.0.1:${PORT} （聊天真回复·DSH 会话通道）`);
});
