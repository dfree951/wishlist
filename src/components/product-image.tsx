'use client';
import Image from 'next/image';
import { Gift } from 'lucide-react';
import { useState } from 'react';
export function ProductImage({ src, name, small = false }: { src: string; name: string; small?: boolean }) {
  const [failed, setFailed] = useState('');
  return <div className={`product-image${small ? ' small' : ''}`}>
    {src && failed !== src ? <Image src={src} alt={name} fill unoptimized sizes={small ? '64px' : '160px'} onError={() => setFailed(src)} referrerPolicy="no-referrer" />
      : <Gift size={small ? 23 : 35} strokeWidth={1.15} aria-label="No product image" />}
  </div>;
}
