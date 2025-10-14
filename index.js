// Zurg HTML Proxy - v2.0 - Fixed Content-Disposition header
export default {
  async fetch(request, env) {
    // Basic authentication check for all paths
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return new Response('Unauthorized', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Basic realm="Proxy"' }
      });
    }
    const [scheme, credentials] = authHeader.split(' ');
    if (scheme !== 'Basic') {
      return new Response('Unauthorized', { status: 401 });
    }
    const decoded = atob(credentials);
    const [username, password] = decoded.split(':');

    console.log('Auth attempt:', { username, password, expected_user: env.WORKER_USERNAME, expected_pass: env.WORKER_PASSWORD });

    if (username !== env.WORKER_USERNAME || password !== env.WORKER_PASSWORD) {
      return new Response('Unauthorized', { status: 401 });
    }

    // Proxy logic
    const url = new URL(request.url);
    let path = url.pathname;

    // Handle video proxy endpoint for CORS bypass
    if (path === '/video-proxy') {
      const videoUrl = url.searchParams.get('url');
      if (!videoUrl) {
        return new Response('Missing url parameter', { status: 400 });
      }

      console.log('Video proxy request for:', videoUrl);

      try {
        const videoHeaders = new Headers();

        // Forward Range header for seeking support
        const rangeHeader = request.headers.get('Range');
        if (rangeHeader) {
          videoHeaders.set('Range', rangeHeader);
          console.log('Forwarding Range header:', rangeHeader);
        }

        console.log('Fetching video from:', videoUrl);
        const videoResponse = await fetch(videoUrl, {
          headers: videoHeaders,
          redirect: 'follow'
        });

        console.log('Video response status:', videoResponse.status);
        console.log('Video response headers:', Object.fromEntries(videoResponse.headers));

        // Build response headers with CORS
        const responseHeaders = new Headers();

        // Essential headers for video streaming (excluding content-disposition)
        const headersToForward = [
          'content-length',
          'content-range',
          'accept-ranges',
          'last-modified',
          'etag'
        ];

        for (const header of headersToForward) {
          const value = videoResponse.headers.get(header);
          if (value) {
            responseHeaders.set(header, value);
          }
        }

        // Ensure Accept-Ranges is set (required for Safari video streaming)
        if (!responseHeaders.has('accept-ranges')) {
          responseHeaders.set('Accept-Ranges', 'bytes');
        }

        // Set proper video content type (not force-download) and CORS headers
        responseHeaders.set('Content-Type', 'video/mp4');
        responseHeaders.set('Access-Control-Allow-Origin', '*');
        responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        responseHeaders.set('Access-Control-Allow-Headers', 'Range');
        responseHeaders.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');

        // Prevent caching issues
        responseHeaders.set('Cache-Control', 'public, max-age=31536000');

        console.log('Returning headers:', Object.fromEntries(responseHeaders));

        // Handle OPTIONS preflight
        if (request.method === 'OPTIONS') {
          return new Response(null, { status: 204, headers: responseHeaders });
        }

        // Handle HEAD requests (Safari uses these to check Range support)
        if (request.method === 'HEAD') {
          return new Response(null, {
            status: videoResponse.status,
            statusText: videoResponse.statusText,
            headers: responseHeaders
          });
        }

        // Stream the video body directly (no buffering)
        return new Response(videoResponse.body, {
          status: videoResponse.status,
          statusText: videoResponse.statusText,
          headers: responseHeaders
        });
      } catch (error) {
        console.error('Video proxy error:', error);
        return new Response('Error fetching video: ' + error.message, { status: 500 });
      }
    }

    // Show landing page at root
    if (path === '/') {
      const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Zurg HTML Proxy</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css">
</head>
<body>
<main class="container">
<article>
 <h1>Zurg HTML Proxy and Media Player</h1>
 <p>This proxy server provides HTML browsing for your Zurg media files.</p>
 <a href="/http/" role="button">Browse Files</a>
 <a id="fullscreen-link" href="" role="button" title="enable full-screen via YouTube.com redirect">Tesla Theatre</a>
</article>
</main>
<script>
  const fullscreenLink = document.getElementById('fullscreen-link');
  fullscreenLink.href = 'https://youtube.com/redirect?q=' + encodeURIComponent(window.location.href);
</script>
</body>
</html>`;
      return new Response(html, { headers: { 'Content-Type': 'text/html' } });
    }

    // Build Zurg URL
    const zurgUrl = env.ZURG_BASE_URL + path;

    const headers = new Headers(request.headers);
    headers.delete('Authorization'); // Remove worker auth header

    // Add Zurg basic auth header
    const zurgAuth = btoa(`${env.ZURG_USERNAME}:${env.ZURG_PASSWORD}`);
    headers.set('Authorization', `Basic ${zurgAuth}`);

    console.log('Proxying to:', zurgUrl);

    const zurgRequest = new Request(zurgUrl, {
      method: request.method,
      headers: headers,
      body: request.body
    });

    if (path.endsWith('.strm')) {
      // Handle .strm files: fetch content and generate HTML page
      const response = await fetch(zurgRequest);
      console.log('Zurg response status:', response.status);
      if (!response.ok) return response;
      const strmContent = (await response.text()).trim();

      // Use the Zurg URL directly since it redirects properly
      let finalVideoUrl = strmContent;
      console.log('Video URL from .strm:', finalVideoUrl);

      // Create authenticated URL by injecting credentials
      let authenticatedUrl = finalVideoUrl;
      try {
        const urlObj = new URL(finalVideoUrl);
        urlObj.username = env.ZURG_USERNAME;
        urlObj.password = env.ZURG_PASSWORD;
        authenticatedUrl = urlObj.toString();
      } catch (e) {
        console.error('Failed to add auth to URL:', e);
      }

      // Get path parts and decode them
      const pathParts = path.split('/').filter(p => p);
      const folder = pathParts.length > 2 ? decodeURIComponent(pathParts[pathParts.length - 2]) : '';
      const filename = decodeURIComponent(pathParts[pathParts.length - 1].replace('.strm', '')).replace(/\./g, ' ');

      const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${filename}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css">
<link rel="stylesheet" href="https://cdn.plyr.io/3.7.8/plyr.css" />
 <style>
   .plyr {
     max-width: 800px;
     --plyr-control-icon-size: 36px;  /* 2x default (18px) for better touch targets */
   }
 </style>
</head>
<body>
<main class="container">
<article>
<hgroup>
<h1>${filename}</h1>
<h2>${folder}</h2>
</hgroup>
 <video id="player" controls crossorigin playsinline>
   <source src="/video-proxy?url=${encodeURIComponent(finalVideoUrl)}" type="video/mp4" />
 </video>
 <p style="margin-top: 1rem;"><small>video cache URL:</small><br> <code>${authenticatedUrl}</code></p>
 <button id="copy-button" class="secondary" style="min-width: 80px;">Copy URL</button>
</article>
</main>
<script src="https://cdn.plyr.io/3.7.8/plyr.polyfilled.js"></script>
<script>
  const copyButton = document.getElementById('copy-button');

  // Initialize Plyr with keyboard shortcuts
  const player = new Plyr('#player', {
    controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'captions', 'settings', 'fullscreen'],
    settings: ['captions', 'quality'],
    keyboard: { focused: true, global: true }
  });

  // Media Session API for Tesla steering wheel controls
  player.on('ready', () => {
    console.log('Player ready');

    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: '${filename}',
        artist: '${folder}',
        album: 'Zurg Media'
      });

      navigator.mediaSession.setActionHandler('play', () => player.play());
      navigator.mediaSession.setActionHandler('pause', () => player.pause());
      navigator.mediaSession.setActionHandler('seekbackward', () => player.rewind(10));
      navigator.mediaSession.setActionHandler('seekforward', () => player.forward(10));
      console.log('Media Session API initialized for steering wheel controls');
    }
  });

  player.on('play', () => console.log('Playing'));
  player.on('pause', () => console.log('Paused'));

   copyButton.addEventListener('click', () => {
     navigator.clipboard.writeText('${authenticatedUrl}');
     copyButton.textContent = 'Copied';
     setTimeout(() => {
       copyButton.textContent = 'Copy URL';
     }, 2000);
   });
</script>
</body>
</html>`;
      return new Response(html, { headers: { 'Content-Type': 'text/html' } });
    } else {
      // Handle directories: fetch HTML and enhance with PICO CSS
      const response = await fetch(zurgRequest);
      console.log('Zurg response status:', response.status);
      if (!response.ok) return response;
      let content = await response.text();

      // Remove Zurg's inline styles that override PICO CSS
      content = content.replace(/<style>.*?<\/style>/gi, '');

      // Zurg returns just a raw <ol> list, so wrap it in proper HTML structure
      const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Browse Files</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css">
</head>
<body>
<main class="container">
<article>
${content}
</article>
</main>
</body>
</html>`;

      return new Response(html, { headers: { 'Content-Type': 'text/html' } });
    }
  }
};