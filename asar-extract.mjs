// asar-extract.mjs — 从 asar 抽取文件或列目录
import fs from 'node:fs';

const archive = 'D:\\tools\\DeepSeek Harness\\resources\\app.asar';

function readAsar(path) {
  const fd = fs.openSync(path, 'r');
  const sizeBuf = Buffer.alloc(16);
  if (fs.readSync(fd, sizeBuf, 0, 16, null) !== 16) throw new Error('read header size failed');
  const jsonSize = sizeBuf.readUInt32LE(12);
  const jsonBuf = Buffer.alloc(jsonSize);
  if (fs.readSync(fd, jsonBuf, 0, jsonSize, 16) !== jsonSize) throw new Error('read header failed');
  const dataOffset = 8 + sizeBuf.readUInt32LE(4); // header 区总大小
  fs.closeSync(fd);
  return { header: JSON.parse(jsonBuf.toString('utf8')), dataOffset };
}

const { header, dataOffset } = readAsar(archive);
const mode = process.argv[2]; // list-dir | get
const target = process.argv[3]; // dsh/... path with '/'

function nodeAt(path) {
  let node = header;
  for (const part of path.split('/')) {
    if (!node.files || !node.files[part]) return null;
    node = node.files[part];
  }
  return node;
}

if (mode === 'list-dir') {
  const n = nodeAt(target);
  if (!n || !n.files) { console.log('not a dir:', target); process.exit(1); }
  for (const [name, child] of Object.entries(n.files)) {
    console.log(child.files ? '[D] ' + name : '    ' + name + (child.size ? ` (${child.size})` : ''));
  }
} else if (mode === 'get') {
  const n = nodeAt(target);
  if (!n || n.files) { console.log('not a file:', target); process.exit(1); }
  const fd = fs.openSync(archive, 'r');
  const buf = Buffer.alloc(n.size);
  fs.readSync(fd, buf, 0, n.size, dataOffset + Number(n.offset));
  fs.closeSync(fd);
  const out = process.argv[4];
  if (out) { fs.writeFileSync(out, buf); console.log('written:', out, buf.length, 'bytes'); }
  else process.stdout.write(buf);
} else {
  console.log('usage: asar-extract.mjs list-dir|get <path> [outfile]');
}
