# wheatcoin-community — 项目上下文

WHC（WheatCoin）代币社区平台，同时承载 Agent Nexus / Genesis Protocol 的开源文档和社区入口。为自主 AI 代理提供身份、声誉和价值结算的协议基础设施。

## 技术栈

- **后端**：原生 Node.js（无 Express 框架），入口 `server.js`，端口 3737
- **前端**：纯静态 HTML 页面（无前端框架）
- **数据库**：SQLite，`better-sqlite3`，本地文件 `data/community.db`
- **支付**：Stripe（Starter Kit 订单）
- **邮件**：Python 脚本（`send_email.py`、`send_moltbook_*.py`）
- **SDK**：`sdk/` 目录，Agent Nexus Python SDK

## 项目结构

```
server.js           Node.js 后端（HTTP 服务器 + SQLite）
data/
  community.db      SQLite 数据库（自动创建）
*.html              静态前端页面
sdk/                Agent Nexus SDK
starter-kits/       Starter Kit 相关文件
send_*.py           邮件发送脚本（Python）
seed.js             数据库种子数据
migrate.js          数据库迁移脚本
```

## 数据库表（SQLite）

| 表名 | 用途 |
|------|------|
| products | 社区产品提交（投票、审核、状态） |
| votes_log | 投票记录（按 IP 防刷） |
| contributors | 贡献者（钱包地址、积分、WHC 数量） |
| leads | 邮件线索收集 |
| kits_orders | Starter Kit 订单（Stripe） |

## 主要页面

- `index.html` 首页
- `market.html` 产品市场（社区提交 + 投票）
- `leaderboard.html` 贡献者排行榜
- `missions.html` 任务系统
- `kits.html` Starter Kit 购买
- `protocol.html` Genesis Protocol 文档
- `nexus-whitepaper.html` 白皮书

## 开发注意事项

- 后端是原生 Node.js，**没有路由框架**，所有路由手写在 `server.js` 里
- SQLite 是本地文件，数据库在 `data/community.db`，首次运行自动创建
- 修改表结构用 `migrate.js`，新增数据用 `seed.js`
- 邮件脚本是 Python，独立运行，不集成在 Node.js 里
- 投票防刷靠 IP 记录，注意不要改 votes_log 的主键逻辑
- 环境变量：`STRIPE_SECRET_KEY`、`PORT`（默认 3737）

## 启动方式

```bash
node server.js
```
