# Zurg HTML Proxy and Media Player

A Cloudflare Worker that authenticates and presents [Zurg](https://github.com/debridmediamonitor/zurg) media as a streamable video player interface. The Worker brokers short-lived direct media URLs; it does not carry the media stream.

## Features

- styled file navigation and playback pages
- in-browser media player with [Plyr](https://plyr.io/)
- basic authentication
- direct-to-origin media delivery without Worker bandwidth transit
- supports Tesla web browser and full-screen theatre mode
- `/diagnostics` playback lab with six video and twelve audio fixtures

## How It Works

Zurg provides a basic HTML file browser at `/http`. The Cloudflare Worker:
1. proxies the Zurg HTML endpoint;
2. applies Blades CSS styling to directory listings;
3. converts .strm files into playable video pages;
4. validates the upstream media origin and source scheme;
5. creates a short-lived encrypted stream token; and
6. redirects the browser to the signed upstream media URL.

The Worker does not proxy media bytes. The upstream must provide an HTTPS URL
that the browser can play directly, typically a URL containing its own
short-lived access token. Sources with embedded credentials or an HTTP URL on
an HTTPS Worker page are rejected instead of being relayed through Cloudflare.

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

### Tesla Theatre Mode

The root page’s **Tesla Theatre** link uses the same YouTube handoff used by
Tesla fullscreen launchers. It sends the browser to:

```text
https://www.youtube.com/redirect?q=<URL-encoded-target>
```

Tesla treats YouTube as a Theatre-mode destination. Select **Go to Site** (or
the equivalent localized button) on YouTube and Tesla returns to this Worker
in true Theatre mode. This is different from the media page’s **Fullscreen**
button, which only uses the browser Fullscreen API inside the current browser
window.

The Worker puts a five-minute encrypted handoff token in the target URL. The
public `/theatre-bootstrap` endpoint exchanges that token for a twelve-hour,
HttpOnly, Secure session cookie before redirecting to `/`. This keeps the
normal Basic Auth flow for ordinary browsing while avoiding the Tesla Theatre
keyboard limitation. The handoff depends on Tesla’s current browser behavior
and only works while the vehicle is parked. Similar implementations describe the mechanism in
[BigScrn’s explanation](https://bigscrn.com/how-it-works/) and
[Fullscreen Hub’s guide](https://fullscreenhub.com/).

## Technical Details

### Direct Media Redirect Endpoint

The `/media-redirect` endpoint is an authenticated token broker:

- validates the encrypted, expiring stream token;
- verifies the source origin against the allowlist;
- rejects credentials embedded in the upstream URL; and
- returns an HTTP redirect to the upstream URL.

The legacy `/video-proxy` path is retained only as a redirect-only alias for
already-open player pages. It cannot proxy or rewrite a media response.

### Architecture

```
Browser → Cloudflare Worker
          (auth + token broker + redirect)

Browser → signed Zurg/Real-Debrid media URL
          (media bytes bypass this Worker)
```

## Audio Tracks and Container Compatibility

The Worker does not rewrite, select, downmix, remux, or transcode audio. Plyr
and the native player operate on the same browser media element, using the
headers and track layout provided by the direct upstream response.

The player and diagnostics page expose an audio-track selector when the browser
provides the standard `HTMLMediaElement.audioTracks` API. The selector changes
`AudioTrack.enabled` on the same media element; it does not copy media through
the Worker. If the API is not exposed, the page reports that limitation and the
browser’s native media menu is the only remaining option.

Some Chromium-based browsers do not expose embedded-track switching to page
JavaScript. In that case the selector reports that limitation; the browser
cannot switch tracks in a progressive MP4/MKV file without a remux/transcode.
For those clients, prefer a stereo AAC release or use a Zurg filter that only
publishes compatible media.

## Audio Capability Diagnostics

Open `/diagnostics` while parked and run the audio tests one at a time. Tests 7
through 18 cover:

- AAC-LC mono, stereo, 5.1, and 7.1 in M4A/MP4;
- Opus stereo and 5.1 in WebM;
- MP3 stereo; and
- AC-3 and E-AC-3 5.1 in MP4;
- sequential, isolated AAC 5.1 and 7.1 channel parades; and
- a two-track AAC stereo M4A with distinct track labels and tones.

Each fixture reports `canPlayType`, MediaCapabilities support, actual playback
state, and whether the browser exposes an audio-track list. The multichannel
fixtures in Tests 7 through 15 use simultaneous mixes and may sound similar
after a stereo downmix. Tests 16 and 17 play one channel at a time in the listed
order, including a 659 Hz centre slot. Test 18 is for embedded-track selection.
A `PLAYING` result confirms decoding and timeline advancement; it does not prove
channel routing.

The small test files can be regenerated with:

```bash
./scripts/generate-audio-fixtures.sh fixtures
```
