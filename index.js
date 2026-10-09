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

    console.log('Auth attempt for username:', username);

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
        // Handle preflight without downloading the media. Keep these headers
        // identical for the native and Plyr-backed players.
        const corsHeaders = new Headers({
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': 'Range, If-Range',
          'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, Content-Type, ETag'
        });

        if (request.method === 'OPTIONS') {
          return new Response(null, { status: 204, headers: corsHeaders });
        }

        const videoHeaders = new Headers();

        // Forward byte-range headers for seeking and media metadata probing.
        for (const header of ['Range', 'If-Range']) {
          const value = request.headers.get(header);
          if (value) {
            videoHeaders.set(header, value);
            console.log(`Forwarding ${header} header:`, value);
          }
        }

        console.log('Fetching video from:', videoUrl);
        const videoResponse = await fetch(videoUrl, {
          method: request.method === 'HEAD' ? 'HEAD' : 'GET',
          headers: videoHeaders,
          redirect: 'follow'
        });

        console.log('Video response status:', videoResponse.status);
        console.log('Video response headers:', Object.fromEntries(videoResponse.headers));
        console.log('Original content-type:', videoResponse.headers.get('content-type'));

        // Build response headers with CORS. Preserve the upstream media type:
        // forcing every file to video/mp4 makes MKV/WebM files look like a
        // corrupt MP4 and can prevent their audio tracks from being exposed.
        const responseHeaders = new Headers(corsHeaders);

        // Essential headers for streaming and byte-range playback.
        const headersToForward = [
          'content-type',
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

        // A few upstreams omit this even though they honor Range requests.
        if (!responseHeaders.has('accept-ranges')) {
          responseHeaders.set('Accept-Ranges', 'bytes');
        }

        // Infer the type only when the upstream is silent or generic. This
        // keeps the old MP4 behavior while allowing compatible browsers to
        // recognize MKV/WebM sources correctly.
        const upstreamContentType = videoResponse.headers.get('content-type') || '';
        if (!upstreamContentType || upstreamContentType.toLowerCase().startsWith('application/octet-stream')) {
          const pathname = new URL(videoUrl).pathname.toLowerCase();
          const inferredContentType = pathname.endsWith('.mkv')
            ? 'video/x-matroska'
            : pathname.endsWith('.webm')
              ? 'video/webm'
              : pathname.endsWith('.mov')
                ? 'video/quicktime'
                : 'video/mp4';
          responseHeaders.set('Content-Type', inferredContentType);
        }

        responseHeaders.set('Content-Disposition', 'inline');
        // Do not let a shared cache reuse a 206 response for another range.
        responseHeaders.set('Cache-Control', 'no-store');

        console.log('Returning headers:', Object.fromEntries(responseHeaders));

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

      // Get path parts and decode them
      const pathParts = path.split('/').filter(p => p);
      const folder = pathParts.length > 2 ? decodeURIComponent(pathParts[pathParts.length - 2]) : '';
      const filename = decodeURIComponent(pathParts[pathParts.length - 1].replace('.strm', '')).replace(/\./g, ' ');

      // Check for player mode
      const requestUrl = new URL(request.url);
      const isHtml5 = requestUrl.searchParams.get('player') === 'html5';
      // Keep the direct URL safe when embedding it in the generated script.
      const finalVideoUrlScript = JSON.stringify(finalVideoUrl).replace(/</g, '\\u003c');

      const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${filename}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css">
${isHtml5 ? '' : '<link rel="stylesheet" href="https://cdn.plyr.io/3.7.7/plyr.css" />'}
 <style>
   .plyr, video {
     max-width: 800px;
     --plyr-control-icon-size: 36px;  /* 2x default (18px) for better touch targets */
   }

   .copied {
     background-color: #4CAF50 !important;
     border-color: #4CAF50 !important;
     color: white !important;
   }

   .audio-track-picker {
     max-width: 800px;
     margin: 1rem 0;
   }

   #audio-track-status {
     display: block;
     min-height: 1.25rem;
     margin-top: 0.35rem;
   }

   #audio-output-status {
     display: block;
     min-height: 1.25rem;
     margin-top: 0.35rem;
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
 <video id="player" controls crossorigin playsinline src="/video-proxy?url=${encodeURIComponent(finalVideoUrl)}"></video>
 <fieldset class="audio-track-picker">
   <label for="audio-track-select">Audio track</label>
   <select id="audio-track-select" disabled>
     <option>Detecting audio tracks…</option>
   </select>
   <small id="audio-track-status" role="status"></small>
   <label for="audio-output-select">Audio output</label>
   <select id="audio-output-select">
     <option value="stereo" selected>Stereo downmix (includes centre/dialogue)</option>
     <option value="original">Original channel layout</option>
   </select>
   <small id="audio-output-status" role="status">Stereo downmix will be enabled when playback starts.</small>
 </fieldset>
 <p style="margin-top: 1rem;"><small>video cache URL:</small><br> <code>${finalVideoUrl}</code></p>
 <button id="copy-button" class="secondary" style="min-width: 80px;">Copy URL</button>
 <button id="download-button" class="secondary" style="min-width: 80px;">Download Media</button>
 <button id="switch-player" class="secondary">${isHtml5 ? 'PLYR' : 'HTML5'}</button>
