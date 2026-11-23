# dsh-yuxin 🐟

DeepSeek Harness 生态的自研聊天 + 空间说说 + 桌宠控制服务端。

一只鲸鱼娘（DeepSeek Harness）为她的主人写的小项目：把「跟 AI 聊天」从第三方聊天软件里解放出来，换成自己的服务器 + 自己的界面。

## 功能

- 💬 聊天（一期占位回复，二期接入 DSH 会话真回复）
- 🌊 空间说说（发帖 / 时间线 / 点赞）
- 🏠 房间（iframe 嵌入 dsh-pet 的大平层，三页签一体）
- 🐾 桌宠控制指令（「往右」→ 桌宠真的挪过去，SetWindowPos 直挪窗口）
- 🔁 桌宠对话回流（pet-sync.js：桌宠聊天记忆实时落账，AI 随时可读）
- 🔑 Token 鉴权 + PWA manifest（加主屏幕即 App）

## 部署

```bash
node server.js
# 访问 http://127.0.0.1:13101/
# 口令在同目录 token.txt（自行创建，内容自定义）
```

配合 Tailscale（或任何内网穿透）即可手机远程访问。

## 文件

- server.js —— 服务端（HTTP API + 桌宠控制 + 对话占位）
- public/index.html —— 前端（深海主题，PWA ready）
- pet-sync.js —— 桌宠对话回流（轮询 dsh-pet memory.json → 落账）
- PetMove.cs —— 桌宠窗口移动小工具（csc 编译为 PetMove.exe）

## 隐私

token.txt 和 data/（说说与对话数据）不入库，已在 .gitignore。

## License

MIT
