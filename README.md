# 期权价差策略推荐系统

基于 Deribit 期权数据的智能价差策略筛选工具，通过双层过滤机制推荐高质量的期权价差交易机会。

![SignalPlus](https://signalplus.com/logo.png)

## 📋 功能特性

### 🎯 核心功能
- **智能策略筛选**：自动分析并推荐最优期权价差组合
- **双层过滤机制**：确保数据质量，过滤噪声数据
- **实时数据更新**：基于 Deribit 每日期权链快照
- **多维度展示**：支持看涨/看跌、借方/贷方四种策略类型

### 🔍 数据过滤规则

#### 第一层：单腿期权过滤
- **spread_ratio > 0.5**：过滤买卖价差超过中间价 50% 的期权
- 确保每个期权都有合理的流动性
- 避免深度虚值期权的报价噪声

#### 第二层：组合过滤
- **权利金 < $10**：过滤权利金过小的价差组合
- 避免深度虚值期权组合导致的极端赔率
- 提升策略推荐的可操作性

### 📊 策略类型

#### 看涨期权价差
- **借方价差（DEBIT）**：小成本博取大回报 - Top 3 高赔率策略
- **贷方价差（CREDIT）**：最具性价比的鸭子策略 - Bottom 3 低赔率策略

#### 看跌期权价差
- **借方价差（DEBIT）**：小成本博取大回报 - Top 3 高赔率策略
- **贷方价差（CREDIT）**：最具性价比的鸭子策略 - Bottom 3 低赔率策略

### 💡 智能特性
- **自动到期日选择**：默认选择距离一周的到期日
- **剩余天数显示**：直观展示期权剩余时间
- **虚值期权筛选**：自动过滤实值期权（ITM），只保留虚值和平值
- **中文界面**：全中文界面，易于理解
- **北京时间**：数据时间采用北京时区

## 🏗️ 技术架构

### 后端 (Backend)
- **框架**：FastAPI + Python 3.12
- **数据处理**：Pandas + NumPy
- **期权定价**：Black-Scholes 模型
- **数据存储**：Parquet 格式快照

**主要组件**：
```
backend/
├── app/
│   ├── api/          # API 路由
│   ├── services/     # 业务逻辑
│   │   ├── scanner.py    # 价差扫描引擎
│   │   ├── loader.py     # 数据加载
│   │   └── bs.py         # BS 模型计算
│   └── main.py       # 应用入口
└── data/             # 期权链快照数据
```

### 前端 (Frontend)
- **框架**：Next.js 14.2.3 + React
- **语言**：TypeScript
- **部署**：Standalone 模式
- **基础路径**：/spread-finder

**主要组件**：
```
frontend/
├── pages/
│   └── index.tsx         # 主页面
├── components/
│   └── ResultBucket.tsx  # 策略展示组件
└── public/               # 静态资源
```

## 📐 计算公式

### 赔率计算
```
赔率 = |K2 - K1| / (权利金 × 现货价格)
```
保留 1 位小数

### 借方价差
```
最大收益 = |K2 - K1| (金本位 USD)
最大亏损 = 权利金 (币本位)
```

### 贷方价差
```
最大收益 = 权利金 (币本位)
最大亏损 = |K2 - K1| (金本位 USD)
```

### spread_ratio 计算
```
spread_ratio = (ask - bid) / mid_price
```
- 0 ~ 0.2：流动性好
- 0.2 ~ 0.5：流动性一般
- > 0.5：流动性差（过滤）

## 🚀 部署指南

### 环境要求
- Python 3.12+
- Node.js 18+
- PM2（进程管理）

### 后端部署
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 使用 PM2 启动
pm2 start "uvicorn app.main:app --host 127.0.0.1 --port 3115" --name spread-finder-api
```

### 前端部署
```bash
cd frontend
npm install
npm run build

# 复制静态文件到 standalone
cp -r .next/static .next/standalone/.next/
cp -r public .next/standalone/

# 使用 PM2 启动
pm2 start "node .next/standalone/server.js" --name spread-finder-web
pm2 save
```

### 反向代理配置（Caddy）
```
handle /spread-finder* {
    reverse_proxy localhost:3117
}

handle /spread-finder/api* {
    reverse_proxy localhost:3115
}
```

## 📊 数据流程

```
Deribit API
    ↓
每日快照 (Parquet)
    ↓
数据加载与预处理
    ↓
spread_ratio 过滤 (> 0.5)
    ↓
虚值期权筛选 (OTM/ATM)
    ↓
价差组合计算
    ↓
权利金过滤 (< $10)
    ↓
赔率排序 (Top/Bottom)
    ↓
前端展示
```

## 🎨 界面示例

### 主页面
- 顶部：SignalPlus Logo + 标题
- 控制面板：标的资产 | 数据日期 | 到期日选择
- 数据信息：数据时间（北京时间）| 现货价格
- 策略展示：4 个策略类型，每个显示 Top 3 或 Bottom 3

### 策略卡片
- 标题：策略类型 + Top/Bottom 标识
- 描述：策略特点说明
- 表格：执行价 1 | 执行价 2 | 权利金🛈 | 最大收益 | 最大亏损 | 赔率

### 提示信息
鼠标悬停在权利金🛈图标上：
```
数据过滤规则：
1. 过滤单腿期权 spread_ratio > 0.5（买卖价差超过中间价50%）
2. 过滤组合权利金 < $10（避免深度虚值期权）
```

## ⚠️ 免责声明

**仅教育用途，非投资建议，数据来源于 Deribit**

本工具仅用于期权策略的学习和研究，不构成任何投资建议。期权交易具有高风险，可能导致全部本金损失。使用本工具进行交易决策的风险由用户自行承担。

## 📝 更新日志

### v2.0.0 (2025-10-05)
- ✨ 添加双层过滤机制（spread_ratio + 权利金）
- 🎨 界面全面中文化
- 🔧 修正借方/贷方计算公式
- 📊 添加 Top/Bottom 标识
- 🛈 添加过滤规则提示
- 📄 添加免责声明

### v1.0.0 (2025-10-03)
- 🎉 初始版本发布
- 🔍 基础价差扫描功能
- 📊 四种策略类型支持
- 🌐 Next.js + FastAPI 架构

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📧 联系方式

- 项目主页：https://github.com/xiaochongkun/crypto-spread-finder
- 在线演示：https://kunkka.spailab.com/spread-finder

## 📄 License

MIT License

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
