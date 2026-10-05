'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ExternalLink, Gift, Plus, Search, X } from 'lucide-react';
import { api, ApiError, messageOf, setSessionToken } from '@/lib/client';
import { lowestSameItem, matchesRecipient, money, preferenceLabels, storeName, type Item } from '@/lib/items';
import { ProductImage } from './product-image';
import { ItemForm } from './item-form';
import { AmazonImport } from './amazon-import';

function Login({ onLogin }: { onLogin:()=>void }) {
  const [password,setPassword]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  async function submit(e:React.FormEvent) {
    e.preventDefault();setBusy(true);setError('');
    try {const result=await api<{token?:string}>('/api/auth',{method:'POST',body:JSON.stringify({password})});setSessionToken(result.token||'');onLogin();}catch(e){setError(messageOf(e));}finally{setBusy(false);}
  }
  return <section className="login-panel"><p>Sign in to add or edit wish list items.</p><form onSubmit={submit}><div className="field"><label htmlFor="password">Password</label><input id="password" autoComplete="off" type="text" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={password} required disabled={busy} onChange={e=>setPassword(e.target.value)}/></div>{error&&<p className="error" role="alert">{error}</p>}<button className="button" disabled={busy}>{busy?'Signing in…':'Sign in'}</button></form><Link className="back-link" href="/">Back</Link></section>;
}

function ItemRow({ item, manage, busy, showOwner, onPurchase, onEdit, onDelete }: { item:Item;manage:boolean;showOwner:boolean;busy:boolean;onPurchase:(item:Item,value:boolean)=>void;onEdit:(item:Item)=>void;onDelete:(item:Item)=>void }) {
  const [confirmDelete,setConfirmDelete]=useState(false);
  const best=lowestSameItem(item);
  const otherPrices=item.alternatives.some(a=>a.kind==='same'&&a.price!==null&&a.currency===item.currency&&(a.packCount??1)===(item.packCount??1));
  const href=best?.url||item.url;
  return <article className={`item-row${item.purchased&&!manage?' is-purchased':''}`}>
    <ProductImage src={item.image} name={item.name}/>
    <div className="item-content"><div className="item-overline">{showOwner&&<span className={`owner-label ${item.owner.toLowerCase()}`}>{item.owner}</span>}<span className="store-label">{storeName(item.url)}</span></div>
      <h3><a href={item.url} target="_blank" rel="noreferrer">{item.name}</a></h3>
      <div className="item-facts"><span className="price">{money(item.price,item.currency)}</span>{item.size&&<span className="size">{item.size}</span>}{item.packCount!=null&&item.packCount>1&&<span className="size">{item.packCount} pack</span>}{item.preference&&<span className="size">{preferenceLabels[item.preference]}</span>}</div>
      {item.notes&&<p className="item-notes">{item.notes}</p>}
      {otherPrices&&best&&<p className="best-price">Lowest linked price: <a href={best.url} target="_blank" rel="noreferrer">{money(best.price,best.currency)} at {storeName(best.url)}</a></p>}
      {item.alternatives.length>0&&<details className="buying-options"><summary>{item.alternatives.length} other {item.alternatives.length===1?'link':'links'}<ChevronDown size={15}/></summary><div className="option-list">{item.alternatives.map(option=><div className="option-row" key={option.id}><ProductImage small src={option.image} name={option.name}/><div><span className="option-kind">{option.kind==='same'?'Alternative store':'Alternative item'}</span><a href={option.url} target="_blank" rel="noreferrer">{option.name}<ExternalLink size={12}/></a><p>{money(option.price,option.currency)}{option.size?` · ${option.size}`:''}</p><span className="field-help">{storeName(option.url)}</span></div></div>)}</div></details>}
    </div>
    <div className="item-actions">{manage?<><button className="button secondary" disabled={busy} onClick={()=>onEdit(item)}>Edit item</button>{confirmDelete?<div className="delete-confirm"><span>Remove this item?</span><button className="text-button danger" disabled={busy} onClick={()=>onDelete(item)}>Remove</button><button className="text-button" disabled={busy} onClick={()=>setConfirmDelete(false)}>Keep item</button></div>:<button className="text-button muted" disabled={busy} onClick={()=>setConfirmDelete(true)}>Remove</button>}</>:item.purchased?<><span className="purchased-label"><Check size={16}/>Purchased</span><button className="text-button muted" disabled={busy} onClick={()=>onPurchase(item,false)}>Mark not purchased</button></>:<><a className="button secondary" href={href} target="_blank" rel="noreferrer">View item<ExternalLink size={14}/></a><button className="button" disabled={busy} onClick={()=>onPurchase(item,true)}><Check size={16}/>Mark purchased</button><a className="comparison-link" href={`https://www.google.com/search?tbm=shop&q=${encodeURIComponent([item.name,item.size,item.packCount?`${item.packCount} pack`:''].filter(Boolean).join(' '))}`} target="_blank" rel="noreferrer">Compare prices<ExternalLink size={11}/></a></>}</div>
  </article>;
}

