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
  const [dates, setDates] = useState<string[]>([]);
  const [base, setBase] = useState<'BTC'|'ETH'>('BTC');
  const [date, setDate] = useState<string>('');
  const [expiries, setExpiries] = useState<number[]>([]);
  const [selectedExpiry, setSelectedExpiry] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResp | null>(null);
  const [error, setError] = useState<string>('');

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

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <img src="/spread-finder/signalplus-logo.png" alt="SignalPlus" style={{ height: 40 }} />
        <h1 style={{ margin: 0 }}>期权价差策略推荐</h1>
      </div>

      {/* 数据信息 */}
      {result?.asof_ts && (
        <div style={{ margin: '0 0 16px 0', padding: '12px', background: '#f5f5f5', borderRadius: 6, fontSize: 14 }}>
          <div><strong>数据时间 (北京时间):</strong> {new Date(result.asof_ts).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}</div>
          {result.spot_price && <div><strong>现货价格:</strong> ${result.spot_price.toFixed(2)}</div>}
        </div>
      )}

      {/* 控制面板 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <strong>标的资产</strong>
          <select value={base} onChange={e => setBase(e.target.value as 'BTC'|'ETH')} style={{ padding: 8, fontSize: 14 }}>
            <option value="BTC">BTC</option>
            <option value="ETH">ETH</option>
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <strong>数据日期</strong>
          <select value={date} onChange={e => setDate(e.target.value)} style={{ padding: 8, fontSize: 14 }}>
            {dates.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
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

      {/* 免责声明 */}
      <div style={{ marginTop: 32, paddingTop: 16, borderTop: '1px solid #ddd', textAlign: 'center', fontSize: 12, color: '#999' }}>
        仅教育用途，非投资建议，数据来源于 Deribit
      </div>
    </div>
  );
}
