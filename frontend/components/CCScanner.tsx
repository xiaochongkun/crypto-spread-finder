/**
 * CC（现货备兑抛货）策略扫描组件
 */
import { useState } from 'react';

const API_BASE = '/option-strategy-finder/api';

interface CCCandidate {
  symbol: string;
  expiry_date: string;
  strike: number;
  delta: number;
  premium: number;
  upside_pct: number;
  apr_notional: number;
  assign_prob: number;
  oi: number;
  spread_bps: number;
  dte: number;
  score: number;
  quality: string;
}

interface CCResult {
  asof_date: string;
  asof_ts: number;
  base: string;
  spot_price: number;
  dvol_index?: number;
  strategy: string;
  filters: any;
  candidates: CCCandidate[];
}

function formatNumber(num: number, decimals: number = 2): string {
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

interface CCScannerProps {
  onDataUpdate?: (data: { asof_ts: number; spot_price?: number; dvol_index?: number }) => void;
}

export default function CCScanner({ onDataUpdate }: CCScannerProps) {
  // 筛选参数
  const [base, setBase] = useState<'BTC'|'ETH'>('BTC');
  const [maxDte, setMaxDte] = useState('60');
  const [maxDelta, setMaxDelta] = useState('0.30');
  const [minOi, setMinOi] = useState('10');
  const [maxSpreadBps, setMaxSpreadBps] = useState('500');
  const [positionSize, setPositionSize] = useState('1');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<CCResult | null>(null);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const handleScan = async () => {
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const resp = await fetch(`${API_BASE}/strategy/cc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base,
          max_dte: parseInt(maxDte),
          max_delta: parseFloat(maxDelta),
          min_oi: parseInt(minOi),
          max_spread_bps: parseInt(maxSpreadBps),
          position_size: parseInt(positionSize),
          return_count: 20
        })
      });

      if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
      const data = await resp.json();
      setResult(data);

      // 通知父组件更新全局数据
      if (onDataUpdate && data.asof_ts) {
        onDataUpdate({
          asof_ts: data.asof_ts,
          spot_price: data.spot_price,
          dvol_index: data.dvol_index,
        });
      }
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: '0 0 8px 0' }}>CC - 加钱卖货</h2>
        <p style={{ margin: 0, color: '#666', fontSize: 14 }}>
          策略说明：在持有现货基础上卖出看涨期权（Call），获取额外权利金收益
        </p>
      </div>

      {/* 筛选器 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <strong>标的</strong>
          <select value={base} onChange={e => setBase(e.target.value as any)} style={{ padding: 8, fontSize: 14 }}>
            <option value="BTC">BTC</option>
            <option value="ETH">ETH</option>
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <strong>最大DTE（天）</strong>
          <input type="number" value={maxDte} onChange={e => setMaxDte(e.target.value)} style={{ padding: 8, fontSize: 14 }} />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <strong>最大Delta</strong>
          <input type="number" step="0.01" value={maxDelta} onChange={e => setMaxDelta(e.target.value)} style={{ padding: 8, fontSize: 14 }} />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <strong>持仓合约数量（张）</strong>
          <input type="number" value={positionSize} onChange={e => setPositionSize(e.target.value)} style={{ padding: 8, fontSize: 14 }} />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <strong>最小持仓量</strong>
          <input type="number" value={minOi} onChange={e => setMinOi(e.target.value)} style={{ padding: 8, fontSize: 14 }} />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <strong>最大点差（bps）</strong>
          <input type="number" value={maxSpreadBps} onChange={e => setMaxSpreadBps(e.target.value)} style={{ padding: 8, fontSize: 14 }} />
        </label>
      </div>

      <button
        onClick={handleScan}
        disabled={loading}
        style={{
          padding: '10px 20px',
          background: loading ? '#ccc' : '#28a745',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          fontSize: 15,
          fontWeight: 'bold',
          cursor: loading ? 'not-allowed' : 'pointer',
          marginBottom: 20
        }}
      >
        {loading ? '扫描中...' : '扫描策略'}
      </button>

      {error && <div style={{ color: 'red', background: '#fee', padding: 12, borderRadius: 6, marginBottom: 16 }}>{error}</div>}

      {/* 结果表格 */}
      {result && result.candidates.length > 0 && (
        <div style={{ border: '1px solid #ddd', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ background: '#f8f9fa', position: 'sticky', top: 0 }}>
                <tr>
                  <th style={{ padding: '10px 8px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>合约</th>
                  <th style={{ padding: '10px 8px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>到期日</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>行权价</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>Delta</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>权利金</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>上涨空间%</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>APR</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>行权概率</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>持仓量</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>得分</th>
                </tr>
              </thead>
              <tbody>
                {result.candidates.map((c, idx) => (
                  <tr
                    key={idx}
                    onClick={() => setExpandedRow(expandedRow === idx ? null : idx)}
                    style={{
                      cursor: 'pointer',
                      background: expandedRow === idx ? '#f0f8ff' : idx % 2 === 0 ? '#fff' : '#fafafa'
                    }}
                  >
                    <td style={{ padding: '8px', borderBottom: '1px solid #eee', fontSize: 12 }}>{c.symbol}</td>
                    <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>{c.expiry_date}</td>
                    <td style={{ padding: '8px', borderBottom: '1px solid #eee', textAlign: 'right' }}>${formatNumber(c.strike, 0)}</td>
                    <td style={{ padding: '8px', borderBottom: '1px solid #eee', textAlign: 'right' }}>{c.delta.toFixed(2)}</td>
                    <td style={{ padding: '8px', borderBottom: '1px solid #eee', textAlign: 'right' }}>${formatNumber(c.premium, 2)}</td>
                    <td style={{ padding: '8px', borderBottom: '1px solid #eee', textAlign: 'right' }}>
                      {(c.upside_pct * 100).toFixed(2)}%
                    </td>
                    <td style={{ padding: '8px', borderBottom: '1px solid #eee', textAlign: 'right', color: '#28a745', fontWeight: 'bold' }}>
                      {(c.apr_notional * 100).toFixed(1)}%
                    </td>
                    <td style={{ padding: '8px', borderBottom: '1px solid #eee', textAlign: 'right' }}>{(c.assign_prob * 100).toFixed(1)}%</td>
                    <td style={{ padding: '8px', borderBottom: '1px solid #eee', textAlign: 'right' }}>{formatNumber(c.oi, 0)}</td>
                    <td style={{ padding: '8px', borderBottom: '1px solid #eee', textAlign: 'right', fontWeight: 'bold' }}>
                      <span style={{
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: c.score >= 70 ? '#28a745' : c.score >= 50 ? '#ffc107' : '#6c757d',
                        color: '#fff',
                        fontSize: 12
                      }}>
                        {c.score.toFixed(0)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {result && result.candidates.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>
          未找到符合条件的策略，请调整筛选条件
        </div>
      )}
    </div>
  );
}
