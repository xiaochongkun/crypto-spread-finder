import { useEffect, useMemo, useState } from 'react';

type DatesResp = { dates: string[] };
type ScanLeg = {
  K1: number; K2: number; premium: number; max_profit: number; max_loss: number; odds: number; pop?: number | null; quality?: string | null;
}
type Bucket = { leg_type: 'CALL'|'PUT'; side: 'DEBIT'|'CREDIT'; top: ScanLeg[]; bottom: ScanLeg[] };
type ScanResp = { asof_date: string; base: string; tenor: string; buckets: Bucket[] };

import Controls from '../components/Controls';
import ResultBucket from '../components/ResultBucket';
import AsOfBadge from '../components/AsOfBadge';

const API_BASE = process.env.NEXT_PUBLIC_BASE_PATH ? `${process.env.NEXT_PUBLIC_BASE_PATH}/api` : '/api';

export default function Home() {
  const [dates, setDates] = useState<string[]>([]);
  const [base, setBase] = useState<'BTC'|'ETH'>('BTC');
  const [date, setDate] = useState<string>('');
  const [direction, setDirection] = useState<'up'|'down'>('up');
  const [tenor, setTenor] = useState<'near'|'mid'|'far'>('near');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResp | null>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    fetch(`${API_BASE}/meta/dates`).then(r => r.json()).then((d: DatesResp) => {
      const ds = d.dates || [];
      setDates(ds);
      if (ds.length) setDate(ds[ds.length - 1]);
    }).catch(e => setError(String(e)));
  }, []);

  const doScan = async () => {
    setLoading(true); setError(''); setResult(null);
    try {
      const r = await fetch(`${API_BASE}/spread/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base, date, direction, tenor, return_per_bucket: 3 })
      });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      const data = await r.json() as ScanResp;
      setResult(data);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally { setLoading(false); }
  };

  useEffect(() => { if (date) doScan(); }, [date, base, direction, tenor]);

  const asOf = useMemo(() => result?.asof_date || date, [result, date]);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 20 }}>
      <h1>Spread Finder</h1>
      <AsOfBadge date={asOf} />
      <Controls
        base={base}
        date={date}
        dates={dates}
        direction={direction}
        tenor={tenor}
        onChangeBase={setBase}
        onChangeDate={setDate}
        onChangeDirection={setDirection}
        onChangeTenor={setTenor}
      />
      {loading && <p>Scanning…</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {result && (
        <div>
          {result.buckets.map((b, idx) => (
            <ResultBucket key={idx} bucket={b} />
          ))}
        </div>
      )}
    </div>
  );
}

