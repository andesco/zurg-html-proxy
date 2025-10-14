# Zurg HTML Proxy

A Cloudflare Worker that proxies [Zurg](https://github.com/debridmediamonitor/zurg) and its basic HTML endpoint and .STRM files into a streamable video player interface.

## Features

- styled file navigation with [Pico CSS](https://picocss.com/)
- in-browser media playe with [Plyr](https://plyr.io/)
- basic authentication
- supports Tesla browser and full-screen theatre mode

## How It Works

Zurg provides a basic HTML file browser at `/http`. The Cloudflare Worker:
1. proxies the Zurg HTML endpoint;
2. applies modern CSS styling to directory listings;
3. converts .strm files into playable video pages;
4. fixes headers from Real-Debrid for browser compatibility; and
5. directs video streams with light-weight CORS-enabled proxy.

## Deploy to Cloudflare
   
### Cloudflare Dashboard

   [![<nobr>Deploy to Cloudflare</nobr>](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/andesco/zurg-html-proxy)

1. Dashboard → Acount → Workers → <nobr>Create an application</nobr> → <nobr>[Clone a repository](https://dash.cloudflare.com/?to=/:account/workers-and-pages/create/deploy-to-workers):</nobr>
   ```
   http://github.com/andesco/zurg-html-proxy
   ```
2. [Workers](https://dash.cloudflare.com/?to=/:account/workers-and-pages/) → zurg-html-proxy → Settings: <nobr>Variables and Secrets: Add</nobr>
   
### Wrangler CLI
```bash
git clone https://github.com/andesco/zurg-html-proxy
cd zurg-html-proxy
# edit wrangler.toml
npm install
wrangler deploy
```

### Configure Environment Variables

| Variable | Description |
|----------|-------------|
| `ZURG_BASE_URL` | `https://zurg.example.com` |
| `ZURG_USERNAME` | Zurg username |
| `ZURG_PASSWORD` | Zurg password |
| `WORKER_USERNAME` | Worker username |
| `WORKER_PASSWORD` | Worker password |


## Technical Details

### Video Proxy Endpoint

The `/video-proxy` endpoint solves CORS issues from Real-Debrid:

- strips `Content-Disposition: attachment` header
- adds proper CORS headers
- sets `Content-Type: video/mp4`
- supports Range requests for seeking
- directs data streams without buffering (efficient for large files)

### Architecture

```
Browser → Cloudflare Worker → Zurg → Real-Debrid
          (CORS + Headers)
          
Browser ← Cloudflare Worker ← Real-Debrid media cache
          
```
> [!important]
> All video data streams through the Worker, but uses `Response.body` passthrough for minimal CPU usage and unlimited bandwidth.
