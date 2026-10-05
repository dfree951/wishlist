'use client';
import { useRef, useState } from 'react';
import { ArrowDownToLine, Plus, X } from 'lucide-react';
import { api, messageOf } from '@/lib/client';
import { itemSchema, preferenceLabels, type Item, type ItemData, type Recipient, type BuyingOption, type ProductDetails, type ProductMatch } from '@/lib/items';
import { ImageInput } from './image-input';
import { ProductSearch } from './product-search';
import { mergeProductDetails, withProductUrl, type ProductFields } from '@/lib/product-editor';

export const emptyItem = (owner: Recipient): ItemData => ({ owner, preference: null, name: '', url: '', image: '', imageSource: 'automatic', price: null, currency: 'USD', size: '', packCount: null, notes: '', checkedAt: null, alternatives: [] });
function ProductEditor({ value, onChange, prefix, disabled, onUploadBusyChange, notes = '' }: { value: ProductFields; onChange: (next: ProductFields) => void; prefix: string; disabled: boolean; onUploadBusyChange: (busy: boolean) => void; notes?: string }) {
  const [fetching, setFetching] = useState(false);
  const [feedback, setFeedback] = useState('');
  const lastAuto = useRef(value.url);
  const detailsUrl = useRef(value.url);
  const valueRef = useRef(value); valueRef.current = value;
  const patch = (changes: Partial<ProductFields>) => onChange({ ...valueRef.current, ...changes });
  function changeUrl(url: string) {
    const next = withProductUrl(valueRef.current, url, detailsUrl.current);
    if (detailsUrl.current.trim() !== url.trim()) detailsUrl.current = '';
    onChange(next); setFeedback('');
  }
  async function lookup(automatic = false) {
    const current = valueRef.current;
    if (!current.url.trim() || fetching || disabled) return;
    if (automatic && lastAuto.current === current.url) return;
    try { new URL(current.url); } catch { return; }
    lastAuto.current = current.url;
    const requestedUrl = current.url;
    detailsUrl.current = requestedUrl;
    setFetching(true); setFeedback('');
    try {
      const { product } = await api<{product: ProductDetails}>('/api/product', { method: 'POST', body: JSON.stringify({ url: requestedUrl, name: current.name }) });
      if (valueRef.current.url !== requestedUrl) return;
      onChange(mergeProductDetails(valueRef.current, current, product));
      setFeedback(product.warning || 'Details imported. Check the size and price before saving.');
    } catch (e) { if (valueRef.current.url === requestedUrl) setFeedback(messageOf(e)); }
    finally { setFetching(false); }
  }
  async function chooseMatch(match: ProductMatch) {
    lastAuto.current = match.url;
    // The chosen store link is useful even when that store blocks metadata fetching.
    const current = withProductUrl(valueRef.current, match.url, detailsUrl.current);
    detailsUrl.current = match.url;
    onChange(current);
    setFetching(true); setFeedback('');
    try {
      const { product } = await api<{ product: ProductDetails }>('/api/product', { method: 'POST', body: JSON.stringify({ url: match.url, name: match.name.slice(0, 200) }) });
      const latest = valueRef.current;
      if (latest.url !== match.url) return;
      onChange(mergeProductDetails(latest, current, { ...product, name: product.name || match.name }, true));
      setFeedback(product.warning || 'Link and available details added.');
    } catch {
      if (valueRef.current.url === match.url) setFeedback('Product link added. The store could not provide other details.');
    } finally { setFetching(false); }
  }
  return <div className="product-fields">
    <div className="field"><label htmlFor={`${prefix}-url`}>Product link <span className="required">*</span></label>
      <div className="url-input"><input id={`${prefix}-url`} type="url" required maxLength={2048} value={value.url} disabled={disabled} onChange={e => changeUrl(e.target.value)} onBlur={() => void lookup(true)} />
        <button className="button secondary" type="button" disabled={fetching || disabled || !value.url} onClick={() => void lookup()}><ArrowDownToLine size={16}/>{fetching ? 'Fetching…' : 'Fetch details'}</button></div>
    </div>
    {feedback && <p className="form-notice" role="status">{feedback}</p>}
    <div className="field"><label htmlFor={`${prefix}-name`}>Item name <span className="required">*</span></label><input id={`${prefix}-name`} required maxLength={200} value={value.name} disabled={disabled} onChange={e=>patch({name:e.target.value})}/></div>
    <ProductSearch name={value.name} size={[value.size, value.packCount ? `${value.packCount} pack` : ''].filter(Boolean).join(' ').slice(0,100)} notes={notes} disabled={disabled || fetching} onSelect={chooseMatch}/>
    <div className="field-grid two">
      <div className="field"><label htmlFor={`${prefix}-price`}>Price <span className="optional">(optional)</span></label><input id={`${prefix}-price`} type="number" min="0" max="1000000" step="0.01" value={value.price ?? ''} disabled={disabled} onChange={e=>patch({price:e.target.value === '' ? null : Number(e.target.value), checkedAt:null})}/></div>
      <div className="field"><label htmlFor={`${prefix}-size`}>Size / color <span className="optional">(optional)</span></label><input id={`${prefix}-size`} maxLength={100} value={value.size} disabled={disabled} onChange={e=>patch({size:e.target.value})}/></div>
      <div className="field"><label htmlFor={`${prefix}-pack`}>Quantity <span className="optional">(optional)</span></label><input id={`${prefix}-pack`} type="number" min="1" max="9999" step="1" inputMode="numeric" value={value.packCount ?? ''} disabled={disabled} onChange={e=>patch({packCount:e.target.value === '' ? null : Number(e.target.value)})}/></div>
    </div>
    <ImageInput prefix={prefix} image={value.image} name={value.name} disabled={disabled || fetching}
      onChange={image => patch({image, imageSource: image ? 'manual' : 'automatic'})} onBusyChange={onUploadBusyChange}/>
  </div>;
}

