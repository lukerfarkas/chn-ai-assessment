# Cloudflare Worker Deployment Design
**Date:** 2026-02-18
**Status:** Approved

## Goal
Deploy `index.html` (CHN AI Assessment) as a Cloudflare Worker using Workers Assets. The Google Sheets backend remains unchanged.

## Approach
Workers Assets — Wrangler uploads static files to Cloudflare's CDN; the Worker serves them automatically.

## Files to Create

### `wrangler.toml`
Worker configuration pointing `[assets]` at the repo root.

### `worker.js`
Minimal passthrough Worker script (~5 lines). Workers Assets handles routing automatically.

## File Structure (after)
```
chn-ai-assessment/
├── index.html          (unchanged)
├── profiles.js         (unchanged)
├── sheets_backend.gs   (unchanged)
├── wrangler.toml       (new)
└── worker.js           (new)
```

## Deploy Workflow
```bash
npm install -g wrangler   # one-time
wrangler login            # one-time
wrangler deploy           # deploy
```

## Routes Served
- `GET /` → `index.html`
- `GET /?admin=true` → `index.html` (admin is client-side)
- `GET /profiles.js` → `profiles.js`

## Out of Scope
- Google Sheets backend (no changes)
- CI/CD (manual deploy only)
