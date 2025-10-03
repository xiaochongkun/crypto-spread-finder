# 期权价差筛选器 - 项目需求设计文档

## 背景
目标是实现一个「**期权价差筛选器**」的在线项目。  
数据来源：Deribit 公共 API。  
运行模式：每日抓取一次或两次期权链快照（EOD），存档后用户在前端选择方向与到期档位，系统筛选并返回赔率最佳与最差的期权价差策略（借方/贷方）。  
支持历史数据浏览与简单的 POP（Probability of Profit）估算。

---

## 一、项目目标

1. 用户输入：
   - 标的（BTC/ETH）
   - 日期（默认最新存档，可选历史）
   - 方向（上涨/下跌）
   - 到期档位（近月/中期/远期）
2. 系统返回：
   - Call 与 Put 的 **借方/贷方价差策略**
   - 各类策略的 **赔率 Top3 和 Bottom3**
   - 结果字段：权利金、最大盈亏、盈亏平衡点、赔率、POP
   - 质量标记（点差过宽/仅单边报价）

---

## 二、技术选型

- **后端**：Python 3.11 + FastAPI
- **ETL**：独立脚本 `scripts/etl_daily.py`
- **存储**：Parquet(ZSTD/Snappy) 分区存档，结构 `dt=YYYY-MM-DD/base=BTC/expiry=...`
- **计算**：Numpy/Scipy（Black-Scholes 定价与 POP）
- **前端**：Next.js + Tailwind
- **容器化**：Docker + docker-compose
- **质量**：pydantic 模型、pytest 单测

---

## 三、数据来源 (Deribit API)

主要接口：
- `/public/get_book_summary_by_currency` (kind=option)  
  返回所有期权的摘要：`bid, ask, mark_price, mark_iv, oi, underlying_price, expiry, strike`
- `/public/get_instruments` (kind=option, expired=false)  
  用于校验合约清单

清洗规则：
- 缺失 bid/ask → 用 mid 或 theo 替补
- 点差阈值 `(ask - bid)/mid > 0.15` → 标记 wide_spread
- 添加字段：`quality_flag`

---

## 四、ETL 脚本设计

### 功能
- 每日或每日两次抓取 BTC/ETH 全链快照
- 清洗并写入 Parquet 分区
- 写出 `manifest.json`（包含 date, bases, expiries, rows, asof_ts）

### 存储结构
```
data/parquet/
  dt=2025-09-30/
    base=BTC/expiry=1735603200000/chain.parquet
    base=ETH/expiry=1735603200000/chain.parquet
    manifest.json
```

### 字段最小集
- `date, base, instrument, expiry_ts, strike, option_type`
- `bid, ask, mid, mark_price, mark_iv, underlying, oi`
- `asof_ts, quality_flag`

---

## 五、策略与计算逻辑

### 组合定义（Vertical Spreads）
- Call Debit：Buy Call(K1), Sell Call(K2)
- Call Credit：Sell Call(K1), Buy Call(K2)
- Put Debit：Buy Put(K2), Sell Put(K1)
- Put Credit：Sell Put(K2), Buy Put(K1)

### 计算指标
- **净权利金**：
  - Debit: long - short
  - Credit: short - long
- **最大盈亏**：
  - Debit: max_profit = (K2 - K1) - premium, max_loss = premium
  - Credit: max_profit = premium, max_loss = (K2 - K1) - premium
- **盈亏平衡点**：
  - Call Debit: K1 + premium
  - Call Credit: K2 - premium
  - Put 对称
- **赔率**：max_profit / max_loss
- **POP**：
  - 使用 Black-Scholes 对数正态模型
  - 输入：S, σ=mark_iv, T, r≈0
  - 求净收益≥0 的价格区间概率

---

## 六、筛选逻辑

用户选择：
- `direction`：up / down
- `tenor`：near (7–21d) / mid (22–60d) / far (61–180d)
- `base`：BTC / ETH
- 可选：点差阈值、最小 OI、最大档距

