# Zurg HTML Proxy and Media Player

A Cloudflare Worker that proxies [Zurg](https://github.com/debridmediamonitor/zurg) and its basic HTML endpoint and .STRM files into a streamable video player interface.

## Features

- styled file navigation with [Pico CSS](https://picocss.com/)
- in-browser media playe with [Plyr](https://plyr.io/)
- basic authentication
- supports Tesla web browser and full-screen theatre mode

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

## Tesla Browser Compatibility

Tesla web browser (Chromium-based) includes support for:
- video: `H.264`, `AVC`
- video: `H.265`, `HEVC` · models with AMD Ryzen
- audio: `AAC`
- container: `MP4`, `WebM`

> [!important]
> **AAC Audio**<br>Tesla browsers work best with AAC audio tracks. AC3/EAC3 audio cannot be decoded. To ensure maximum compatibility, create a Zurg filter for AAC-encoded media.

### Filter Files and Folders for `AAC`

This configuration creates a directory of media that is likely AAC-compatible based on file or folder names alone.

```yaml
directories:
  AAC audio:
    group: media
    filters:
      - or:
          - regex: /AAC/i
          - any_file_inside_regex: /AAC/i
```

### Steering Wheel Controls

- **Play/Pause** - Control playback from steering wheel buttons
- **Seek Forward/Backward** - Skip 10 seconds forward or backward
- **Media Metadata** - Displays title and folder name on screen

The Media Session API is supported in all modern browsers including Tesla's Chromium-based browser.

### Theatre Mode

The **Tesla Theatre** button uses the [YouTube redirect](https://youtube.com/redirect?q=ttps://github.com/andesco/zurg-html-proxy) technique to initiate theatre mode from the Tesla web browser:

- hides browser controls
- enables full screen videos
- uses [Media Session API](https://developer.mozilla.org/en-US/docs/Web/API/Media_Session_API) to enable steering-wheel controls and on-screen metadata

```javascript
fullscreenLink.href = 'https://youtube.com/redirect?q=' + encodeURIComponent(videoUrl);
```

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
> **`Response.body`**<br>All video data streams through the Worker, but uses `Response.body` passthrough for minimal CPU usage and unlimited bandwidth.
