'use client';

import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Search, Upload } from 'lucide-react';
import { api, apiFetch, messageOf } from '@/lib/client';
import { prepareImage } from '@/lib/prepare-image';
import { storeName, type ProductImageCandidate } from '@/lib/items';
import { ProductImage } from './product-image';

export function ImageInput({ image, name, size = '', url = '', candidates = [], prefix, disabled, onChange, onBusyChange }: {
  image: string; name: string; prefix: string; disabled: boolean;
  size?: string; url?: string; candidates?: ProductImageCandidate[];
  onChange: (image: string) => void; onBusyChange: (busy: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);
  const [showPhotos, setShowPhotos] = useState(false);
  const [results, setResults] = useState<{ key: string; candidates: ProductImageCandidate[]; warning?: string } | null>(null);
  const key = JSON.stringify([name, size, url]);
  const currentKey = useRef(key); currentKey.current = key;
  const photos = results?.key === key ? results.candidates : candidates;
  const searchUrl = `https://www.google.com/search?udm=2&q=${encodeURIComponent([name, size].filter(Boolean).join(' '))}`;
  async function search() {
    const started = key;
    setSearching(true); setError(''); setShowPhotos(true);
    try {
      const data = await api<{ candidates: ProductImageCandidate[]; warning?: string }>('/api/product/images', { method: 'POST', body: JSON.stringify({ name, size, url }) });
      if (currentKey.current === started) setResults({ key: started, ...data });
    } catch (error) { if (currentKey.current === started) setError(messageOf(error)); }
    finally { setSearching(false); }
  }
  useEffect(() => () => request.current?.abort(), []);

  async function upload(file: File) {
    const controller = new AbortController();
    request.current = controller;
    setUploading(true); onBusyChange(true); setError('');
    try {
      const prepared = await prepareImage(file);
      if (controller.signal.aborted) return;
      const body = new FormData();
      body.append('image', prepared, 'photo.jpg');
      const response = await apiFetch('/api/images', { method: 'POST', body, signal: controller.signal });
      const result = await response.json().catch(() => ({ error: 'The image could not be uploaded. Try again.' }));
      if (!response.ok) throw new Error(result.error || 'The image could not be uploaded. Try again.');
      if (!controller.signal.aborted) onChange(result.url);
    } catch (error) {
      if (!controller.signal.aborted) setError(messageOf(error));
    } finally {
      if (!controller.signal.aborted) { setUploading(false); onBusyChange(false); }
      if (input.current) input.current.value = '';
    }
  }

  return <details className="image-settings">
    <summary>Image {image ? 'added' : '(optional)'}</summary>
    <div className="image-edit">
      <ProductImage src={image} name={name || 'Image preview'} small/>
      <div className="image-input-fields">
        <div className="image-upload-actions">
          <button type="button" className="button secondary" disabled={disabled || uploading} onClick={() => input.current?.click()}>
            <Upload size={16}/>{uploading ? 'Uploading…' : 'Upload image'}
          </button>
          <button type="button" className="button secondary" disabled={disabled || uploading || searching || name.trim().length < 2} onClick={() => {
            if (photos.length) setShowPhotos(true); else void search();
          }}><Search size={16}/>{searching ? 'Finding photos…' : 'Find a photo'}</button>
          <input ref={input} className="sr-only" type="file" accept="image/*" tabIndex={-1}
            aria-label="Upload image" disabled={disabled || uploading}
            onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); }}/>
          {image && <button type="button" className="text-button" disabled={disabled || uploading} onClick={() => { onChange(''); setError(''); }}>Remove image</button>}
        </div>
        {uploading && <span className="sr-only" role="status">Uploading image</span>}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="field"><label htmlFor={`${prefix}-image`}>Image URL <span className="optional">(optional)</span></label>
          <input id={`${prefix}-image`} type="url" maxLength={2048} value={image} disabled={disabled || uploading} onChange={event => { onChange(event.target.value); setError(''); }}/>
        </div>
      </div>
    </div>
    {showPhotos && <div className="image-search-results" aria-label="Matching product photos">
      <div className="section-heading"><h3>Choose a photo</h3><button type="button" className="text-button" onClick={() => setShowPhotos(false)}>Close photos</button></div>
      <p className="field-help">Check the size and color before choosing. Your choice will be kept when fetching details again.</p>
      {searching && <p className="field-help" role="status">Searching for matching photos…</p>}
      {!searching && photos.length === 0 && <p className="field-help" role="status">{results?.key === key && results.warning || 'No matching photos found. Try Google Images or upload a photo.'}</p>}
      <div className="image-candidates">{photos.map(candidate => <div className="image-candidate" key={candidate.image}>
        <button type="button" className="image-choice" disabled={disabled || uploading || searching} aria-label={`Use photo of ${candidate.name} from ${storeName(candidate.sourceUrl)}`} onClick={() => { onChange(candidate.image); setShowPhotos(false); setError(''); }}>
          <ProductImage src={candidate.image} name={candidate.name}/><span>Use this photo</span>
        </button>
        <a href={candidate.sourceUrl} target="_blank" rel="noreferrer">{storeName(candidate.sourceUrl)}<ExternalLink size={12}/></a>
        <span className="field-help">{candidate.confidence === 'exact' ? 'Product and variant match' : 'Check this match'}</span>
      </div>)}</div>
      <div className="image-search-actions"><button type="button" className="text-button" disabled={disabled || uploading || searching || name.trim().length < 2} onClick={() => void search()}>Search again</button>
        <a href={searchUrl} target="_blank" rel="noreferrer">Open Google Images<ExternalLink size={12}/></a></div>
    </div>}
  </details>;
}
