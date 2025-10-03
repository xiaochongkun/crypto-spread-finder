type ScanLeg = {
  K1: number; K2: number; premium: number; max_profit: number; max_loss: number; odds: number; pop?: number | null; quality?: string | null;
}
type Bucket = { leg_type: 'CALL'|'PUT'; side: 'DEBIT'|'CREDIT'; top: ScanLeg[]; bottom: ScanLeg[] };

export default function ResultBucket({ bucket }: { bucket: Bucket }) {
  const title = `${bucket.leg_type} ${bucket.side}`;
  const Row = ({ it }: { it: ScanLeg }) => (
    <tr>
      <td>{it.K1}</td>
      <td>{it.K2}</td>
      <td>{it.premium.toFixed(4)}</td>
      <td>{it.max_profit.toFixed(4)}</td>
      <td>{it.max_loss.toFixed(4)}</td>
      <td>{Number.isFinite(it.odds) ? it.odds.toFixed(3) : '—'}</td>
      <td>{it.pop != null ? (it.pop * 100).toFixed(1) + '%' : '—'}</td>
      <td>{it.quality || 'ok'}</td>
    </tr>
  );

  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, marginBottom: 16 }}>
      <h3 style={{ margin: '4px 0 8px' }}>{title}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <h4 style={{ margin: 0 }}>Top</h4>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th>K1</th><th>K2</th><th>Premium</th><th>Max Profit</th><th>Max Loss</th><th>Odds</th><th>POP</th><th>Q</th>
              </tr>
            </thead>
            <tbody>
              {bucket.top.map((it, idx) => <Row it={it} key={idx} />)}
            </tbody>
          </table>
        </div>
        <div>
          <h4 style={{ margin: 0 }}>Bottom</h4>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th>K1</th><th>K2</th><th>Premium</th><th>Max Profit</th><th>Max Loss</th><th>Odds</th><th>POP</th><th>Q</th>
              </tr>
            </thead>
            <tbody>
              {bucket.bottom.map((it, idx) => <Row it={it} key={idx} />)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

