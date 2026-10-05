import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProductHtml, parsePrice, publicAddress, validateFetchUrl, readHtml, fetchProduct } from '../src/lib/product-fetch';
import { Response, type fetch } from 'undici';
import { parseAmazonList, amazonListUrl, amazonProductKey } from '../src/lib/amazon';
import { itemSchema, lowestSameItem, matchesRecipient, normalizeName } from '../src/lib/items';

test('product importer reads nested JSON-LD with image, exact offer and size',()=>{
  const html=`<script type="application/ld+json">${JSON.stringify({'@graph':[{'@type':'Product',name:'  WOOL   SWEATER ',image:[{url:'/sweater.jpg'}],size:'Medium',offers:{'@type':'Offer',price:'79.95',priceCurrency:'USD'}}]})}</script>`;
  const p=parseProductHtml(html,'https://shop.example.com/sweater');
  assert.equal(p.name,'Wool Sweater');assert.equal(p.price,79.95);assert.equal(p.size,'Medium');assert.equal(p.image,'https://shop.example.com/sweater.jpg');assert.ok(p.checkedAt);
});
test('metadata fallback and missing prices are explicit; ranges are not exact prices',()=>{
  const p=parseProductHtml('<meta property="og:title" content="iPhone Case"><meta property="og:image" content="https://example.com/case.jpg"><script type="application/ld+json">{"@type":"Product","offers":{"@type":"AggregateOffer","lowPrice":10,"highPrice":100}}</script>','https://example.com/case');
  assert.equal(p.name,'iPhone Case');assert.equal(p.price,null);assert.match(p.warning!,/price/);
  assert.equal(parseProductHtml('<meta property="product:price:amount" content="0.00">','https://example.com/').price,0);
});
test('prices handle common formats and missing values',()=>{
  assert.equal(parsePrice('$1,249.95'),1249.95);assert.equal(parsePrice('1.249,95 €'),1249.95);assert.equal(parsePrice('29,99'),29.99);assert.equal(parsePrice(''),null);assert.equal(parsePrice('Unavailable'),null);
});

test('fixed USD prices never relabel a foreign-currency amount as dollars',()=>{
  const product=parseProductHtml('<meta property="product:price:amount" content="25"><meta property="product:price:currency" content="GBP">','https://example.com/product');
  assert.equal(product.currency,'USD');
  assert.equal(product.price,null);
  assert.equal(itemSchema.safeParse({owner:'Dan',name:'Item',url:'https://example.com',price:25,currency:'GBP'}).success,false);
});
test('rejects private networks, mapped IPs, credentials, and non-web URLs',()=>{
  for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','192.168.1.1','172.16.1.1','::1','::ffff:127.0.0.1','fc00::1','0.0.0.0','100.64.0.1'])assert.equal(publicAddress(ip),false,ip);
  assert.equal(publicAddress('8.8.8.8'),true);
  for(const url of ['http://127.0.0.1','http://[::1]','http://localhost','file:///etc/passwd','https://a:b@example.com','https://example.com:8000'])assert.throws(()=>validateFetchUrl(url));
  assert.equal(validateFetchUrl('https://example.com/product').hostname,'example.com');
});
test('Amazon parser excludes recommendations and deduplicates product rows',()=>{
  const html=`<h1 id="profile-list-name">My list</h1><li id="item_ABC" data-id="ABC"><a id="itemName_ABC" title="Coffee Grinder" href="/dp/B012345678/ref=wl">Coffee Grinder</a><img src="https://m.media-amazon.com/images/grinder.jpg"><span id="itemPrice_ABC">$59.99</span></li><li id="item_DEF"><a href="/dp/B012345678">Coffee Grinder</a></li><a href="/dp/B999999999">Recommended item</a>`;
  const result=parseAmazonList(html,'https://www.amazon.com/hz/wishlist/ls/ABC');
  assert.equal(result.items.length,1);assert.equal(result.items[0].price,59.99);assert.equal(result.items[0].url,'https://www.amazon.com/dp/B012345678');assert.equal(result.title,'My list');
  assert.throws(()=>amazonListUrl('https://amazon.com.evil.example/hz/wishlist/ls/ABC'));
  assert.throws(()=>amazonListUrl('https://www.amazon.com/dp/B012345678'));
  assert.equal(amazonProductKey('https://www.amazon.com/dp/B012345678/ref=abc?tag=x'),amazonProductKey('https://amazon.com/gp/product/B012345678'));
});
test('comparisons use matching currency and same-item links only',()=>{
  const item=itemSchema.parse({owner:'Dan',name:'Coffee Grinder',url:'https://example.com/item',price:80,currency:'USD',alternatives:[{id:'982ffb99-e44d-49b5-b681-2ee1a6a83205',kind:'alternative',name:'Different grinder',url:'https://example.com/alt',price:10,currency:'USD'},{id:'6a875bda-9d7c-4647-9cc9-4af8723b0555',kind:'same',name:'Coffee Grinder',url:'https://example.com/same',price:60,currency:'USD'}]});
  assert.equal(lowestSameItem(item)?.price,60);assert.equal(normalizeName('iPhone 16 Case'),'iPhone 16 Case');
  assert.equal(itemSchema.safeParse({...item,url:'javascript:alert(1)'}).success,false);
});

