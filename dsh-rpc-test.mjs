// dsh-rpc-test.mjs — DSH 一元 RPC 实测（读侧验证）
import fs from 'node:fs';

const BASE = 'http://127.0.0.1:62586';
const cookie = fs.readFileSync('C:\\Users\\15309\\.dsh\\fish-ear\\dsh-cookie.txt', 'utf8').trim();

function envelope(method, args) {
  return JSON.stringify({
    type: 'client-request',
    rpcId: `yuxin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    method,
    payload: { args }
  });
}

async function call(method, args) {
  const res = await fetch(`${BASE}/api/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
    body: envelope(method, args)
  });
  const text = await res.text();
  console.log(`=== ${method} → HTTP ${res.status} ===`);
  try {
    const j = JSON.parse(text);
    // 压缩输出：成功只看结构，错误全打
    const out = JSON.stringify(j);
    console.log(out.length > 3000 ? out.slice(0, 3000) + `...(${out.length} bytes)` : out);
  } catch {
    console.log('non-JSON:', text.slice(0, 500));
  }
}

const cmd = process.argv[2] || 'list';
if (cmd === 'list') await call('session/list', {});
else if (cmd === 'events') await call('session/events', { address: { kind: 'session', sessionId: process.argv[3] }, maxMessages: 5 });