</article>
</main>
${isHtml5 ? '' : '<script src="https://cdn.plyr.io/3.7.7/plyr.polyfilled.js"></script>'}
<script>
  const finalVideoUrl = ${finalVideoUrlScript};
  const media = document.getElementById('player');
  const copyButton = document.getElementById('copy-button');
  const downloadButton = document.getElementById('download-button');
  const switchButton = document.getElementById('switch-player');
  const audioTrackSelect = document.getElementById('audio-track-select');
  const audioTrackStatus = document.getElementById('audio-track-status');
  const audioOutputSelect = document.getElementById('audio-output-select');
  const audioOutputStatus = document.getElementById('audio-output-status');

  ${isHtml5 ? '' : `
  // Initialize Plyr with keyboard shortcuts
  const player = new Plyr('#player', {
    controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'captions', 'settings', 'fullscreen'],
    settings: ['captions', 'quality'],
    keyboard: { focused: true, global: true }
  });

  player.on('ready', () => console.log('Player ready'));
  player.on('play', () => console.log('Playing'));
  player.on('pause', () => console.log('Paused'));
  `}

  // Plyr and the native HTML5 controls both use the same media element. The
  // standard AudioTrackList API is the only browser API that can switch
  // embedded MP4/MKV audio tracks without downloading or transcoding the file.
  function getAudioTracks() {
    try {
      const tracks = media.audioTracks;
      if (!tracks || typeof tracks.length !== 'number') return null;

      const result = [];
      for (let index = 0; index < tracks.length; index += 1) {
        result.push(tracks[index]);
      }
      return result;
    } catch (error) {
      console.warn('Unable to read audio tracks:', error);
      return null;
    }
  }

  function getAudioTrackLabel(track, index) {
    const label = track.label || track.language || track.kind || ('Track ' + (index + 1));
    const language = track.label && track.language ? ' (' + track.language + ')' : '';
    return label + language;
  }

  function refreshAudioTrackPicker() {
    const tracks = getAudioTracks();

    if (tracks === null) {
      audioTrackSelect.replaceChildren(new Option('Track selection unavailable', ''));
      audioTrackSelect.disabled = true;
      audioTrackStatus.textContent = 'This browser does not expose embedded audio-track switching.';
      return;
    }

    if (tracks.length === 0) {
      audioTrackSelect.replaceChildren(new Option('No embedded audio tracks detected', ''));
      audioTrackSelect.disabled = true;
      audioTrackStatus.textContent = 'The media has not exposed a selectable audio track yet.';
      return;
    }

    let selectedIndex = tracks.findIndex(track => track.enabled);
    if (selectedIndex < 0) selectedIndex = 0;

    audioTrackSelect.replaceChildren(...tracks.map((track, index) => {
      const option = new Option(getAudioTrackLabel(track, index), String(index));
      option.selected = index === selectedIndex;
      return option;
    }));
    audioTrackSelect.disabled = false;
    audioTrackSelect.value = String(selectedIndex);
    audioTrackStatus.textContent = tracks.length + ' embedded audio track' + (tracks.length === 1 ? '' : 's') + ' detected.';
  }

  audioTrackSelect.addEventListener('change', () => {
    const tracks = getAudioTracks();
    const selectedIndex = Number(audioTrackSelect.value);
    if (!tracks || !tracks[selectedIndex]) return;

    try {
      tracks.forEach((track, index) => {
        track.enabled = index === selectedIndex;
      });
      refreshAudioTrackPicker();
    } catch (error) {
      console.warn('Unable to select audio track:', error);
      audioTrackStatus.textContent = 'This browser reported the tracks but would not switch them.';
    }
  });

  ['loadedmetadata', 'loadeddata', 'durationchange', 'canplay'].forEach(eventName => {
    media.addEventListener(eventName, refreshAudioTrackPicker);
  });

  const audioTracks = getAudioTracks();
  if (audioTracks && typeof media.audioTracks.addEventListener === 'function') {
    ['addtrack', 'removetrack', 'change'].forEach(eventName => {
      media.audioTracks.addEventListener(eventName, refreshAudioTrackPicker);
    });
  }
  refreshAudioTrackPicker();

  // A common compatibility problem is a single AAC 5.1 track: browsers that
  // output only stereo can omit the centre channel, where dialogue normally
  // lives. Route the media through Web Audio and offer a standard stereo
  // downmix that folds centre/surround/LFE into left and right. The original
  // layout remains available for devices that can decode it correctly.
  let audioGraph = null;

  function ensureAudioGraph() {
    if (audioGraph) return audioGraph;

    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) {
      audioOutputSelect.disabled = true;
      audioOutputStatus.textContent = 'Web Audio is unavailable; using the browser default.';
      return null;
    }

    let context;
    let source;
    try {
      context = new AudioContextConstructor();
      source = context.createMediaElementSource(media);

      const originalGain = context.createGain();
      const downmixGain = context.createGain();
      const splitter = context.createChannelSplitter(8);
      const merger = context.createChannelMerger(2);

      source.connect(originalGain);
      originalGain.connect(context.destination);
      source.connect(splitter);

      // ISO/WAVE channel order: FL, FR, FC, LFE, BL/SL, BR/SR, plus the
      // optional back-surround pair. A 0.707 coefficient is the standard
      // equal-power fold-down for centre and surround channels.
      const routes = [
        [0, 0, 1],
        [1, 1, 1],
        [2, 0, 0.7071],
        [2, 1, 0.7071],
        [3, 0, 0.5],
        [3, 1, 0.5],
        [4, 0, 0.7071],
        [5, 1, 0.7071],
        [6, 0, 0.5],
        [7, 1, 0.5]
      ];

      routes.forEach(([input, output, gainValue]) => {
        const gain = context.createGain();
        gain.gain.value = gainValue;
        splitter.connect(gain, input, 0);
        gain.connect(merger, 0, output);
      });

      merger.connect(downmixGain);
      downmixGain.connect(context.destination);
      originalGain.gain.value = 0;
      downmixGain.gain.value = 1;

      audioGraph = { context, originalGain, downmixGain };
      return audioGraph;
    } catch (error) {
      // If graph construction fails, restore the ordinary media output so a
      // browser-specific Web Audio limitation does not make the video mute.
      try {
        if (source && context) source.connect(context.destination);
      } catch (restoreError) {
        console.warn('Unable to restore native audio output:', restoreError);
      }
      audioOutputSelect.disabled = true;
      audioOutputStatus.textContent = 'Stereo downmix is unavailable; using the browser default.';
      console.warn('Unable to create audio downmix:', error);
      return null;
    }
  }

  async function setAudioOutput(mode) {
    const graph = ensureAudioGraph();
    if (!graph) return;

    try {
      if (graph.context.state === 'suspended') await graph.context.resume();
      const downmixEnabled = mode === 'stereo';
      graph.originalGain.gain.value = downmixEnabled ? 0 : 1;
      graph.downmixGain.gain.value = downmixEnabled ? 1 : 0;
      audioOutputStatus.textContent = downmixEnabled
        ? 'Stereo downmix is active; centre-channel dialogue is sent to both speakers.'
        : 'Original channel layout is active; the device controls its surround downmix.';
    } catch (error) {
      audioOutputStatus.textContent = 'Unable to change the audio output mode.';
      console.warn('Unable to change audio output:', error);
    }
  }

  audioOutputSelect.addEventListener('change', () => {
    setAudioOutput(audioOutputSelect.value);
  });
  media.addEventListener('play', () => {
    setAudioOutput(audioOutputSelect.value);
  });

  copyButton.addEventListener('click', () => {
    navigator.clipboard.writeText(finalVideoUrl);
    const originalWidth = copyButton.offsetWidth;
    copyButton.style.width = originalWidth + 'px';
    copyButton.textContent = 'Copied';
    copyButton.classList.add('copied');
    setTimeout(() => {
      copyButton.textContent = 'Copy URL';
      copyButton.classList.remove('copied');
      copyButton.style.width = '';
    }, 3000);
  });

  downloadButton.addEventListener('click', () => {
    if (confirm('Are you sure you want to download this file?')) {
      window.location.href = finalVideoUrl;
    }
  });

  switchButton.addEventListener('click', () => {
    const url = new URL(window.location);
    if (${isHtml5}) {
      url.searchParams.delete('player');
    } else {
      url.searchParams.set('player', 'html5');
    }
    window.location.href = url.toString();
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
