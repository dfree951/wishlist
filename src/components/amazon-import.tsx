'use client';
import { useState } from 'react';
import { X } from 'lucide-react';
import { api, messageOf } from '@/lib/client';
import { money, type ProductDetails, type Recipient } from '@/lib/items';
import { ProductImage } from './product-image';
type Candidate = ProductDetails & { selected: boolean };
export function AmazonImport({ initialOwner, onDone, onCancel }: { initialOwner:Recipient; onDone:(message:string)=>Promise<void>; onCancel:()=>void }) {
  const [owner,setOwner]=useState(initialOwner);
  const [url,setUrl]=useState('');
  const [file,setFile]=useState<File|null>(null);
  const [items,setItems]=useState<Candidate[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [warning,setWarning]=useState('');
  async function preview(e:React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(''); setItems([]);
    try {
      if(file && file.size>2_900_000) throw new Error('Choose an HTML file smaller than 3 MB.');
      const result=await api<{items:ProductDetails[];warning:string}>('/api/amazon',{method:'POST',body:JSON.stringify({url,html:file?await file.text():undefined})});
      setItems(result.items.map(item=>({...item,selected:true})));setWarning(result.warning);
    } catch(e) { setError(messageOf(e)); } finally {setBusy(false);}
  }
  async function save() {
    setBusy(true);setError('');
    try {
      const result=await api<{imported:number;skipped:number}>('/api/amazon/import',{method:'POST',body:JSON.stringify({items:items.filter(i=>i.selected).map(i=>({...i,owner,notes:'',alternatives:[]}))})});
      await onDone(`Imported ${result.imported} ${result.imported===1?'item':'items'} for ${owner}.${result.skipped?` ${result.skipped} already on the list.`:''}`);
    }catch(e){setError(messageOf(e));setBusy(false);}
  }
  const count=items.filter(i=>i.selected).length;
  return <section className="editor-panel" aria-labelledby="amazon-heading"><div className="section-heading"><h2 id="amazon-heading">Import an Amazon list</h2><button className="icon-button" aria-label="Close Amazon import" disabled={busy} onClick={onCancel}><X size={20}/></button></div>
    <form onSubmit={preview}><div className="field recipient-field"><label htmlFor="import-owner">Import for</label><select id="import-owner" value={owner} disabled={busy} onChange={e=>setOwner(e.target.value as Recipient)}><option>Both</option><option>Syd</option><option>Dan</option></select></div>
      <div className="field"><label htmlFor="amazon-url">Amazon list link</label><input id="amazon-url" type="url" required value={url} disabled={busy} onChange={e=>setUrl(e.target.value)}/></div>
      <details className="import-fallback"><summary>Use a saved Amazon page</summary><p className="field-help">If Amazon blocks the link, open the list in your browser, scroll to load the items, then save the page as HTML (Ctrl+S or ⌘S). Upload that HTML file here. Keep the list link above.</p><label htmlFor="amazon-file">Saved list page</label><input id="amazon-file" type="file" accept=".html,.htm,text/html" disabled={busy} onChange={e=>setFile(e.target.files?.[0]||null)}/>{file && <button type="button" className="text-button" onClick={()=>{setFile(null);const input=document.getElementById('amazon-file') as HTMLInputElement;input.value='';}}>Remove file</button>}</details>
      <button className="button secondary" disabled={busy}>{busy&&!items.length?'Reading list…':'Preview items'}</button>
    </form>
    {error&&<p className="error" role="alert">{error}</p>}
    {items.length>0&&<div className="import-preview"><p className="form-notice">{warning}</p><div className="section-heading"><h3>{items.length} items found</h3><button className="text-button" disabled={busy} onClick={()=>setItems(v=>v.map(i=>({...i,selected:count!==items.length})))}>{count===items.length?'Deselect all':'Select all'}</button></div>
      <div className="import-items">{items.map((item,index)=><div className="import-row" key={item.url}><input type="checkbox" aria-label={`Import ${item.name}`} checked={item.selected} disabled={busy} onChange={e=>setItems(v=>v.map((i,n)=>n===index?{...i,selected:e.target.checked}:i))}/><ProductImage src={item.image} name={item.name} small/><div className="import-details"><label className="sr-only" htmlFor={`import-name-${index}`}>Name for imported item {index+1}</label><input id={`import-name-${index}`} value={item.name} disabled={busy} onChange={e=>setItems(v=>v.map((i,n)=>n===index?{...i,name:e.target.value}:i))}/><span className="field-help">{money(item.price,item.currency)}</span>{item.packCount!=null&&item.packCount>1&&<span className="field-help">{item.packCount} pack</span>}<label className="sr-only" htmlFor={`import-size-${index}`}>Size / color for imported item {index+1}</label><input id={`import-size-${index}`} value={item.size} disabled={busy} onChange={e=>setItems(v=>v.map((i,n)=>n===index?{...i,size:e.target.value}:i))}/></div></div>)}</div>
      <div className="form-actions"><button className="button" disabled={busy||!count} onClick={()=>void save()}>{busy?'Importing…':`Import ${count} ${count===1?'item':'items'} for ${owner}`}</button><button className="button secondary" disabled={busy} onClick={onCancel}>Cancel</button></div></div>}
  </section>;
}
