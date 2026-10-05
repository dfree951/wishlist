# Syd & Dan Christmas lists

Website: https://dfree951.github.io/wishlist/

The static frontend is hosted on GitHub Pages. It calls the API at
`https://syd-and-dan-christmas.vercel.app`; Neon Postgres and image storage remain
behind the API. Visitors stay on the GitHub Pages address while using the app.

## Use

- `/` is an entry screen with no list data or counts. `/gifts` opens the public gift-giver view. No account or password is needed. Purchased items move to a section that is collapsed on each page load. Purchases can be undone.
- Swipe left or right on the entry screen to reveal the sign-in link on its back. Mouse dragging and keyboard arrow keys also turn the page. A fresh page load always starts on the front. `/manage` uses the shared password configured on the server in `OWNER_PASSWORD` and is case-insensitive. On GitHub Pages, signing in creates an eight-hour bearer session stored in the current browser tab's session storage. Sign-out clears it; refresh keeps it. This avoids third-party cookies. Direct same-origin use of the backend site retains its HTTP-only cookie session.
- Syd and Dan can add, edit, or remove either person's items. The editing API never returns purchase status. They can deliberately visit the gift-giver view at any time.
- Paste a product link and leave the field to fetch available name, image, USD price, size, and pack quantity. If the store blocks access or leaves fields missing, the app tries the existing free public search. Only matching store/product IDs and variant parameters are accepted. Entering an item name helps with ID-only links. Indexed details are labeled for review, and indexed prices are never marked as freshly checked. Missing details remain editable. Prices are snapshots, not live quotes; shipping and taxes are not compared.
- Images are fetched automatically. In **Image**, choose **Upload image** to select a phone/computer photo, or enter an Image URL. Uploads are resized, re-encoded without metadata, and stored in the connected Vercel Blob store `syd-and-dan-images`. Manually chosen images survive later detail fetches. Set `BLOB_READ_WRITE_TOKEN` through the Vercel storage connection.
- Without a link, enter a name and optional size/color and notes, then choose **Find details by name**. The app searches the public web and shows candidate products. **Use this item** fills the required product link and attempts to fill missing image, USD price, and size without overwriting entered details. Search availability depends on the search provider; a shopping-search link and manual URL entry remain available when blocked.
- Other links can be alternative gifts or the same item at another store. Lowest-linked-price comparisons include only same-item links in the same currency. Google Shopping opens a broader manual comparison.
- Amazon import accepts a shared/public full list URL. Review and select items before importing to Syd or Dan. If Amazon blocks fetching, save the loaded list page as HTML and upload it. Only the page's loaded items, up to 100, can be imported; duplicates for the same person are skipped. Imports do not stay synced with Amazon.

## Stack and persistence

**Cost constraint:** use free services only. Do not add paid APIs, metered search integrations, trials that convert to paid plans, or automatic credit top-ups. Product search uses public DuckDuckGo results without an account or API key; it can be incomplete or temporarily blocked. Successful results are cached in memory for 15 minutes to reduce repeat requests, separate from persistent wish list data.

Next.js App Router, TypeScript, React, and Neon Postgres through Vercel Marketplace, on the Free database plan. Vercel project: `oracle951/syd-and-dan-christmas`. Neon resource: `dan-syd-christmas` in `iad1`.

All wish list data and purchases are stored in Postgres, shared across devices and preserved across deployments. No browser-local data store or in-memory production fallback exists. Active pages refresh every 15 seconds and when focused. Atomic purchase updates prevent simultaneous purchase claims from both succeeding. Version checks prevent concurrent owner edits from silently overwriting one another.

Database credentials and the random signing secret are stored in Vercel environment variables. `.env.local` is ignored. Product fetching validates URLs and DNS destinations, including redirects, blocks private networks, and bounds response size and time. Saved HTML is parsed as data and never rendered or executed.

## Development

```sh
npm ci
# Configure DATABASE_URL, SESSION_SECRET (32+ random characters), and OWNER_PASSWORD
# in .env.local. Vercel's database integration provides DATABASE_URL.
npm run db:migrate
npm run dev
```

For GitHub Pages output, run `npm run build:pages`. It builds a separate temporary
frontend project without API routes or Proxy and writes the result to `out/`.
It defaults to `/wishlist` and the production API. Override
`NEXT_PUBLIC_BASE_PATH` and `NEXT_PUBLIC_API_ORIGIN` at build time if needed.
No database or authentication secrets are needed for this build. Set the backend's
`FRONTEND_ORIGINS` to a comma-separated list of approved frontend origins;
it defaults to `https://dfree951.github.io`. Origins have no path or trailing slash.

## Verification

```sh
npm test
npm run typecheck
npm run build
npm run build:pages
# With a running local server:
npm run test:integration
```

`TEST_BASE_URL` can point the integration test at production. It creates clearly labeled temporary items, exercises authentication, atomic purchasing, owner privacy, edit conflicts, undo, URL protection, and Amazon import, then removes the items it created. The Amazon HTML fixture is synthetic test data; it is not a guarantee that Amazon will allow live scraping.

## Deploy

```sh
npx vercel deploy --prod --yes --scope oracle951
```

The repository is `dfree951/wishlist`. In GitHub Settings → Pages, choose
**GitHub Actions** as the build source. The Pages workflow tests and exports the
frontend on pushes to `main`, then publishes `out/`. It can also be run manually.
Deploy backend changes to Vercel with the command above before publishing frontend
changes that depend on them. GitHub Pages deployments do not deploy the backend.

The production API domain must be publicly reachable. Vercel deployment protection
may apply to preview deployment URLs without affecting the production domain.
Database credentials, `SESSION_SECRET`, `OWNER_PASSWORD`, and the Blob token stay
in Vercel environment variables; never add them to a Pages workflow or a
`NEXT_PUBLIC_` variable. CORS accepts the configured frontend origins and API
authorization remains enforced server-side. Browser session tokens expire after
eight hours; sign-out removes the local token but does not revoke a copied token
before expiry. Rotating `SESSION_SECRET` invalidates all sessions.
