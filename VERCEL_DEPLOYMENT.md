# Vercel Deployment Instructions

## Quick Fix for 404 Errors

### Option 1: Use the new **public** output directory (Recommended)

1. Make sure the project repo is up to date (we now ship all static assets in `/public`)
2. In your Vercel project dashboard, open **Settings → General**
3. Scroll to **Root Directory** and set it to `public`
4. Save and redeploy

With this configuration Vercel will serve `public/index.html` as the default entry point and automatically find all supporting assets.

### Option 2: Keep root at repository root and rely on `vercel.json`

If you prefer to keep the root directory as the repository root, the provided `vercel.json` handles the rewrites:

1. Push the latest changes to GitHub (includes `public/` and updated `vercel.json`)
2. Trigger a new deployment in Vercel
3. Routing behaviour:
   - `/` → `public/index.html`
   - `/privacy-policy` → `public/privacy-policy.html`
   - `/terms-of-service` → `public/terms-of-service.html`
   - Any other asset path → `public/<path>`

## Verification

After deployment, confirm the following URLs load correctly:
- `https://your-domain.vercel.app/`
- `https://your-domain.vercel.app/privacy-policy`
- `https://your-domain.vercel.app/terms-of-service`

## Troubleshooting

If a 404 still appears:

1. **Check build logs** in the Vercel deployment view for missing file messages.
2. **Confirm files are tracked**:
   ```bash
   git ls-files public/
   ```
3. **Redeploy without cache** via the deployment menu (Disable "Use existing Build Cache").
4. **Verify relative paths** inside the HTML (CSS/JS references should be relative e.g. `styles.css`).

## Alternative layout

If you decide to serve from the repository root instead, move the files back:

```bash
cp -r public public-backup
mv public/* .
rm -rf public
# Update vercel.json or remove rewrites accordingly
```

Update asset paths as needed afterwards.
