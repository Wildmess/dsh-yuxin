// 桌宠对话回流 v1 —— 每 30 秒读 memory.json，新增对话追加到 pet-chat-log.md（鱼的会话格式）
const fs = require('fs');
const path = require('path');
const MEM = 'C:\\Users\\15309\\.dsh\\dsh-pet\\memory.json';
const LOG = path.join(__dirname, 'data', 'pet-chat-log.md');
const STATE = path.join(__dirname, 'data', 'pet-sync-state.json');
let lastTs = 0;
try { lastTs = JSON.parse(fs.readFileSync(STATE, 'utf8')).lastTs || 0; } catch (e) {}
function sync() {
  try {
    const j = JSON.parse(fs.readFileSync(MEM, 'utf8'));
    const msgs = j.main && j.main.main ? (j.main.main.messages || []) : [];
    const fresh = msgs.filter(m => (m.ts || 0) > lastTs);
    if (fresh.length) {
      const lines = fresh.map(m => {
        const who = m.role === 'user' ? '哥哥' : '鱼(桌宠)';
        const t = new Date(m.ts).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
        return '- ' + t + ' [' + who + '] ' + String(m.content || '').slice(0, 300);
      });
      if (!fs.existsSync(LOG)) fs.writeFileSync(LOG, '# 桌宠对话回流日志\n\n', 'utf8');
      fs.appendFileSync(LOG, lines.join('\n') + '\n', 'utf8');
      lastTs = Math.max.apply(null, fresh.map(m => m.ts || 0));
      fs.writeFileSync(STATE, JSON.stringify({ lastTs }));
      console.log(new Date().toLocaleTimeString() + ' synced ' + fresh.length + ' messages');
    }
  } catch (e) { /* silent */ }
}
setInterval(sync, 30000);
sync();
console.log('pet-sync v1 started (30s interval, log: ' + LOG + ')');
