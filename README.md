# 🌾 麦穗社区 · AI Agent 产品发现平台

专注 AI Agent 应用的开源产品发现社区。免费发布你的产品，获得真实用户和流量。

## 🚀 最新架构 (Week 1 Core Update)
系统已从本地 JSON 架构升级为企业级 **SQLite 数据库**，并集成了**全自动法币与加密货币双通道收款**和**抗并发安全锁**。

### 核心功能
- **防刷票系统**：基于 IP 和数据库行级事务锁，防止脚本刷榜。
- **真金白银收款**：集成 Stripe Checkout（支持 Apple Pay/Google Pay）。
- **极客极速支付**：集成 Solana Pay 原生协议，一键唤醒 Phantom 钱包（$WHC 付款 6折优惠）。
- **管理员安全后台**：带密码鉴权的 `/admin` 产品审核中心。

## 💻 本地运行

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量 (创建 .env)
# 必须配置以下四个环境变量才能完整运行：
# ADMIN_PASSWORD=你的管理员密码
# TELEGRAM_BOT_TOKEN=你的电报机器人Token (用于订单推送)
# TELEGRAM_CHAT_ID=你的电报ID
# STRIPE_SECRET_KEY=sk_test_... (Stripe 密钥，用于拉起支付)

# 3. 启动服务器 (默认端口 3737)
npm start
```

## ☁️ 部署指南 (Railway)

1. Fork 本仓库并连接到 Railway。
2. 在 **Variables** 选项卡中，配置上述四个环境变量。
3. **⚠️ 极其重要**：在 **Volumes** 中，新建一个存储卷并挂载到 `/app/data`，否则重启后数据库文件 (`community.db`) 会丢失！

## 🪙 $WHC 合约地址
`4sehcoU2vrr11HPEGpEmWMvDL1ddwveDpvAVY5d8pump` (Solana · pump.fun)

## 🏆 增长飞轮与贡献奖励 (Growth Flywheel)

我们是一个开源社区！为了让飞轮转起来，所有真实的社区贡献都将获得 **$WHC** 积分与代币奖励。

| 贡献行为 | 奖励 WHC |
|---------|---------|
| 提交一个新 AI Agent 产品（审核通过） | +50 WHC |
| 代码提交 PR 合并 | +200 WHC 起 |

*你的贡献将展示在 [🏆 社区排行榜 (Leaderboard)](/leaderboard) 上！排名前列可获得 1.1x ~ 1.5x 加成！*

> 详见 [CONTRIBUTING.md](./CONTRIBUTING.md) 了解如何参与。
