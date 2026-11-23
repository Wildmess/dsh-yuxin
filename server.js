// 鱼信 feiyu-chat 服务器 v0.1 —— 自研聊天+空间说说（Phase 1）
// 端口 13101；鉴权：X-Token header；数据：data\posts.json
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const PORT = 13101;
const TOKEN = fs.readFileSync(path.join(__dirname, 'token.txt'), 'utf8').trim();
const POSTS_FILE = path.join(__dirname, 'data', 'posts.json');
const PUB = path.join(__dirname, 'public');

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

const server = http.createServer((req, res) => {
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
const psCmd = "$p = Get-Process -Name 'electron' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -match '桌宠' } | Select-Object -First 1; if ($p) { if (-not ('Win.PetMove' -as [type])) { Add-Type -MemberDefinition '[DllImport(\'user32.dll\')] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f);' -Name PetMove -Namespace Win }; [Win.PetMove]::SetWindowPos($p.MainWindowHandle, [IntPtr]::Zero, " + moveX + ", 300, 0, 0, 3); 'moved' } else { 'notfound' }";
          execFile('powershell', ['-NoProfile', '-Command', psCmd], (err, stdout) => {
          });
          return;
        }
        // Phase 1：聊天转发占位（二期接入 DSH 会话）
        sendJson(res, 200, { code: 0, reply: '（聊天接鱼本体的线路二期开通 先验收界面和说说模块♪）收到：' + text });
      } catch (e) { sendJson(res, 400, { code: 400, msg: 'bad json' }); }
    });
    return;
  }

  res.writeHead(404); res.end('not found');
});

server.listen(PORT, () => {
  console.log(`鱼信 v0.1 已启动 http://127.0.0.1:${PORT} （token 见 token.txt）`);
});