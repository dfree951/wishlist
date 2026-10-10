'use client';
import Image from 'next/image';
import { Gift, RefreshCw } from 'lucide-react';
import { useState } from 'react';
export function ProductImage({ src, name, small = false, onRefresh, disabled = false }: { src: string; name: string; small?: boolean; onRefresh?: () => void; disabled?: boolean }) {
  const [failed, setFailed] = useState('');
  const content = <>
    {src && failed !== src ? <Image src={src} alt={name} fill unoptimized sizes={small ? '64px' : '160px'} onError={() => setFailed(src)} referrerPolicy="no-referrer" />
      : <Gift size={small ? 23 : 35} strokeWidth={1.15} aria-label="No product image" />}
    {onRefresh && <span className="photo-refresh-icon" aria-hidden="true"><RefreshCw size={17}/></span>}
  </>;
  return onRefresh ? <button type="button" className={`product-image photo-refresh${small ? ' small' : ''}`} onClick={onRefresh} disabled={disabled} aria-label={`Find a new photo for ${name}`}>{content}</button>
    : <div className={`product-image${small ? ' small' : ''}`}>{content}</div>;
}