export function Wishlist({ manage=false, initialAuthenticated=false }: { manage?:boolean;initialAuthenticated?:boolean }) {
  const [authenticated,setAuthenticated]=useState(initialAuthenticated);
  const [checkingSession,setCheckingSession]=useState(manage);
  useEffect(()=>{
    if(!manage)return;
    let active=true;
    void api<{authenticated:boolean}>('/api/auth').then(result=>{if(active)setAuthenticated(result.authenticated);})
      .catch(()=>{if(active)setAuthenticated(false);}).finally(()=>{if(active)setCheckingSession(false);});
    return()=>{active=false;};
  },[manage]);
  const [items,setItems]=useState<Item[]>([]); const [loaded,setLoaded]=useState(false);
  const [owner,setOwner]=useState<'Both'|'Dan'|'Syd'>('Both'); const [query,setQuery]=useState(''); const [sort,setSort]=useState('newest');
  const [error,setError]=useState('');const [notice,setNotice]=useState(''); const [busy,setBusy]=useState(false);
  const [undo,setUndo]=useState<Item|null>(null); const [editor,setEditor]=useState<Item|'new'|null>(null); const [importing,setImporting]=useState(false);
  const generation=useRef(0); const editorAnchor=useRef<HTMLDivElement>(null);
  const load=useCallback(async (quiet=false)=>{
    const current=++generation.current;
    try{
      const result=await api<{items:Item[]}>(manage?'/api/items?view=manage':'/api/items');
      if(current===generation.current){setItems(result.items);setLoaded(true);if(!quiet)setError('');}
    }catch(e){if(current===generation.current){setError(messageOf(e));if(e instanceof ApiError&&e.status===401&&manage)setAuthenticated(false);}}
  },[manage]);
  useEffect(()=>{
    if(manage&&!authenticated)return;
    void load();
    const refresh=()=>{if(document.visibilityState==='visible')void load(true);};
    const interval=setInterval(refresh,15000);window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
    return()=>{generation.current++;clearInterval(interval);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};
  },[load,manage,authenticated]);
  useEffect(()=>{if(editor||importing)editorAnchor.current?.scrollIntoView({block:'start'});},[editor,importing]);
  async function purchase(item:Item,purchased:boolean){
    setBusy(true);setError('');setNotice('');
    try{await api(`/api/items/${item.id}/purchase`,{method:'POST',body:JSON.stringify({purchased})});setUndo(purchased?item:null);setNotice(purchased?`${item.name} marked purchased.`:`${item.name} is available again.`);await load(true);}
    catch(e){await load(true);setError(messageOf(e));}finally{setBusy(false);}
  }
  async function remove(item:Item){setBusy(true);setError('');try{await api(`/api/items/${item.id}`,{method:'DELETE',body:JSON.stringify({version:item.version})});setNotice('Item removed.');await load(true);}catch(e){setError(messageOf(e));}finally{setBusy(false);}}
  async function saved(){setEditor(null);setNotice('Wish list saved.');await load();}
  async function logout(){setBusy(true);try{await api('/api/auth',{method:'DELETE'});}catch(e){setError(messageOf(e));}finally{setSessionToken('');setAuthenticated(false);setItems([]);setLoaded(false);setEditor(null);setImporting(false);setBusy(false);}}
  const filtered=items.filter(item=>matchesRecipient(item.owner,owner)&&`${item.name} ${item.notes} ${item.size}`.toLowerCase().includes(query.toLowerCase()));
  const visible=filtered.filter(item=>manage||!item.purchased);
  if(sort==='name')visible.sort((a,b)=>a.name.localeCompare(b.name));
  if(sort==='price')visible.sort((a,b)=>a.currency.localeCompare(b.currency)||(a.price??Infinity)-(b.price??Infinity));
  const purchased=filtered.filter(item=>item.purchased);
  const renderRow=(item:Item)=><ItemRow key={item.id} item={item} showOwner={owner==='Both'} manage={manage} busy={busy||!!editor||importing} onPurchase={(item,value)=>void purchase(item,value)} onEdit={item=>{setImporting(false);setEditor(item);}} onDelete={item=>void remove(item)}/>;
  return <div className="app-shell">
    <main id="main-content">{checkingSession?<p role="status">Checking sign-in…</p>:manage&&!authenticated?<Login onLogin={()=>{setAuthenticated(true);setError('');}}/>:<>
      <div className="page-heading"><div><h1 className="page-title"><span>Syd &amp; Dan</span>{' '}<span>Wish List</span></h1></div>{manage?<div className="heading-actions"><button className="button secondary" disabled={!!editor||importing} onClick={()=>{setImporting(true);setEditor(null);}}>Import Amazon list</button><button className="button" disabled={!!editor||importing} onClick={()=>{setEditor('new');setImporting(false);}}><Plus size={17}/>Add item</button></div>:null}</div>

      <div ref={editorAnchor} className="editor-anchor">{editor&&<ItemForm key={typeof editor==='string'?editor:editor.id} item={typeof editor==='string'?undefined:editor} owner="Both" onSave={saved} onCancel={()=>setEditor(null)}/>} {importing&&<AmazonImport initialOwner="Both" onCancel={()=>setImporting(false)} onDone={async message=>{setImporting(false);setNotice(message);await load();}}/>}</div>
      <div className="list-toolbar"><div className="person-tabs" role="group" aria-label="Whose wish list">{(['Both','Syd','Dan'] as const).map(person=><button key={person} aria-pressed={owner===person} className={owner===person?'selected':''} onClick={()=>setOwner(person)}>{person==='Both'?'Both lists':person}<span>{loaded?items.filter(i=>matchesRecipient(i.owner,person)&&(manage||!i.purchased)).length:'–'}</span></button>)}</div>
        <div className="list-tools"><div className="search-field"><Search size={16}/><label className="sr-only" htmlFor="search">Search wish lists</label><input id="search" type="search" value={query} onChange={e=>setQuery(e.target.value)}/></div><label className="sr-only" htmlFor="sort">Sort items</label><select id="sort" value={sort} onChange={e=>setSort(e.target.value)}><option value="newest">Recently added</option><option value="price">Price: low to high</option><option value="name">Name: A to Z</option></select></div></div>
      {error&&<div className="error notice" role="alert"><span>{error}</span><button className="text-button" onClick={()=>void load()}>Retry</button></div>}
      {notice&&<div className="notice success" role="status"><span>{notice}</span><div className="notice-actions">{undo&&!manage&&<button className="text-button" disabled={busy} onClick={()=>void purchase(undo,false)}>Undo</button>}<button className="icon-button" aria-label="Dismiss message" onClick={()=>{setNotice('');setUndo(null);}}><X size={16}/></button></div></div>}
      {!loaded&&!error?<div className="loading-state" role="status">Loading wish lists…<div/><div/></div>:loaded&&<>
        {visible.length?<section className="items" aria-label="Wish list items">{visible.map(renderRow)}</section>:<section className="empty-state"><Gift size={36} strokeWidth={1.15}/><h2>{query?'No matching items':items.length===0?'No items yet':purchased.length?'Everything on this list is purchased':`No items for ${owner==='Both'?'either list':owner} yet`}</h2>{(query||(!manage&&purchased.length>0))&&<p>{query?'Try another name or clear the search.':'You can find purchased gifts in the section below.'}</p>}{query&&<button className="text-button" onClick={()=>setQuery('')}>Clear search</button>}{manage&&!query&&!editor&&!importing&&<button className="button" onClick={()=>setEditor('new')}><Plus size={16}/>Add an item</button>}</section>}
        {!manage&&<details className="purchased-section"><summary><div><Check size={18}/><span>Purchased</span><span className="purchased-count">{purchased.length}</span></div><ChevronDown size={19}/></summary><div>{purchased.length?purchased.map(renderRow):<p className="purchased-empty">{query?'No purchased items match your search.':'No gifts marked purchased on this list yet.'}</p>}</div></details>}
      </>}
    </>}</main>
      {manage&&authenticated&&<nav className="owner-nav owner-nav-bottom" aria-label="View controls"><Link href="/gifts" prefetch={false}>Enter gift-giver view<ExternalLink size={12}/></Link><button className="text-button muted" disabled={busy} onClick={()=>void logout()}>Sign out</button></nav>}
  </div>;
}
