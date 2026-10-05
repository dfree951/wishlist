import type { ItemData, ProductDetails } from './items';

export type ProductFields = Pick<ItemData, 'name'|'url'|'image'|'imageSource'|'price'|'currency'|'size'|'packCount'|'checkedAt'>;

export function withProductUrl(value: ProductFields, url: string, detailsUrl = value.url): ProductFields {
  if (!detailsUrl.trim() || detailsUrl.trim() === url.trim()) return { ...value, url };
  // These values belong to the previous listing. Keep an explicitly chosen photo.
  return { ...value, url, price: null, size: '', packCount: null, checkedAt: null,
    image: value.imageSource === 'manual' ? value.image : '' };
}

export function mergeProductDetails(latest: ProductFields, started: ProductFields, product: ProductDetails, fillOnly = false): ProductFields {
  if (latest.url !== started.url) return latest;
  // Preserve anything typed while the lookup was running. Missing fetched fields
  // replace old values too; a previous listing's price must not survive a refresh.
  const price = latest.price === started.price && !(fillOnly && latest.price !== null) ? product.price : latest.price;
  return { ...latest,
    name: latest.name === started.name && !(fillOnly && latest.name) ? product.name : latest.name,
    image: latest.imageSource !== 'manual' && latest.image === started.image && !(fillOnly && latest.image) ? product.image : latest.image,
    price, currency: 'USD',
    size: latest.size === started.size && !(fillOnly && latest.size) ? product.size : latest.size,
    packCount: latest.packCount === started.packCount && !(fillOnly && latest.packCount !== null) ? product.packCount : latest.packCount,
    checkedAt: latest.price === started.price && !(fillOnly && latest.price !== null) ? product.checkedAt : latest.checkedAt,
  };
}
