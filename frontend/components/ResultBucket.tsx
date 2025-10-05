type ScanLeg = {
  K1: number; K2: number; premium: number; max_profit: number; max_loss: number; odds: number; pop?: number | null; quality?: string | null;
}
type Bucket = { leg_type: 'CALL'|'PUT'; side: 'DEBIT'|'CREDIT'; top: ScanLeg[]; bottom: ScanLeg[] };

interface ResultBucketProps {
  bucket: Bucket;
  spotPrice: number;
}

// 翻译策略类型
function getStrategyTitle(legType: string, side: string): string {
  const typeMap: Record<string, string> = {
    'CALL': '看涨期权',
    'PUT': '看跌期权'
  };
  const sideMap: Record<string, string> = {
    'DEBIT': '借方价差 (付权利金)',
    'CREDIT': '贷方价差 (收权利金)'
  };
  return `${typeMap[legType] || legType} - ${sideMap[side] || side}`;
}

export default function ResultBucket({ bucket, spotPrice }: ResultBucketProps) {
  const title = getStrategyTitle(bucket.leg_type, bucket.side);

  // 借方价差只显示top 3，贷方价差只显示bottom 3
  const isDebit = bucket.side === 'DEBIT';
  const strategies = isDebit ? bucket.top.slice(0, 3) : bucket.bottom.slice(0, 3);
  const rankLabel = isDebit ? 'Top 3（高赔率）' : 'Bottom 3（低赔率）';

  // 策略点评：简化为关键点
  const commentary = isDebit ? '小成本博取大回报' : '最具性价比的鸭子策略';

  const Row = ({ it }: { it: ScanLeg }) => {
    // 权利金是币本位，需要转换
    const premiumUsd = it.premium * spotPrice;

    // 根据策略类型，max_profit和max_loss的单位不同
    // 借方：max_profit是金本位(USD)，max_loss是币本位
    // 贷方：max_profit是币本位，max_loss是金本位(USD)
    const maxProfitUsd = isDebit ? it.max_profit : (it.max_profit * spotPrice);
    const maxLossUsd = isDebit ? (it.max_loss * spotPrice) : it.max_loss;

    return (
      <tr>
        <td style={{ padding: '6px 8px', borderBottom: '1px solid #eee' }}>{it.K1}</td>
        <td style={{ padding: '6px 8px', borderBottom: '1px solid #eee' }}>{it.K2}</td>
        <td style={{ padding: '6px 8px', borderBottom: '1px solid #eee' }}>
          {it.premium.toFixed(4)} (${premiumUsd.toFixed(2)})
        </td>
        <td style={{ padding: '6px 8px', borderBottom: '1px solid #eee' }}>
          ${maxProfitUsd.toFixed(2)}
        </td>
        <td style={{ padding: '6px 8px', borderBottom: '1px solid #eee' }}>
          ${maxLossUsd.toFixed(2)}
        </td>
        <td style={{ padding: '6px 8px', borderBottom: '1px solid #eee' }}>{Number.isFinite(it.odds) ? it.odds.toFixed(1) : '—'}</td>
      </tr>
    );
  };

  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16, marginBottom: 16, background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <h3 style={{ margin: 0, fontSize: 18, color: '#333' }}>{title}</h3>
        <span style={{ fontSize: 13, color: '#007bff', fontWeight: 'bold' }}>{rankLabel}</span>
      </div>
      <p style={{ margin: '0 0 12px 0', fontSize: 13, color: '#666', fontStyle: 'italic' }}>{commentary}</p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#f8f9fa' }}>
              <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>执行价1</th>
              <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>执行价2</th>
              <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>
                权利金{' '}
                <span
                  style={{ cursor: 'help', color: '#666' }}
                  title="数据过滤规则：&#10;1. 过滤单腿期权 spread_ratio > 0.5（买卖价差超过中间价50%）&#10;2. 过滤组合权利金 < $10（避免深度虚值期权）"
                >
                  🛈
                </span>
              </th>
              <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>最大收益</th>
              <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>最大亏损</th>
              <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>赔率</th>
            </tr>
          </thead>
          <tbody>
            {strategies.map((it, idx) => <Row it={it} key={idx} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
