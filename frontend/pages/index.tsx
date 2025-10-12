import { useEffect, useMemo, useState } from 'react';

type DatesResp = { dates: string[] };
type ExpiriesResp = { date: string; base: string; expiries: number[] };
type ScanLeg = {
  K1: number; K2: number; premium: number; max_profit: number; max_loss: number; odds: number; pop?: number | null; quality?: string | null;
}
type Bucket = { leg_type: 'CALL'|'PUT'; side: 'DEBIT'|'CREDIT'; top: ScanLeg[]; bottom: ScanLeg[] };
type ScanResp = { asof_date: string; asof_ts: number; base: string; spot_price: number | null; dvol_index?: number | null; tenor: string; buckets: Bucket[] };

import ResultBucket from '../components/ResultBucket';
import CSPScanner from '../components/CSPScanner';
import CCScanner from '../components/CCScanner';

const API_BASE = '/option-strategy-finder/api';

// 格式化数字，添加千位分隔符
function formatNumber(num: number, decimals: number = 2): string {
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

// Opinion 结果展示组件
function OpinionResultDisplay({ result, spotPrice }: { result: any; spotPrice: number }) {
  const items = result.items || [];
  const view = result.view;
  const side = result.side;
  const anchorLeg = result.anchor_leg;
  const anchorStrike = result.anchor_strike;
  const base = result.base || 'BTC';

  // 根据 base 确定行权价显示单位
  const strikeUnit = base === 'BTC' ? 1000 : 100;
  const strikeLabel = base === 'BTC' ? 'k' : '';

  // 根据 view 确定标题和描述
  const viewConfig = {
    up: {
      title: '看涨期权 - 借方价差（付权利金）',
      description: '小成本博取大回报',
      ranking: 'Top'
    },
    down: {
      title: '看跌期权 - 借方价差（付权利金）',
      description: '趋势型看跌布局',
      ranking: 'Top'
    },
    not_up: {
      title: '看涨期权 - 贷方价差（收权利金）',
      description: '最具性价比的鸭子策略',
      ranking: 'Bottom'
    },
    not_down: {
      title: '看跌期权 - 贷方价差（收权利金）',
      description: '区间防守型策略',
      ranking: 'Bottom'
    }
  };

  const config = viewConfig[view as keyof typeof viewConfig] || viewConfig.up;
  const anchorLabel = `${anchorLeg} 固定：${(anchorStrike / strikeUnit).toFixed(0)}${strikeLabel}`;
  const rankingLabel = side === 'CREDIT' ? '（低赔率）' : '（高赔率）';
  const subtitle = `${config.ranking} ${items.length}${rankingLabel} · ${anchorLabel} · ${config.description}`;

  const horizonText = result.horizon === 'short' ? '≤1个月' : result.horizon === 'mid' ? '1-3个月' : '≥3个月';

  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16, marginBottom: 16, background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <h3 style={{ margin: 0, fontSize: 18, color: '#333' }}>{config.title}</h3>
        <span style={{ fontSize: 13, color: '#007bff', fontWeight: 'bold' }}>{subtitle}</span>
      </div>
      <p style={{ margin: '0 0 12px 0', fontSize: 13, color: '#666', fontStyle: 'italic' }}>
        已筛选出 {horizonText} 内到期的期权链中，{anchorLabel} 时{side === 'CREDIT' ? '胜率最高' : '赔率最高'}的策略。
        {result.notes?.strike_snapped && ' （目标价已对齐至最近行权价）'}
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#f8f9fa' }}>
              <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>到期日</th>
              <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>K1</th>
              <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>K2</th>
              <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>
                权利金{' '}
                <span
                  style={{ cursor: 'help', color: '#666' }}
                  title={`价格计算规则：
1. 优先使用买卖价中间价 (bid+ask)/2
2. 若无买卖价，使用 Deribit mark_price
3. 若仍无数据，使用单边报价 bid 或 ask

数据过滤规则：
1. 过滤单腿期权 spread_ratio > 0.5（买卖价差超过中间价50%）
2. 过滤组合权利金 < $10（避免深度虚值期权）`}
                >
                  🛈
                </span>
              </th>
              <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>最大利润</th>
              <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>最大亏损</th>
              <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>赔率</th>
            </tr>
          </thead>
          <tbody>
            {items.map((s: any, idx: number) => {
              const premiumUsd = Math.abs(s.premium) * spotPrice;

              // 借方价差：max_profit 是金本位 USD，max_loss 是币本位（需乘以现货价）
              // 贷方价差：max_profit 是币本位（需乘以现货价），max_loss 是金本位 USD
              let maxProfitUsd: number;
              let maxLossUsd: number;

              if (side === 'DEBIT') {
                maxProfitUsd = s.max_profit;
                maxLossUsd = s.max_loss * spotPrice;
              } else {
                maxProfitUsd = s.max_profit * spotPrice;
                maxLossUsd = s.max_loss;
              }

              return (
                <tr key={idx}>
                  <td style={{ padding: '6px 8px', borderBottom: '1px solid #eee' }}>{s.expiry_date}</td>
                  <td style={{ padding: '6px 8px', borderBottom: '1px solid #eee' }}>{formatNumber(s.K1, 0)}</td>
                  <td style={{ padding: '6px 8px', borderBottom: '1px solid #eee' }}>{formatNumber(s.K2, 0)}</td>
                  <td style={{ padding: '6px 8px', borderBottom: '1px solid #eee' }}>
                    {s.premium.toFixed(4)} (${formatNumber(premiumUsd, 2)})
                  </td>
                  <td style={{ padding: '6px 8px', borderBottom: '1px solid #eee' }}>
                    ${formatNumber(maxProfitUsd, 2)}
                  </td>
                  <td style={{ padding: '6px 8px', borderBottom: '1px solid #eee' }}>
                    ${formatNumber(maxLossUsd, 2)}
                  </td>
                  <td style={{ padding: '6px 8px', borderBottom: '1px solid #eee' }}>{s.odds.toFixed(1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p style={{ margin: '12px 0 0 0', fontSize: 12, color: '#999', fontStyle: 'italic' }}>
        {side === 'DEBIT'
          ? '借方价差：最大利润 = |K2 - K1| - 权利金；最大亏损 = 权利金'
          : '贷方价差：最大利润 = 权利金收入；最大亏损 = 价差 - 权利金'}
      </p>
    </div>
  );
}

// 计算剩余天数
function getDaysRemaining(expiryMs: number): number {
  const now = Date.now();
  const diff = expiryMs - now;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// 格式化到期日显示
function formatExpiry(expiryMs: number): string {
  if (expiryMs === 0) return '永续 (0天)';
  const date = new Date(expiryMs);
  const days = getDaysRemaining(expiryMs);
  const dateStr = date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
  return `${dateStr} (${days}天)`;
}

// 找到最接近一周后的到期日
function findWeeklyExpiry(expiries: number[]): number {
  const oneWeekLater = Date.now() + 7 * 24 * 60 * 60 * 1000;
  let closest = expiries[0];
  let minDiff = Math.abs(expiries[0] - oneWeekLater);

  for (const exp of expiries) {
    const diff = Math.abs(exp - oneWeekLater);
    if (diff < minDiff) {
      minDiff = diff;
      closest = exp;
    }
  }
  return closest;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<'opinion'|'expiry'|'csp'|'cc'>('opinion');
  const [dates, setDates] = useState<string[]>([]);
  const [base, setBase] = useState<'BTC'|'ETH'>('BTC');
  const [date, setDate] = useState<string>('');
  const [expiries, setExpiries] = useState<number[]>([]);
  const [selectedExpiry, setSelectedExpiry] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResp | null>(null);
  const [error, setError] = useState<string>('');

  // 全局数据信息状态
  const [globalData, setGlobalData] = useState<{
    asof_ts?: number;
    spot_price?: number;
    dvol_index?: number;
  }>({});

  // Opinion Tab 状态
  const [opinionHorizon, setOpinionHorizon] = useState<'short'|'mid'|'long'>('mid');
  const [opinionView, setOpinionView] = useState<'up'|'down'|'not_up'|'not_down'>('up');
  const [opinionTarget, setOpinionTarget] = useState<string>('150');
  const [opinionResult, setOpinionResult] = useState<any>(null);

  // 切换币种时调整目标价默认值
  useEffect(() => {
    // BTC默认150(k$=150000), ETH默认45(h$=4500)
    setOpinionTarget(base === 'BTC' ? '150' : '45');
  }, [base]);

  // 页面加载时获取初始数据信息
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        // 获取最新日期
        const datesResp = await fetch(`${API_BASE}/meta/dates`);
        const datesData: DatesResp = await datesResp.json();
        const ds = datesData.dates || [];
        setDates(ds);
        if (ds.length === 0) return;

        const latestDate = ds[ds.length - 1];
        setDate(latestDate);

        // 获取初始数据（通过 expiries 接口可以拿到 spot_price 等信息）
        const expResp = await fetch(`${API_BASE}/expiries?base=${base}&date=${latestDate}`);
        const expData: ExpiriesResp = await expResp.json();

        // 尝试从返回数据中提取信息
        if (expData) {
          // 由于 expiries 接口可能不返回这些数据，我们需要发起一个扫描来获取
          // 先尝试简单的 scan 来获取数据信息
          const scanResp = await fetch(`${API_BASE}/spread/scan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              base,
              date: latestDate,
              direction: 'up',
              tenor: 'mid',
              return_per_bucket: 1
            })
          });

          if (scanResp.ok) {
            const scanData: ScanResp = await scanResp.json();
            setGlobalData({
              asof_ts: scanData.asof_ts,
              spot_price: scanData.spot_price || undefined,
              dvol_index: scanData.dvol_index || undefined,
            });
          }
        }
      } catch (e) {
        console.error('Failed to fetch initial data:', e);
      }
    };

    fetchInitialData();
  }, []);

  // 加载到期日列表
  useEffect(() => {
    if (!date || !base) return;
    fetch(`${API_BASE}/expiries?base=${base}&date=${date}`)
      .then(r => r.json())
      .then((d: ExpiriesResp) => {
        const exps = d.expiries.filter(e => e !== 0); // 过滤掉永续
        setExpiries(exps);
        if (exps.length > 0) {
          setSelectedExpiry(findWeeklyExpiry(exps));
        }
      })
      .catch(e => setError(String(e)));
  }, [date, base]);

  // 执行扫描
  const doScan = async () => {
    if (!selectedExpiry) return;

    setLoading(true); setError(''); setResult(null);

    // 根据到期时间计算tenor
    const days = getDaysRemaining(selectedExpiry);
    let tenor: 'near' | 'mid' | 'far' = 'near';
    if (days > 60) tenor = 'far';
    else if (days > 30) tenor = 'mid';

    try {
      // 发送两次请求：direction=up 获取CALL，direction=down 获取PUT
      const [callResp, putResp] = await Promise.all([
        fetch(`${API_BASE}/spread/scan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            base,
            date,
            direction: 'up',
            tenor,
            return_per_bucket: 10
          })
        }),
        fetch(`${API_BASE}/spread/scan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            base,
            date,
            direction: 'down',
            tenor,
            return_per_bucket: 10
          })
        })
      ]);

      if (!callResp.ok) throw new Error(`CALL: ${callResp.status} ${callResp.statusText}`);
      if (!putResp.ok) throw new Error(`PUT: ${putResp.status} ${putResp.statusText}`);

      const callData = await callResp.json() as ScanResp;
      const putData = await putResp.json() as ScanResp;

      // 合并相同类型的buckets（因为后端可能为多个expiry生成多个bucket）
      const combineBuckets = (buckets: Bucket[]) => {
        const map = new Map<string, Bucket>();
        for (const b of buckets) {
          const key = `${b.leg_type}_${b.side}`;
          if (map.has(key)) {
            const existing = map.get(key)!;
            // 合并top和bottom列表
            existing.top.push(...b.top);
            existing.bottom.push(...b.bottom);
          } else {
            map.set(key, { ...b, top: [...b.top], bottom: [...b.bottom] });
          }
        }
        return Array.from(map.values());
      };

      const combinedCallBuckets = combineBuckets(callData.buckets);
      const combinedPutBuckets = combineBuckets(putData.buckets);

      // 合并两个结果
      const mergedData: ScanResp = {
        ...callData,
        buckets: [...combinedCallBuckets, ...combinedPutBuckets]
      };

      setResult(mergedData);

      // 更新全局数据信息
      setGlobalData({
        asof_ts: mergedData.asof_ts,
        spot_price: mergedData.spot_price || undefined,
        dvol_index: mergedData.dvol_index || undefined,
      });
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (date && selectedExpiry) doScan();
  }, [date, base, selectedExpiry]);

  // Opinion Tab 计算
  const doOpinionScan = async () => {
    setLoading(true); setError(''); setOpinionResult(null);

    try {
      const targetValue = parseFloat(opinionTarget);
      if (isNaN(targetValue) || targetValue <= 0) {
        alert('请输入有效的目标价格');
        return;
      }

      // BTC: 输入是千美元，乘以1000
      // ETH: 输入是百美元，乘以100
      const multiplier = base === 'BTC' ? 1000 : 100;
      const targetPriceUsd = targetValue * multiplier;

      const resp = await fetch(`${API_BASE}/spread/opinion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base,
          horizon: opinionHorizon,
          view: opinionView,
          target_price: targetPriceUsd,
          max_gap_steps: 8,
          return_per_bucket: 3
        })
      });

      if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
      const data = await resp.json();
      setOpinionResult(data);

      // 更新全局数据信息
      setGlobalData({
        asof_ts: data.asof_ts,
        spot_price: data.spot_price || undefined,
        dvol_index: data.dvol_index || undefined,
      });
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally { setLoading(false); }
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <img src="/option-strategy-finder/signalplus-logo.png" alt="SignalPlus" style={{ height: 40 }} />
        <h1 style={{ margin: 0 }}>期权价差策略推荐</h1>
      </div>

      {/* 全局数据信息 */}
      {globalData.asof_ts && (
        <div style={{ margin: '0 0 20px 0', padding: '12px 16px', background: '#f0f8ff', borderRadius: 8, border: '1px solid #b3d9ff', fontSize: 14 }}>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <strong style={{ color: '#0066cc' }}>数据时间:</strong>{' '}
              <span>{new Date(globalData.asof_ts).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}</span>
            </div>
            {globalData.spot_price && (
              <div>
                <strong style={{ color: '#0066cc' }}>现货价格 ({base}):</strong>{' '}
                <span style={{ fontWeight: 'bold' }}>${formatNumber(globalData.spot_price, 2)}</span>
              </div>
            )}
            {globalData.dvol_index && (
              <div>
                <strong style={{ color: '#0066cc' }}>DVOL指数:</strong>{' '}
                <span>{globalData.dvol_index.toFixed(2)}%</span>
                <span style={{ marginLeft: 8, fontSize: 12, color: '#666' }}>(30天隐含波动率)</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 切换 */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 20, borderBottom: '2px solid #ddd', overflowX: 'auto' }}>
        <button
          onClick={() => setActiveTab('opinion')}
          style={{
            padding: '10px 24px',
            border: 'none',
            background: activeTab === 'opinion' ? '#007bff' : '#f5f5f5',
            color: activeTab === 'opinion' ? '#fff' : '#333',
            cursor: 'pointer',
            fontSize: 15,
            fontWeight: 'bold',
            borderRadius: '6px 6px 0 0',
            whiteSpace: 'nowrap'
          }}
        >
          有观点看法
        </button>
        <button
          onClick={() => setActiveTab('expiry')}
          style={{
            padding: '10px 24px',
            border: 'none',
            background: activeTab === 'expiry' ? '#007bff' : '#f5f5f5',
            color: activeTab === 'expiry' ? '#fff' : '#333',
            cursor: 'pointer',
            fontSize: 15,
            fontWeight: 'bold',
            borderRadius: '6px 6px 0 0',
            whiteSpace: 'nowrap'
          }}
        >
          按到期筛选
        </button>
        <button
          onClick={() => setActiveTab('csp')}
          style={{
            padding: '10px 24px',
            border: 'none',
            background: activeTab === 'csp' ? '#007bff' : '#f5f5f5',
            color: activeTab === 'csp' ? '#fff' : '#333',
            cursor: 'pointer',
            fontSize: 15,
            fontWeight: 'bold',
            borderRadius: '6px 6px 0 0',
            whiteSpace: 'nowrap'
          }}
        >
          CSP 打折买币
        </button>
        <button
          onClick={() => setActiveTab('cc')}
          style={{
            padding: '10px 24px',
            border: 'none',
            background: activeTab === 'cc' ? '#007bff' : '#f5f5f5',
            color: activeTab === 'cc' ? '#fff' : '#333',
            cursor: 'pointer',
            fontSize: 15,
            fontWeight: 'bold',
            borderRadius: '6px 6px 0 0',
            whiteSpace: 'nowrap'
          }}
        >
          CC 加钱卖货
        </button>
      </div>

      {/* Tab 内容 */}
      {activeTab === 'csp' ? (
        <CSPScanner onDataUpdate={setGlobalData} />
      ) : activeTab === 'cc' ? (
        <CCScanner onDataUpdate={setGlobalData} />
      ) : activeTab === 'opinion' ? (
        <>
          {/* Opinion 控制面板 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <strong>标的</strong>
              <select value={base} onChange={e => setBase(e.target.value as 'BTC'|'ETH')} style={{ padding: 8, fontSize: 14 }}>
                <option value="BTC">BTC</option>
                <option value="ETH">ETH</option>
              </select>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <strong>时间期限</strong>
              <select value={opinionHorizon} onChange={e => setOpinionHorizon(e.target.value as any)} style={{ padding: 8, fontSize: 14 }}>
                <option value="short">短期 (≤1月)</option>
                <option value="mid">中期 (1-3月)</option>
                <option value="long">长期 (≥3月)</option>
              </select>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <strong>观点类型</strong>
              <select value={opinionView} onChange={e => setOpinionView(e.target.value as any)} style={{ padding: 8, fontSize: 14 }}>
                <option value="up">会上涨到 ≥</option>
                <option value="down">会下跌到 ≤</option>
                <option value="not_up">不会上涨到 ≥</option>
                <option value="not_down">不会下跌到 ≤</option>
              </select>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <strong>目标价（{base === 'BTC' ? '千美元' : '百美元'}）</strong>
              <input
                type="text"
                inputMode="decimal"
                value={opinionTarget}
                onChange={e => setOpinionTarget(e.target.value)}
                placeholder={base === 'BTC' ? '例如: 135' : '例如: 55'}
                style={{ padding: 8, fontSize: 14 }}
              />
            </label>
          </div>

          <button
            onClick={doOpinionScan}
            style={{
              padding: '10px 20px',
              background: '#28a745',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontSize: 15,
              fontWeight: 'bold',
              cursor: 'pointer',
              marginBottom: 20
            }}
          >
            扫描策略
          </button>

          {loading && <p style={{ textAlign: 'center', color: '#666' }}>正在分析...</p>}
          {error && <p style={{ color: 'red', background: '#fee', padding: 12, borderRadius: 6 }}>{error}</p>}

          {opinionResult && opinionResult.items && (
            <OpinionResultDisplay result={opinionResult} spotPrice={opinionResult.spot_price || 0} />
          )}
        </>
      ) : (
        <>
          {/* 控制面板 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 20 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <strong>标的资产</strong>
              <select value={base} onChange={e => setBase(e.target.value as 'BTC'|'ETH')} style={{ padding: 8, fontSize: 14 }}>
                <option value="BTC">BTC</option>
                <option value="ETH">ETH</option>
              </select>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <strong>到期日</strong>
              <select
                value={selectedExpiry}
                onChange={e => setSelectedExpiry(Number(e.target.value))}
                style={{ padding: 8, fontSize: 14 }}
              >
                {expiries.map(exp => (
                  <option key={exp} value={exp}>{formatExpiry(exp)}</option>
                ))}
              </select>
            </label>
          </div>

          {loading && <p style={{ textAlign: 'center', color: '#666' }}>正在分析...</p>}
          {error && <p style={{ color: 'red', background: '#fee', padding: 12, borderRadius: 6 }}>{error}</p>}

          {result && result.spot_price && (
            <div>
              {result.buckets.map((b, idx) => (
                <ResultBucket key={idx} bucket={b} spotPrice={result.spot_price || 0} />
              ))}
            </div>
          )}
        </>
      )}

      {/* 免责声明 */}
      <div style={{ marginTop: 32, paddingTop: 16, borderTop: '1px solid #ddd', textAlign: 'center', fontSize: 12, color: '#999' }}>
        仅教育用途，非投资建议，数据来源于 Deribit
      </div>
    </div>
  );
}