后端：
- 按日期加载对应快照
- 枚举同到期 K1<K2 的价差组合
- 按 `odds` 排序，取 Top3 和 Bottom3
- 返回四类（Call/Put × Debit/Credit）结果

---

## 七、API 设计

### 1) 列出历史日期
`GET /api/meta/dates`  
响应：
```json
{ "dates": ["2025-09-28","2025-09-29","2025-09-30"] }
```

### 2) 查询到期列表
`GET /api/expiries?base=BTC&date=2025-09-30`  
返回该日期的到期时间列表

### 3) 筛选接口
`POST /api/spread/scan`  
请求：
```json
{
  "base": "BTC",
  "date": "2025-09-30",
  "direction": "up",
  "tenor": "near",
  "return_per_bucket": 3
}
```
响应：
```json
{
  "asof_date": "2025-09-30",
  "base": "BTC",
  "tenor": "near",
  "buckets": [
    {
      "leg_type": "CALL",
      "side": "DEBIT",
      "top": [
        { "K1": 50000, "K2": 52000, "premium": 450,
          "max_profit": 1550, "max_loss": 450,
          "odds": 3.44, "pop": 0.41 }
      ],
      "bottom": [ ... ]
    }
  ]
}
```

### 4) 数据元信息
`GET /api/meta/asof?base=BTC&date=2025-09-30`  
返回该日期快照的 `asof_ts`、来源（EOD/收盘）

---

## 八、前端交互

### 控件
- Base 下拉：BTC / ETH
- 日期选择器：默认最新，可选历史
- 方向选择：上涨 / 下跌
- 到期档位选择：近月 / 中期 / 远期
- 高级选项：点差阈值、最小 OI

### 展示
- 顶部显示 “数据更新于 2025-09-30 23:59 UTC (本地时区 …)”
- 筛选结果分为 4 个卡片：
  - Call Debit
  - Call Credit
  - Put Debit
  - Put Credit
- 每个卡片有 Top3 和 Bottom3 的表格
- 鼠标悬停 → 弹出盈亏曲线/腿明细

---

## 九、历史数据支持

- 每个日期有单独分区
- `/api/meta/dates` 返回所有存档日期
- 用户可自由选择历史日查询
- 延迟低（单日数据几千行，本地计算 <1s）
- 存储压力小（全年 <1GB）

---

## 十、扩展功能 (TODO)

- 开盘/收盘双存档
- 支持导出历史数据：`/api/export?date=...`
- 增加点差模型回归，用于估计 bid/ask
- 增加 CSV/Excel 下载
- 扩展到更多标的

---

## 十一、文件结构

```
spread-finder/
  backend/
    app/
      main.py
      api/
        routes_spread.py
        routes_meta.py
      services/
        loader.py
        scanner.py
        bs.py
        quality.py
      models/dto.py
    scripts/etl_daily.py
    tests/
    requirements.txt
    Dockerfile
  frontend/
    pages/index.tsx
    components/
      Controls.tsx
      ResultBucket.tsx
      AsOfBadge.tsx
    package.json
    Dockerfile
  docker-compose.yml
  data/sample/ (示例存档)
```

---

## 十二、默认参数

- TENOR_NEAR_DTE = [7, 21]
- TENOR_MID_DTE = [22, 60]
- TENOR_FAR_DTE = [61, 180]
- MAX_WIDE_SPREAD_RATIO = 0.15
- MIN_OPEN_INTEREST = 0
- MAX_STRIKE_GAP_STEPS = 10

---

## 十三、验收标准

- `etl_daily.py` 能成功生成 Parquet 与 manifest
- `GET /api/meta/dates` 返回存档日期列表
- `GET /api/expiries?date=...` 返回到期列表
- `POST /api/spread/scan` 返回四类策略的 Top/Bottom 结果
- 前端能选择日期和参数，展示结果表格
- 页面显示数据更新日期（as-of）

---
