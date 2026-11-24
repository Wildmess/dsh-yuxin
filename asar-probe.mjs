// asar-probe.mjs — 读 app.asar 头部 JSON 目录，列出文件树，按关键词过滤
import fs from 'node:fs';

const archive = 'D:\\tools\\DeepSeek Harness\\resources\\app.asar';

function readAsarHeader(path) {
  const fd = fs.openSync(path, 'r');
  // 三层 pickle: [0-3]=4 [4-7]=payloadSize [8-11]=innerSize [12-15]=jsonSize [16+]=JSON
  const sizeBuf = Buffer.alloc(16);
  if (fs.readSync(fd, sizeBuf, 0, 16, null) !== 16) throw new Error('read header size failed');
  const jsonSize = sizeBuf.readUInt32LE(12);
  const jsonBuf = Buffer.alloc(jsonSize);
  if (fs.readSync(fd, jsonBuf, 0, jsonSize, 16) !== jsonSize) throw new Error('read header failed');
  fs.closeSync(fd);
  return JSON.parse(jsonBuf.toString('utf8'));
}

const header = readAsarHeader(archive);
const files = [];
function walk(node, prefix) {
  if (node.files) {
    for (const [name, child] of Object.entries(node.files)) walk(child, prefix ? prefix + '/' + name : name);
  } else {
    files.push(prefix);
  }
}
walk(header, '');

console.log('total files:', files.length);

const kw = process.argv.slice(2);
let hits = files;
if (kw.length) {
  const reg = new RegExp(kw.join('|'), 'i');
  hits = files.filter(f => reg.test(f));
}
for (const f of hits.slice(0, 400)) console.log(f);
if (hits.length > 400) console.log(`... and ${hits.length - 400} more`);
