# Shop photos and videos on Cloudflare R2

**Why:** on 22 Nov 2026 the live project was shut down by Supabase ("Services restricted", every request answered 402). The Free plan allows 5 GB of Storage downloads a month, and shop photos and videos used 21 GB. Downloads from Cloudflare R2 are free, however many visitors come. Storage costs nothing up to 10 GB, then $0.015 per GB per month.

**What moves:** product and variant photos and videos, boutique logos and banners, home banners and category images. These are the `products/`, `vendor-uploads/` and `hero/` folders and the root of the `category-images` bucket. Everything else stays on Supabase: customer avatars, review and return photos, KYC documents, payout proofs, e-way bills and the AI original photos. Those are small and rarely downloaded.

**How it works:**
- The browser asks the `media-upload-url` edge function for an upload link. The function checks the uploader the same way the Supabase bucket did: admins can upload anywhere, boutique members only under `vendor-uploads/`.
- The browser then uploads the file straight to R2. For a photo it also uploads two smaller copies, 720 px and 1600 px wide.
- Cards and grids show the 720 px copy, the product page the 1600 px copy, and zoom the full photo ([src/lib/mediaStorage.ts](../../src/lib/mediaStorage.ts)).

Until step 5 is done, uploads keep going to Supabase Storage. The site works either way.

Do the steps in order.

## 1. Cloudflare account and R2

1. Sign up at https://dash.cloudflare.com (the free plan is enough).
2. Left menu → **R2 Object Storage** → enable it. Cloudflare asks for a card, but it charges nothing while usage stays inside the free tier.
3. Copy the **Account ID** shown on the R2 overview page.

## 2. The domain on Cloudflare

R2 needs a custom domain such as `media.allboutiqs.com`. The `r2.dev` address is rate-limited and is not meant for a live site.

`allboutiqs.com` is registered at **Namecheap**. Its DNS is on **Netlify DNS** (nameservers `dns1-4.p08.nsone.net`, checked 22 Nov 2026). Before changing anything, take a screenshot of every record in Netlify → Domains → allboutiqs.com.

1. Cloudflare → **Add a domain** → `allboutiqs.com` → Quick scan → Free plan.
2. In DNS → Records, delete the scanned **A** and **AAAA** records for `allboutiqs.com`, `www` and `vendor`. They are Netlify's internal addresses, which can change. Add these instead, all **DNS only** (grey cloud), so Netlify keeps serving the sites and their SSL certificates:
   - `CNAME @ → apex-loadbalancer.netlify.com`
   - `CNAME www → all-boutiques.netlify.app`
   - `CNAME vendor → vendorall.netlify.app` (a second Netlify site)
3. Check that the email records are all there and match Netlify's list:
   - MX `mx.zoho.in` (10), `mx2.zoho.in` (20), `mx3.zoho.in` (50).
   - TXT `v=spf1 include:zoho.in ~all`.
   - TXT `zoho-verification=...` and `google-site-verification=...`.
   - Any `..._domainkey` (DKIM) record. A quick scan doesn't find DKIM, so add it by hand.
4. Namecheap → Domain List → allboutiqs.com → **Manage** → **Nameservers**: keep **Custom DNS** and replace the four nsone.net names with the two Cloudflare names. Save with the green tick. DNSSEC is off, so nothing else is needed. Wait until Cloudflare shows the domain as **Active**.
5. Once the site and email work through Cloudflare, delete the old zone: Netlify → Domains → allboutiqs.com → **Delete DNS zone**. The domain stays on the site. Then go to Netlify → the site → Domain management → HTTPS and check that the certificate is fine.
6. Don't turn on Cloudflare **Email Routing**, because it replaces the Zoho MX records.

## 3. The bucket

1. R2 → **Create bucket** → name `allboutiqs-media`. Location: **Automatic**, or the Asia-Pacific hint.
2. Bucket → **Settings** → **Custom Domains** → **Connect Domain** → `media.allboutiqs.com`. Leave **Public Development URL** (r2.dev) off.
3. Bucket → **Settings** → **CORS Policy** → paste the policy below (replace the site addresses with the real ones):

```json
[
  {
    "AllowedOrigins": ["https://allboutiqs.com", "https://www.allboutiqs.com", "https://vendor.allboutiqs.com", "http://localhost:8080"],
    "AllowedMethods": ["GET", "HEAD", "PUT"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["Content-Length", "Content-Range", "Content-Type", "ETag", "Accept-Ranges"],
    "MaxAgeSeconds": 86400
  }
]
```

Every site that uploads or shows shop media must be in **AllowedOrigins**: the shop, www, and the second Netlify site `vendor.allboutiqs.com` (the Live-Vendor branch, where Admin and the Seller Dashboard run). If a site is missing, R2 answers the upload's preflight (OPTIONS) with 403 and the page says "photo failed to upload" (23 Nov 2026). The R2 token in section 4 can't change CORS, so edit the policy in the dashboard.

The policy needs these methods for two reasons:
- **PUT** lets the browser upload.
- **GET/HEAD** let the site's media cache ([public/media-sw.js](../../public/media-sw.js)) keep files on the device. Without them, photos still show, but the cache is skipped.

## 4. An R2 API token, and the Supabase secrets

