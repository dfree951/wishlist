import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBingEntries, parseSearchEntries, parseSearchResults, productQuery } from '../src/lib/product-search';

test('search query includes the name and entered size and notes',()=>{
  assert.equal(productQuery({name:' Best Maid Pickles ',size:'32 oz',notes:'  dill   not spicy '}),'Best Maid Pickles 32 oz dill not spicy');
  assert.equal(productQuery({name:'Best Maid Pickles'}),'Best Maid Pickles');
});

test('public search thumbnails and Bing redirect URLs are validated', () => {
  const url = 'https://www.crateandbarrel.com/glass/s544517';
  const encoded = 'a1' + Buffer.from(url).toString('base64url');
  const html = `<li class="b_algo"><img src="https://example.com/favicon.png"><h2><a href="https://www.bing.com/ck/a?u=${encoded}">Glass</a></h2><div class="b_caption"><p>Price: $14.95</p></div><div class="b_thumb"><img src="https://example.com/glass.jpg"></div></li>`;
  assert.deepEqual(parseBingEntries(html), [{ name: 'Glass', url, snippet: 'Price: $14.95', image: 'https://example.com/glass.jpg' }]);
  assert.deepEqual(parseBingEntries(html.replace(encoded, 'a1' + Buffer.from('http://127.0.0.1/private').toString('base64url'))), []);
  const ddg = `<div class="result"><a class="result__a" href="${url}">Glass</a><img class="result__image" src="http://127.0.0.1/private"></div>`;
  assert.equal(parseSearchEntries(ddg)[0].image, undefined);
});
test('results supply product links, remove unsafe/duplicate links, and rank products ahead of categories',()=>{
  const row=(title:string,url:string)=>`<div class="result"><a class="result__a" href="${url}">${title}</a><div class="result__snippet">Best Maid Pickles 32 oz</div></div>`;
  const html=row('Best Maid Pickles collection','https://store.example.com/category/pickles')+
    row('Best Maid Dill Pickles 32 oz','//duckduckgo.com/l/?uddg=https%3A%2F%2Fstore.example.com%2Fproducts%2Fdill')+
    row('Duplicate','https://store.example.com/products/dill')+
    row('Unsafe','http://127.0.0.1/products/dill')+row('Not a link','javascript:alert(1)')+
    row('Feed','https://store.example.com/feed/');
  const matches=parseSearchResults(html,{name:'Best Maid Pickles',size:'32 oz'});
  assert.equal(matches.length,2);
  assert.equal(matches[0].url,'https://store.example.com/products/dill');
  assert.equal(matches[0].name,'Best Maid Dill Pickles 32 oz');
});
test('unrelated search results are not offered as matches',()=>{
  assert.deepEqual(parseSearchResults('<div class="result"><a class="result__a" href="https://example.com">Best Buy</a></div>',{name:'Best Maid Pickles'}),[]);
});