const amazonProduct = `<title>Amazon.com: Samsung SSD : Electronics</title>
  <aside><span class="a-price"><span class="a-offscreen">$9.99</span></span></aside>
  <span id="productTitle">Samsung SSD 990 PRO 2TB</span>
  <img id="landingImage" src="https://m.media-amazon.com/small.jpg" data-old-hires="https://m.media-amazon.com/large.jpg">
  <div id="corePriceDisplay_desktop_feature_div"><span class="a-price a-text-price"><span class="a-offscreen">$499.99</span></span><span class="a-price priceToPay"><span class="a-offscreen">$389.99</span></span></div>
  <span id="inline-twister-expanded-dimension-text-size_name">2TB</span>
  <span id="inline-twister-expanded-dimension-text-style_name">990 PRO</span>`;
const amazonUrl = 'https://www.amazon.com/Samsung-SSD-990-PCIe-2280/dp/B0BHJJ9Y77?th=1';

test('shared gifts validate and appear once in each applicable list',()=>{
  const shared=itemSchema.parse({owner:'Both',name:'Shared gift',url:'https://example.com/gift',price:null});
  const recipients=[shared.owner,'Dan','Syd'] as const;
  assert.deepEqual(recipients.filter(owner=>matchesRecipient(owner,'Dan')),['Both','Dan']);
  assert.deepEqual(recipients.filter(owner=>matchesRecipient(owner,'Syd')),['Both','Syd']);
  assert.deepEqual(recipients.filter(owner=>matchesRecipient(owner,'Both')),['Both','Dan','Syd']);
});

test('Amazon product extraction uses main image, selected variant, and current product price',()=>{
  const product=parseProductHtml(amazonProduct,amazonUrl);
  assert.equal(product.name,'Samsung SSD 990 PRO 2TB');assert.equal(product.price,389.99);
  assert.equal(product.image,'https://m.media-amazon.com/large.jpg');assert.equal(product.size,'2TB, 990 PRO');
  const missingPrice=parseProductHtml(amazonProduct.replace(/<div id="corePriceDisplay_desktop_feature_div">.*?<\/div>/s,''),amazonUrl);
  assert.equal(missingPrice.price,null);assert.match(missingPrice.warning!,/price/);
});