1. R2 overview → **Manage R2 API Tokens** (or Account API tokens) → **Create API token**. Choose **Object Read & Write**, applied to the `allboutiqs-media` bucket only, with no expiry. Copy the **Access Key ID** and **Secret Access Key**. The secret is shown only once.
2. Supabase Dashboard → Edge Functions → **Secrets**. Add the following, or set them with `npx supabase secrets set --project-ref whycxtnjhdbewgyugfax NAME=value`:

| Secret | Value |
|---|---|
| `R2_ACCOUNT_ID` | the Account ID from step 1 |
| `R2_ACCESS_KEY_ID` | from the token |
| `R2_SECRET_ACCESS_KEY` | from the token |
| `R2_BUCKET` | `allboutiqs-media` |
| `MEDIA_BASE_URL` | `https://media.allboutiqs.com` (no trailing slash) |

3. Deploy the function:

```sh
npx supabase functions deploy media-upload-url --project-ref whycxtnjhdbewgyugfax
```

The project must not be restricted while you deploy.

## 5. Switch the website to R2

Add the bucket's public address to the website build:

- [netlify.toml](../../netlify.toml), under `[build.environment]`: `VITE_MEDIA_BASE_URL = "https://media.allboutiqs.com"`.
- [.env.development](../../.env.development) and [.env.production](../../.env.production): `VITE_MEDIA_BASE_URL="https://media.allboutiqs.com"`.

Push and let Netlify build. Then check it:
1. As a boutique, add a photo and a video to a product.
2. The saved image url starts with `https://media.allboutiqs.com/vendor-uploads/` and ends in `.sw.jpg` (or `.sj.jpg`, `.png` ...).
3. On the shop, the product card loads the `.w720.webp` copy (browser DevTools → Network).

**Undo:** remove `VITE_MEDIA_BASE_URL` and rebuild. New uploads go to Supabase again, and photos already on R2 keep working.

## 6. Move the photos and videos already uploaded

[scripts/media-to-r2/migrate.ts](../../scripts/media-to-r2/migrate.ts) copies every shop file the database points to from Supabase Storage to R2, with the smaller copies, and then rewrites the urls. It writes all the rows in one transaction, and only rows that are still unchanged.

While the rows change, it switches the tables' triggers off. Otherwise every approved product video would go back to "pending".

It needs:
- A Supabase personal access token (Dashboard → Account → Access Tokens).
- The R2 values from step 4.
- The Supabase project must not be restricted, because the files are downloaded from Supabase Storage.

```sh
npm install --no-save sharp
export SUPABASE_ACCESS_TOKEN=sbp_...
export R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=...
export R2_BUCKET=allboutiqs-media MEDIA_BASE_URL=https://media.allboutiqs.com

node scripts/media-to-r2/migrate.ts           # dry run: what would move
node scripts/media-to-r2/migrate.ts --apply   # copy the files, then update the rows
```

The script saves `moved-files.json` (old url → new url) and the rows' old values (`rows-before-<time>.json`) in `~/AllBoutiqs-backups/<date>-media-to-r2/`. It is safe to run again, and files already copied are skipped.

## 7. Later: remove the old copies from Supabase

The script deletes nothing. After a week or two of the shop working from R2, the old files in `category-images/products/`, `vendor-uploads/`, `hero/` and the bucket root can be deleted. That frees Supabase storage (1 GB on the Free plan). Check `moved-files.json` first.

## 8. Unused files are cleared out of R2

A photo goes up to R2 as soon as it is picked, before the form is saved. Without a clean-up, every photo removed with the cross, every replaced photo, every form closed without saving and every deleted product would leave files in the bucket. There are two parts (client, 23 Nov 2026):

- **Straight away** (`media-delete`): the cross on a photo that was uploaded in the same form and not saved yet deletes it at once, with its smaller copies. A new photo or video put in place of an unsaved one does the same. The server deletes only when no row mentions the file and it is under 48 hours old.
- **Every night at 03:00 India time** (`media-cleanup`, cron job `media-cleanup`): a file that no row mentions and that is over 48 hours old moves to `trash/<its path>`. That covers saved photos removed and then saved, deleted products, banners and logos, and forms that were closed. A file in `trash/` that a row mentions again moves back. Files in `trash/` for 7 days are deleted for good.

"Mentions" means `<folder>/<id>` appears anywhere in any text, json or array column of any public table (`public.media_file_ids_in_use`), so a column added later is covered too. If a run would clear out more than half of the files (and at least 30), it stops, changes nothing and notifies the admins. The R2 token from step 4 is enough: it can list, copy and delete. No dashboard change is needed.

Set it up:

1. Apply `supabase/migrations/20261123100000_media_cleanup.sql` (the search functions).
2. Deploy the functions: `npx supabase functions deploy media-delete media-cleanup --project-ref whycxtnjhdbewgyugfax`.
3. Dry run as an admin, which changes nothing and lists the files it would move: call `media-cleanup` with `{"dryRun": true}`.
4. When the list looks right, apply `20261123100100_media_cleanup_schedule.sql` (the nightly cron job).

To put a file back by hand, copy `trash/<path>` back to `<path>`. The nightly run does this by itself when a row mentions the file again.
