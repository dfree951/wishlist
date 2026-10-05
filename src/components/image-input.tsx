'use client';

import { useEffect, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { apiFetch, messageOf } from '@/lib/client';
import { prepareImage } from '@/lib/prepare-image';
import { ProductImage } from './product-image';

export function ImageInput({ image, name, prefix, disabled, onChange, onBusyChange }: {
  image: string; name: string; prefix: string; disabled: boolean;
  onChange: (image: string) => void; onBusyChange: (busy: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
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
  </details>;
}