test('large product pages stop downloading after the useful prefix',async()=>{
  const prefix=Buffer.from(amazonProduct+'<!--'+'x'.repeat(1_050_000)+'-->');
  let pulls=0;let cancelled=false;
  const stream=new ReadableStream<Uint8Array>({pull(controller){pulls++;controller.enqueue(pulls===1?prefix:Buffer.alloc(3_000_000,32));},cancel(){cancelled=true;}},{highWaterMark:0});
  const html=await readHtml(stream.getReader(),{allowPartial:true,enough:html=>{const p=parseProductHtml(html,amazonUrl);return Boolean(p.name&&p.image&&p.price!==null);}});
  assert.equal(pulls,1);assert.equal(cancelled,true);assert.equal(parseProductHtml(html,amazonUrl).price,389.99);
});

test('the hard cap preserves partial product details instead of rejecting the whole page',async()=>{
  const prefix='<meta property="og:title" content="Large page product"><meta property="og:image" content="https://example.com/photo.jpg">';
  const huge=Buffer.from(prefix+'<!--'+'x'.repeat(6_100_000));
  const stream=new ReadableStream<Uint8Array>({start(c){c.enqueue(huge);c.close();}});
  const html=await readHtml(stream.getReader(),{allowPartial:true});
  assert.ok(Buffer.byteLength(html)<=6_000_000);
  const product=parseProductHtml(html,'https://example.com/product');
  assert.equal(product.name,'Large page product');assert.equal(product.price,null);assert.match(product.warning!,/price/);
  const strict=new ReadableStream<Uint8Array>({start(c){c.enqueue(huge);c.close();}});
  await assert.rejects(readHtml(strict.getReader()),/too large/);
});

test('stream errors preserve complete fields but not an unfinished price',async()=>{
  let pulls=0;
  const stream=new ReadableStream<Uint8Array>({pull(c){if(pulls++===0)c.enqueue(Buffer.from('<span id="productTitle">Samsung SSD</span><div id="corePrice_feature_div"><span class="a-price"><span class="a-offscreen">$389.'));else c.error(new Error('Timed out'));}},{highWaterMark:0});
  const html=await readHtml(stream.getReader(),{allowPartial:true});
  const product=parseProductHtml(html,amazonUrl);
  assert.equal(product.name,'Samsung SSD');assert.equal(product.price,null);
});

test('Amazon short links parse the final destination, including selected size and single pack', async () => {
  const short = 'https://a.co/d/0dXglrCs';
  const destination = 'https://www.amazon.com/dp/B00K4JSWPM';
  const visited: string[] = [];
  // Relevant markup from the reported listing; the blank main price also occurs
  // on Amazon pages that render a separate one-time purchase buy box.
  const html = `<title>Amazon.com : Best Maid Hamburger Slices : Grocery</title>
    <span id="productTitle">Best Maid Hamburger Slices 80oz Pickles</span>
    <img id="landingImage" src="https://m.media-amazon.com/pickles.jpg">
    <div id="corePriceDisplay_desktop_feature_div"><span class="priceToPay"><span class="a-offscreen"> </span></span></div>
    <div id="corePrice_feature_div"><span class="a-price"><span class="a-offscreen">$20.99</span></span></div>
    <span id="inline-twister-expanded-dimension-text-size_name">1 Pack (80 Fl Oz)</span>`;
  const request: typeof fetch = async input => {
    visited.push(String(input));
    return String(input) === short ? new Response(null, { status: 301, headers: { location: destination } })
      : new Response(html + '<!--' + 'x'.repeat(1_050_000) + '-->', { headers: { 'Content-Type': 'text/html' } });
  };
  const product = await fetchProduct(short, request);
  assert.deepEqual(visited, [short, destination]);
  assert.equal(product.name, 'Best Maid Hamburger Slices 80oz Pickles');
  assert.equal(product.price, 20.99);
  assert.equal(product.packCount, 1);
  assert.equal(product.size, '80 Fl Oz');
  assert.equal(product.url, destination);
  assert.equal(product.warning, undefined);
});

test('short-link redirects still reject private destinations', async () => {
  let requests = 0;
  const request: typeof fetch = async () => { requests++; return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } }); };
  await assert.rejects(fetchProduct('https://a.co/d/example', request), /public store link/);
  assert.equal(requests, 1);
});