export function ItemForm({ item, owner, onSave, onCancel }: { item?: Item; owner: Recipient; onSave: () => Promise<void>; onCancel: () => void }) {
  const [value, setValue] = useState<ItemData>(item || emptyItem(owner));
  const [saving, setBusy] = useState(false);
  const [uploads, setUploads] = useState(0);
  const busy = saving || uploads > 0;
  const uploadBusyChange = (uploading: boolean) => setUploads(count => Math.max(0, count + (uploading ? 1 : -1)));
  const [error, setError] = useState('');
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (busy) return; setError('');
    const result = itemSchema.safeParse(value);
    if (!result.success) { setError(result.error.issues[0].message); return; }
    setBusy(true);
    try {
      await api(item ? `/api/items/${item.id}` : '/api/items', { method: item ? 'PUT' : 'POST', body: JSON.stringify(item ? {data:result.data,version:item.version} : result.data) });
      await onSave();
    } catch(e) { setError(messageOf(e)); setBusy(false); }
  }
  function alternativeChange(index: number, next: BuyingOption) { setValue(v => ({...v, alternatives:v.alternatives.map((a,i)=>i===index?next:a)})); }
  return <section className="editor-panel" aria-labelledby="item-form-heading">
    <div className="section-heading"><h2 id="item-form-heading">{item ? 'Edit item' : 'Add an item'}</h2><button className="icon-button" aria-label="Close item form" disabled={busy} onClick={onCancel}><X size={20}/></button></div>
    <form onSubmit={save}>
      <div className="field recipient-field"><label htmlFor="item-owner">For</label><select id="item-owner" value={value.owner} disabled={busy} onChange={e=>setValue(v=>({...v, owner:e.target.value as Recipient}))}><option>Both</option><option>Syd</option><option>Dan</option></select></div>
      <ProductEditor onUploadBusyChange={uploadBusyChange} prefix="main" value={value} notes={value.notes} disabled={busy} onChange={next=>setValue(v=>({...v,...next}))}/>
      <div className="field"><label htmlFor="item-preference">Preference <span className="optional">(optional)</span></label><select id="item-preference" value={value.preference || ''} disabled={busy} onChange={e=>setValue(v=>({...v, preference: e.target.value as ItemData['preference'] || null}))}><option value="">Not specified</option><option value="exact">{preferenceLabels.exact}</option><option value="alternatives">{preferenceLabels.alternatives}</option></select></div>
      <div className="field notes-field"><label htmlFor="item-notes">Notes <span className="optional">(optional)</span></label><textarea id="item-notes" rows={3} maxLength={2000} value={value.notes} disabled={busy} onChange={e=>setValue(v=>({...v, notes:e.target.value}))}/></div>
      <div className="alternatives-heading"><div><h3>Other links</h3><p className="field-help">Alternative item or alternative store</p></div>
        <button type="button" className="text-button" disabled={busy || value.alternatives.length >= 10} onClick={()=>setValue(v=>({...v,alternatives:[...v.alternatives,{...emptyItem(v.owner),id:crypto.randomUUID(),kind:'alternative'}]}))}><Plus size={16}/>Add a link</button></div>
      {value.alternatives.map((a,i)=><fieldset className="alternative-editor" key={a.id} disabled={busy}><legend>Link {i+1}</legend><div className="alternative-toolbar"><label htmlFor={`kind-${a.id}`}>Link type</label><select id={`kind-${a.id}`} value={a.kind} onChange={e=>alternativeChange(i,{...a,kind:e.target.value as 'same'|'alternative'})}><option value="alternative">Alternative item</option><option value="same">Alternative store</option></select><button type="button" className="icon-button" aria-label={`Remove link ${i+1}`} onClick={()=>setValue(v=>({...v,alternatives:v.alternatives.filter(x=>x.id!==a.id)}))}><X size={18}/></button></div><ProductEditor onUploadBusyChange={uploadBusyChange} prefix={`option-${a.id}`} value={a} disabled={busy} onChange={next=>alternativeChange(i,{...a,...next})}/></fieldset>)}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="form-actions"><button className="button" disabled={busy} type="submit">{uploads > 0 ? 'Uploading image…' : saving ? 'Saving…' : item ? 'Save changes' : 'Add item'}</button><button className="button secondary" disabled={busy} type="button" onClick={onCancel}>Cancel</button></div>
    </form>
  </section>;
}
