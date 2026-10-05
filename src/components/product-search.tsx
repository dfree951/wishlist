'use client';
import { useRef, useState } from 'react';
import { Search, ExternalLink } from 'lucide-react';
import { api, messageOf } from '@/lib/client';
import { storeName, type ProductMatch } from '@/lib/items';

export function ProductSearch({ name, size, notes = '', disabled, onSelect }: {
  name: string; size: string; notes?: string; disabled: boolean; onSelect: (match: ProductMatch) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ key: string; matches: ProductMatch[] } | null>(null);
  const [error, setError] = useState('');
  const key = JSON.stringify([name.trim(), size.trim(), notes.slice(0, 500).trim()]);
  const latestKey = useRef(key); latestKey.current = key;
  const current = result?.key === key ? result : null;
  async function search() {
    setBusy(true); setError(''); setResult(null);
    const started = key;
    try {
      const data = await api<{ matches: ProductMatch[] }>('/api/product/search', {
        method: 'POST', body: JSON.stringify({ name, size, notes: notes.slice(0, 500) }),
      });
      if (latestKey.current === started) setResult({ key: started, matches: data.matches });
    } catch (error) { if (latestKey.current === started) setError(messageOf(error)); }
    finally { setBusy(false); }
  }
  const searchUrl = `https://www.google.com/search?tbm=shop&q=${encodeURIComponent([name, size, notes.slice(0, 500)].filter(Boolean).join(' '))}`;
  return <div className="product-search">
    <button type="button" className="button secondary" disabled={disabled || busy || name.trim().length < 2} onClick={() => void search()}><Search size={16}/>{busy ? 'Searching…' : 'Find details by name'}</button>
    {error && <p className="error" role="alert">{error} <a href={searchUrl} target="_blank" rel="noreferrer">Open shopping search</a></p>}
    {current && <div className="search-results" aria-label="Product matches">
      <div className="section-heading"><h3>{current.matches.length ? 'Choose an item' : 'No matching items found'}</h3><button type="button" className="text-button" onClick={() => setResult(null)}>Close results</button></div>
      {current.matches.map(match => <div className="search-result" key={match.url}>
        <div><a href={match.url} target="_blank" rel="noreferrer">{match.name}<ExternalLink size={12}/></a><span className="field-help">{storeName(match.url)}</span>{match.snippet && <p>{match.snippet}</p>}</div>
        <button type="button" className="button secondary" disabled={disabled || busy} onClick={async () => { setBusy(true); try { await onSelect(match); setResult(null); } finally { setBusy(false); } }}>Use this item</button>
      </div>)}
      <a className="text-button" href={searchUrl} target="_blank" rel="noreferrer">Open shopping search<ExternalLink size={12}/></a>
    </div>}
  </div>;
}
