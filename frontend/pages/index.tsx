import { useEffect, useMemo, useState } from 'react';

type DatesResp = { dates: string[] };
type ExpiriesResp = { date: string; base: string; expiries: number[] };
type ScanLeg = {
  K1: number; K2: number; premium: number; max_profit: number; max_loss: number; odds: number; pop?: number | null; quality?: string | null;
}
type Bucket = { leg_type: 'CALL'|'PUT'; side: 'DEBIT'|'CREDIT'; top: ScanLeg[]; bottom: ScanLeg[] };
type ScanResp = { asof_date: string; asof_ts: number; base: string; spot_price: number | null; tenor: string; buckets: Bucket[] };

import ResultBucket from '../components/ResultBucket';

const API_BASE = '/spread-finder/api';

// 格式化数字，添加千位分隔符
function formatNumber(num: number, decimals: number = 2): string {
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

// Opinion 结果展示组件（删除 POP 和质量列，新增到期日列）
function OpinionResultDisplay({ result, spotPrice }: { result: any; spotPrice: number }) {
  const items = result.items || [];
  const direction = result.direction;
  const anchorLeg = result.anchor_leg;
  const anchorStrike = result.anchor_strike;

  const isUp = direction === 'up';
  const title = isUp ? '看涨期权 - 借方价差（付权利金）' : '看跌期权 - 借方价差（付权利金）';
  const anchorLabel = isUp ? `K2 固定：${(anchorStrike / 1000).toFixed(0)}k` : `K1 固定：${(anchorStrike / 1000).toFixed(0)}k`;
  const description = isUp ? '小成本博取大回报' : '趋势型看跌布局';
  const subtitle = `Top ${items.length}（高赔率） · ${anchorLabel} · ${description}`;

  const horizonText = result.horizon === 'short' ? '≤1个月' : result.horizon === 'mid' ? '1-3个月' : '≥3个月';

  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16, marginBottom: 16, background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <h3 style={{ margin: 0, fontSize: 18, color: '#333' }}>{title}</h3>
        <span style={{ fontSize: 13, color: '#007bff', fontWeight: 'bold' }}>{subtitle}</span>
      </div>
      <p style={{ margin: '0 0 12px 0', fontSize: 13, color: '#666', fontStyle: 'italic' }}>
        已筛选出 {horizonText} 内到期的期权链中，{anchorLabel} 时赔率最高的策略。
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
                  title={`数据过滤规则：
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
              const premiumUsd = s.premium * spotPrice;
              // 借方价差：max_profit 是金本位，max_loss 是币本位
              const maxProfitUsd = s.max_profit;
              const maxLossUsd = s.max_loss * spotPrice;

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
        借方价差：最大亏损 = 权利金；最大利润 = |K2 - K1| - 权利金
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
  const [activeTab, setActiveTab] = useState<'expiry'|'opinion'>('opinion');
  const [dates, setDates] = useState<string[]>([]);
  const [base, setBase] = useState<'BTC'|'ETH'>('BTC');
  const [date, setDate] = useState<string>('');
  const [expiries, setExpiries] = useState<number[]>([]);
  const [selectedExpiry, setSelectedExpiry] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResp | null>(null);
  const [error, setError] = useState<string>('');

  // Opinion Tab 状态
  const [opinionHorizon, setOpinionHorizon] = useState<'short'|'mid'|'long'>('mid');
  const [opinionDirection, setOpinionDirection] = useState<'up'|'down'>('up');
  const [opinionTarget, setOpinionTarget] = useState<string>('150');
  const [opinionResult, setOpinionResult] = useState<any>(null);

  // 切换币种时调整目标价默认值
  useEffect(() => {
    // BTC默认135(k$=135000), ETH默认55(h$=5500)
    setOpinionTarget(base === 'BTC' ? '135' : '55');
  }, [base]);

  // 加载日期列表
  useEffect(() => {
    fetch(`${API_BASE}/meta/dates`).then(r => r.json()).then((d: DatesResp) => {
      const ds = d.dates || [];
      setDates(ds);
      if (ds.length) setDate(ds[ds.length - 1]);
    }).catch(e => setError(String(e)));
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
          direction: opinionDirection,
          target_price: targetPriceUsd,
          max_gap_steps: 8,
          return_per_bucket: 3
        })
      });

      if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
      const data = await resp.json();
      setOpinionResult(data);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally { setLoading(false); }
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <img src="/spread-finder/signalplus-logo.png" alt="SignalPlus" style={{ height: 40 }} />
        <h1 style={{ margin: 0 }}>期权价差策略推荐</h1>
      </div>

      {/* Tab 切换 */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 20, borderBottom: '2px solid #ddd' }}>
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
            borderRadius: '6px 6px 0 0'
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
            borderRadius: '6px 6px 0 0'
          }}
        >
          按到期筛选
        </button>
      </div>

      {/* Tab 内容 */}
      {activeTab === 'opinion' ? (
        <>
          {/* Opinion Tab 内容 */}
          {opinionResult?.asof_ts && (
            <div style={{ margin: '0 0 16px 0', padding: '12px', background: '#f5f5f5', borderRadius: 6, fontSize: 14 }}>
              <div><strong>数据时间 (北京时间):</strong> {new Date(opinionResult.asof_ts).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}</div>
              {opinionResult.spot_price && (
                <div>
                  <strong>现货价格:</strong> ${opinionResult.spot_price.toFixed(2)}
                  <span style={{ marginLeft: 8, fontSize: 12, color: '#666' }}>(每10分钟更新)</span>
                </div>
              )}
            </div>
          )}

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
              <strong>趋势方向</strong>
              <select value={opinionDirection} onChange={e => setOpinionDirection(e.target.value as any)} style={{ padding: 8, fontSize: 14 }}>
                <option value="up">上涨到 ≥</option>
                <option value="down">下跌到 ≤</option>
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
          {/* 数据信息 */}
          {result?.asof_ts && (
            <div style={{ margin: '0 0 16px 0', padding: '12px', background: '#f5f5f5', borderRadius: 6, fontSize: 14 }}>
              <div><strong>数据时间 (北京时间):</strong> {new Date(result.asof_ts).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}</div>
              {result.spot_price && (
                <div>
                  <strong>现货价格:</strong> ${result.spot_price.toFixed(2)}
                  <span style={{ marginLeft: 8, fontSize: 12, color: '#666' }}>(每10分钟更新)</span>
                </div>
              )}
            </div>
          )}

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
