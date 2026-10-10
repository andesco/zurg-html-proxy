var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker-utils.js
var textEncoder = new TextEncoder();
var textDecoder = new TextDecoder();
var HTML_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
}
__name(escapeHtml, "escapeHtml");
function decodePathSegment(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
__name(decodePathSegment, "decodePathSegment");
function parseBasicAuth(header) {
  if (!header) {
    return null;
  }
  const match = /^Basic\s+([^\s]+)$/i.exec(header.trim());
  if (!match) {
    return null;
  }
  try {
    const bytes = Uint8Array.from(atob(match[1]), (character) => character.charCodeAt(0));
    const decoded = textDecoder.decode(bytes);
    const separator = decoded.indexOf(":");
    if (separator < 0) {
      return null;
    }
    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1)
    };
  } catch {
    return null;
  }
}
__name(parseBasicAuth, "parseBasicAuth");
function base64Encode(value) {
  const bytes = typeof value === "string" ? textEncoder.encode(value) : value;
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
__name(base64Encode, "base64Encode");
function timingSafeStringEqual(left, right) {
  const leftBytes = textEncoder.encode(String(left ?? ""));
  const rightBytes = textEncoder.encode(String(right ?? ""));
  if (leftBytes.byteLength !== rightBytes.byteLength) {
    return false;
  }
  if (typeof crypto.subtle.timingSafeEqual === "function") {
    return crypto.subtle.timingSafeEqual(leftBytes, rightBytes);
  }
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}
__name(timingSafeStringEqual, "timingSafeStringEqual");
function encodeBase64Url(bytes) {
  return base64Encode(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
__name(encodeBase64Url, "encodeBase64Url");
function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
__name(decodeBase64Url, "decodeBase64Url");
async function deriveTokenKey(secret) {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
__name(deriveTokenKey, "deriveTokenKey");
async function createStreamToken(sourceUrl, expiresAt, secret, downloadName = "") {
  if (!secret) {
    throw new Error("The Worker token key is not configured");
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const payload = textEncoder.encode(JSON.stringify({ sourceUrl, expiresAt, downloadName }));
  const key = await deriveTokenKey(secret);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, payload)
  );
  return `v1.${encodeBase64Url(iv)}.${encodeBase64Url(ciphertext)}`;
}
__name(createStreamToken, "createStreamToken");
async function readStreamToken(token, secret) {
  if (!secret) {
    throw new Error("The Worker token key is not configured");
  }
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") {
    throw new Error("Invalid stream token");
  }
  const key = await deriveTokenKey(secret);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decodeBase64Url(parts[1]) },
    key,
    decodeBase64Url(parts[2])
  );
  const payload = JSON.parse(textDecoder.decode(plaintext));
  if (!payload || typeof payload.sourceUrl !== "string" || typeof payload.expiresAt !== "number" || payload.expiresAt <= Date.now()) {
    throw new Error("Expired stream token");
  }
  return {
    sourceUrl: payload.sourceUrl,
    downloadName: typeof payload.downloadName === "string" ? payload.downloadName : ""
  };
}
__name(readStreamToken, "readStreamToken");
function jsonForHtmlScript(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}
__name(jsonForHtmlScript, "jsonForHtmlScript");

// src/index.js
var PLYR_VERSION = "3.8.4";
var PLYR_CSS_URL = `https://cdn.plyr.io/${PLYR_VERSION}/plyr.css`;
var PLYR_JS_URL = `https://cdn.plyr.io/${PLYR_VERSION}/plyr.polyfilled.js`;
var PLYR_CSS_INTEGRITY = "sha384-VqqE0KSv00qfHvKpRa8aov+g3xtUu2Rw0NsEmtjTOPGn/JDKVghgd56iw/VObHa7";
var PLYR_JS_INTEGRITY = "sha384-ZDYtn77N2Oxc6W8oilE9z73hj1EZqidVlQeqTwsKW19gglwyUYHMn/LzX+ewyFJD";
var STREAM_TOKEN_TTL_MS = 24 * 60 * 60 * 1e3;
var MAX_STRM_BYTES = 64 * 1024;
var MAX_DIRECTORY_BYTES = 2 * 1024 * 1024;
var FORWARDED_REQUEST_HEADERS = [
  "Accept",
  "Accept-Language",
  "Cache-Control",
  "If-Modified-Since",
  "If-None-Match",
  "If-Range",
  "Range",
  "Depth",
  "Translate"
];
var PICO_STYLESHEET = '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2.1.1/css/pico.min.css" integrity="sha384-L1dWfspMTHU/ApYnFiMz2QID/PlP1xCW9visvBdbEkOLkSSWsP6ZJWhPw6apiXxU" crossorigin="anonymous">';
var DIRECTORY_CSP = "default-src 'none'; style-src https://cdn.jsdelivr.net; base-uri 'none'; frame-ancestors 'none'";
var PLAYER_CSP = "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; style-src 'self' 'unsafe-inline' https://cdn.plyr.io https://cdn.jsdelivr.net; script-src 'self' 'unsafe-inline' https://cdn.plyr.io; media-src 'self' http: https:; img-src 'self' data: https:; connect-src 'self'";
var index_default = {
  async fetch(request, env) {
    const requestUrl = new URL(request.url);
    const authFailure = authenticateRequest(request, env);
    if (authFailure) {
      return authFailure;
    }
    try {
      if (requestUrl.pathname.startsWith("/fixtures/") && env.ASSETS) {
        return env.ASSETS.fetch(request);
      }
      if (requestUrl.pathname === "/diagnostics") {
        return htmlResponse(renderDiagnosticsPage(), 200, PLAYER_CSP);
      }
      if (requestUrl.pathname === "/media-redirect" || requestUrl.pathname === "/video-proxy") {
        return await handleMediaRedirect(request, env, requestUrl);
      }
      if (requestUrl.pathname === "/") {
        return htmlResponse(renderLandingPage(), 200, DIRECTORY_CSP);
      }
      if (requestUrl.pathname.toLowerCase().endsWith(".strm")) {
        return await handleStrmPage(request, env, requestUrl);
      }
      return await handleDirectoryPage(request, env, requestUrl);
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "request_error",
          method: request.method,
          path: requestUrl.pathname,
          name: error instanceof Error ? error.name : "UnknownError"
        })
      );
      return new Response("Internal Server Error", {
        status: 500,
        headers: securityHeaders()
      });
    }
  }
};
function authenticateRequest(request, env) {
  if (!env.WORKER_USERNAME || !env.WORKER_PASSWORD) {
    return new Response("Worker authentication is not configured", {
      status: 500,
      headers: securityHeaders()
    });
  }
  const credentials = parseBasicAuth(request.headers.get("Authorization"));
  if (!credentials || !timingSafeStringEqual(credentials.username, env.WORKER_USERNAME) || !timingSafeStringEqual(credentials.password, env.WORKER_PASSWORD)) {
    return new Response("Unauthorized", {
      status: 401,
      headers: {
        ...securityHeaders(),
        "WWW-Authenticate": 'Basic realm="Proxy"'
      }
    });
  }
  return null;
}
__name(authenticateRequest, "authenticateRequest");
function securityHeaders() {
  return {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff"
  };
}
__name(securityHeaders, "securityHeaders");
function htmlResponse(html, status, contentSecurityPolicy) {
  return new Response(html, {
    status,
    headers: {
      ...securityHeaders(),
      "Content-Type": "text/html; charset=UTF-8",
      "Content-Security-Policy": contentSecurityPolicy
    }
  });
}
__name(htmlResponse, "htmlResponse");
function getZurgBaseUrl(env) {
  if (!env.ZURG_BASE_URL) {
    throw new Error("ZURG_BASE_URL is not configured");
  }
  const baseUrl = new URL(env.ZURG_BASE_URL);
  if (!["http:", "https:"].includes(baseUrl.protocol)) {
    throw new Error("ZURG_BASE_URL must use HTTP or HTTPS");
  }
  return baseUrl;
}
__name(getZurgBaseUrl, "getZurgBaseUrl");
function joinBasePath(basePath, requestPath) {
  const normalizedBasePath = basePath.replace(/\/+$/, "");
  if (!normalizedBasePath || normalizedBasePath === "/") {
    return requestPath;
  }
  if (requestPath === normalizedBasePath || requestPath.startsWith(`${normalizedBasePath}/`)) {
    return requestPath;
  }
  return `${normalizedBasePath}${requestPath.startsWith("/") ? "" : "/"}${requestPath}`;
}
__name(joinBasePath, "joinBasePath");
function buildZurgTarget(requestUrl, env) {
  const baseUrl = getZurgBaseUrl(env);
  const targetUrl = new URL(baseUrl.href);
  targetUrl.pathname = joinBasePath(baseUrl.pathname, requestUrl.pathname);
  const searchParams = new URLSearchParams(requestUrl.search);
  searchParams.delete("player");
  searchParams.delete("token");
  searchParams.delete("mode");
  searchParams.delete("download");
  targetUrl.search = searchParams.toString();
  return targetUrl;
}
__name(buildZurgTarget, "buildZurgTarget");
async function fetchZurg(request, env, requestUrl, method = request.method) {
  const targetUrl = buildZurgTarget(requestUrl, env);
  const headers = new Headers();
  for (const headerName of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(headerName);
    if (value) {
      headers.set(headerName, value);
    }
  }
  if (!env.ZURG_USERNAME || !env.ZURG_PASSWORD) {
    throw new Error("Zurg authentication is not configured");
  }
  headers.set("Authorization", `Basic ${base64Encode(`${env.ZURG_USERNAME}:${env.ZURG_PASSWORD}`)}`);
  const init = {
    method,
    headers,
    redirect: "follow"
  };
  if (method !== "GET" && method !== "HEAD") {
    init.body = request.body;
  }
  return fetch(targetUrl, init);
}
__name(fetchZurg, "fetchZurg");
async function handleStrmPage(request, env, requestUrl) {
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "GET" }
    });
  }
  const response = await fetchZurg(request, env, requestUrl, "GET");
  if (!response.ok) {
    return passThroughResponse(response);
  }
  const sourceText = (await readBoundedText(response, MAX_STRM_BYTES)).trim();
  let sourceUrl;
  try {
    sourceUrl = new URL(sourceText);
  } catch {
    return new Response("The STRM file does not contain a valid HTTP URL", {
      status: 502,
      headers: securityHeaders()
    });
  }
  if (!["http:", "https:"].includes(sourceUrl.protocol) || !isAllowedSourceUrl(sourceUrl, env)) {
    return new Response("The STRM URL is not an allowed media source", {
      status: 502,
      headers: securityHeaders()
    });
  }
  const pathParts = requestUrl.pathname.split("/").filter(Boolean);
  const rawFileName = pathParts.at(-1) || "media.strm";
  const downloadName = decodePathSegment(rawFileName).replace(/\.strm$/i, "") || "media";
  const title = downloadName.replace(/\./g, " ").replace(/\s+/g, " ").trim() || "Media";
  const folder = pathParts.length > 2 ? decodePathSegment(pathParts.at(-2)) : "";
  const directDeliveryError = getDirectDeliveryError(sourceUrl, requestUrl);
  if (directDeliveryError) {
    return new Response(directDeliveryError, {
      status: 502,
      headers: securityHeaders()
    });
  }
  const playerMode = requestUrl.searchParams.get("player") === "plyr" ? "plyr" : "native";
  const streamToken = await createStreamToken(
    sourceUrl.toString(),
    Date.now() + STREAM_TOKEN_TTL_MS,
    getStreamTokenSecret(env),
    downloadName
  );
  const streamUrl = new URL("/media-redirect", requestUrl.origin);
  streamUrl.searchParams.set("token", streamToken);
  const downloadUrl = new URL(streamUrl.href);
  downloadUrl.searchParams.set("download", "1");
  return htmlResponse(
    renderPlayerPage({
      title,
      folder,
      playerMode,
      streamUrl: relativeUrl(streamUrl),
      downloadUrl: relativeUrl(downloadUrl),
      resumeKey: `zurg-playback:${requestUrl.pathname}`
    }),
    200,
    PLAYER_CSP
  );
}
__name(handleStrmPage, "handleStrmPage");
function getStreamTokenSecret(env) {
  return env.WORKER_PASSWORD || "";
}
__name(getStreamTokenSecret, "getStreamTokenSecret");
function isAllowedSourceUrl(sourceUrl, env) {
  const zurgOrigin = getZurgBaseUrl(env).origin;
  const configuredOrigins = String(env.STREAM_SOURCE_ORIGINS || "").split(",").map((origin) => origin.trim()).filter(Boolean);
  return (/* @__PURE__ */ new Set([zurgOrigin, ...configuredOrigins])).has(sourceUrl.origin);
}
__name(isAllowedSourceUrl, "isAllowedSourceUrl");
function getDirectDeliveryError(sourceUrl, requestUrl) {
  if (sourceUrl.username || sourceUrl.password) {
    return "Direct media delivery does not accept embedded upstream credentials. Configure the upstream to issue a signed HTTPS media URL instead.";
  }
  if (requestUrl.protocol === "https:" && sourceUrl.protocol !== "https:") {
    return "Direct media delivery requires an HTTPS upstream when the Worker page is HTTPS.";
  }
  return "";
}
__name(getDirectDeliveryError, "getDirectDeliveryError");
async function handleMediaRedirect(request, env, requestUrl) {
  if (!["GET", "HEAD"].includes(request.method)) {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "GET, HEAD" }
    });
  }
  const token = requestUrl.searchParams.get("token");
  if (!token) {
    return new Response("Missing stream token", {
      status: 400,
      headers: securityHeaders()
    });
  }
  let descriptor;
  try {
    descriptor = await readStreamToken(token, getStreamTokenSecret(env));
  } catch {
    return new Response("Invalid or expired stream token", {
      status: 404,
      headers: securityHeaders()
    });
  }
  let sourceUrl;
  try {
    sourceUrl = new URL(descriptor.sourceUrl);
  } catch {
    return new Response("Invalid media source", {
      status: 502,
      headers: securityHeaders()
    });
  }
  if (!["http:", "https:"].includes(sourceUrl.protocol) || !isAllowedSourceUrl(sourceUrl, env)) {
    return new Response("Media source is not allowed", {
      status: 403,
      headers: securityHeaders()
    });
  }
  const directDeliveryError = getDirectDeliveryError(sourceUrl, requestUrl);
  if (directDeliveryError) {
    return new Response(directDeliveryError, {
      status: 502,
      headers: securityHeaders()
    });
  }
  return redirectResponse(sourceUrl.href);
}
__name(handleMediaRedirect, "handleMediaRedirect");
function redirectResponse(location) {
  return new Response(null, {
    status: 302,
    headers: {
      ...securityHeaders(),
      Location: location
    }
  });
}
__name(redirectResponse, "redirectResponse");
async function handleDirectoryPage(request, env, requestUrl) {
  const targetUrl = buildZurgTarget(requestUrl, env);
  const response = await fetchZurg(request, env, requestUrl);
  if (!response.ok) {
    return passThroughResponse(response);
  }
  const content = await readBoundedText(response, MAX_DIRECTORY_BYTES);
  const listing = sanitizeDirectoryListing(content, targetUrl, requestUrl.origin);
  return htmlResponse(renderDirectoryPage(listing), 200, DIRECTORY_CSP);
}
__name(handleDirectoryPage, "handleDirectoryPage");
function sanitizeDirectoryListing(content, targetUrl, workerOrigin) {
  const links = [];
  const anchorPattern = /<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of content.matchAll(anchorPattern)) {
    const href = decodeHtmlEntities(match[2]);
    let destination;
    try {
      destination = new URL(href, targetUrl.href);
    } catch {
      continue;
    }
    if (destination.origin !== targetUrl.origin || !["http:", "https:"].includes(destination.protocol)) {
      continue;
    }
    const proxyUrl = new URL(destination.pathname, workerOrigin);
    proxyUrl.search = destination.search;
    const label = decodeHtmlEntities(stripHtml(match[3])).trim() || destination.pathname.split("/").filter(Boolean).at(-1) || "Open";
    links.push(`<li><a href="${escapeHtml(relativeUrl(proxyUrl))}">${escapeHtml(label)}</a></li>`);
  }
  if (links.length === 0) {
    return '<p>No files or directories were found.</p>';
  }
  return `<ol>${links.join("")}</ol>`;
}
__name(sanitizeDirectoryListing, "sanitizeDirectoryListing");
function stripHtml(value) {
  return String(value).replace(/<[^>]*>/g, "");
}
__name(stripHtml, "stripHtml");
function decodeHtmlEntities(value) {
  return String(value).replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'");
}
__name(decodeHtmlEntities, "decodeHtmlEntities");
function renderLandingPage() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Zurg HTML Proxy</title>
${PICO_STYLESHEET}
</head>
<body>
<main class="container">
<article>
<h1>Zurg HTML Proxy</h1>
<p>This Worker provides a fast, authenticated library browser and a playback interface designed for Safari and the Tesla browser.</p>
<div>
<a href="/http/" role="button">Browse files</a>
<a href="/diagnostics" role="button" class="secondary">Playback diagnostics</a>
</div>
</article>
</main>
</body>
</html>`;
}
__name(renderLandingPage, "renderLandingPage");
function renderDiagnosticsPage() {
  const fixtures = [
    {
      test: 1,
      label: "H.264 + AAC in MP4",
      file: "h264-aac.mp4",
      expected: "MP4 \xB7 H.264/AVC High (avc1) \xB7 AAC-LC (mp4a) \xB7 48 kHz stereo",
      type: 'video/mp4; codecs="avc1.64000d, mp4a.40.2"',
      videoType: 'video/mp4; codecs="avc1.64000d"',
      audioType: 'audio/mp4; codecs="mp4a.40.2"'
    },
    {
      test: 2,
      label: "H.264 + AC-3 in MP4",
      file: "h264-ac3.mp4",
      expected: "MP4 \xB7 H.264/AVC High (avc1) \xB7 AC-3 (ac-3) \xB7 48 kHz stereo",
      type: 'video/mp4; codecs="avc1.64000d, ac-3"',
      videoType: 'video/mp4; codecs="avc1.64000d"',
      audioType: 'audio/mp4; codecs="ac-3"'
    },
    {
      test: 3,
      label: "H.265 / HEVC + AAC in MP4",
      file: "hevc-aac.mp4",
      expected: "MP4 \xB7 H.265/HEVC Main (hvc1) \xB7 AAC-LC (mp4a) \xB7 48 kHz stereo",
      type: 'video/mp4; codecs="hvc1.1.6.L60.B0, mp4a.40.2"',
      videoType: 'video/mp4; codecs="hvc1.1.6.L60.B0"',
      audioType: 'audio/mp4; codecs="mp4a.40.2"'
    },
    {
      test: 4,
      label: "H.264 + AAC in MKV",
      file: "h264-aac.mkv",
      expected: "Matroska/MKV \xB7 H.264/AVC High \xB7 AAC-LC \xB7 48 kHz stereo",
      type: 'video/x-matroska; codecs="avc1, mp4a.40.2"',
      videoType: 'video/x-matroska; codecs="avc1"',
      audioType: 'audio/x-matroska; codecs="mp4a.40.2"'
    },
    {
      test: 5,
      label: "AV1 + AAC in MP4",
      file: "av1-aac.mp4",
      expected: "MP4 \xB7 AV1 Main 8-bit 4:2:0 (av01) \xB7 AAC-LC (mp4a) \xB7 48 kHz stereo",
      type: 'video/mp4; codecs="av01.0.00M.08, mp4a.40.2"',
      videoType: 'video/mp4; codecs="av01.0.00M.08"',
      audioType: 'audio/mp4; codecs="mp4a.40.2"'
    },
    {
      test: 6,
      label: "VP9 + Opus in WebM",
      file: "vp9-opus.webm",
      expected: "WebM \xB7 VP9 Profile 0 \xB7 Opus \xB7 48 kHz stereo",
      type: 'video/webm; codecs="vp09.00.10.08, opus"',
      videoType: 'video/webm; codecs="vp09.00.10.08"',
      audioType: 'audio/webm; codecs="opus"'
    }
  ];
  const audioFixtures = [
    {
      test: 7,
      label: "AAC-LC mono in M4A",
      file: "aac-mono.m4a",
      expected: "M4A/MP4 · AAC-LC (mp4a.40.2) · 1.0 mono · 48 kHz",
      type: 'audio/mp4; codecs="mp4a.40.2"',
      channels: 1,
      bitrate: 96000,
      samplerate: 48000
    },
    {
      test: 8,
      label: "AAC-LC stereo in M4A",
      file: "aac-stereo.m4a",
      expected: "M4A/MP4 · AAC-LC (mp4a.40.2) · 2.0 stereo · 48 kHz",
      type: 'audio/mp4; codecs="mp4a.40.2"',
      channels: 2,
      bitrate: 160000,
      samplerate: 48000
    },
    {
      test: 9,
      label: "AAC-LC 5.1 in M4A",
      file: "aac-5.1.m4a",
      expected: "M4A/MP4 · AAC-LC (mp4a.40.2) · 5.1 · 48 kHz · centre tone included",
      type: 'audio/mp4; codecs="mp4a.40.2"',
      channels: 6,
      bitrate: 384000,
      samplerate: 48000
    },
    {
      test: 10,
      label: "AAC-LC 7.1 in M4A",
      file: "aac-7.1.m4a",
      expected: "M4A/MP4 · AAC-LC (mp4a.40.2) · 7.1 · 48 kHz · centre tone included",
      type: 'audio/mp4; codecs="mp4a.40.2"',
      channels: 8,
      bitrate: 512000,
      samplerate: 48000
    },
    {
      test: 11,
      label: "Opus stereo in WebM",
      file: "opus-stereo.webm",
      expected: "WebM · Opus · 2.0 stereo · 48 kHz",
      type: 'audio/webm; codecs="opus"',
      channels: 2,
      bitrate: 160000,
      samplerate: 48000
    },
    {
      test: 12,
      label: "Opus 5.1 in WebM",
      file: "opus-5.1.webm",
      expected: "WebM · Opus · 5.1 · 48 kHz · centre tone included",
      type: 'audio/webm; codecs="opus"',
      channels: 6,
      bitrate: 384000,
      samplerate: 48000
    },
    {
      test: 13,
      label: "MP3 stereo",
      file: "mp3-stereo.mp3",
      expected: "MPEG audio · MP3 · 2.0 stereo · 48 kHz",
      type: "audio/mpeg",
      channels: 2,
      bitrate: 192000,
      samplerate: 48000
    },
    {
      test: 14,
      label: "AC-3 5.1 in MP4",
      file: "ac3-5.1.mp4",
      expected: "MP4 · AC-3 (ac-3) · 5.1 · 48 kHz · centre tone included",
      type: 'audio/mp4; codecs="ac-3"',
      channels: 6,
      bitrate: 384000,
      samplerate: 48000
    },
    {
      test: 15,
      label: "E-AC-3 5.1 in MP4",
      file: "eac3-5.1.mp4",
      expected: "MP4 · E-AC-3 (ec-3) · 5.1 · 48 kHz · centre tone included",
      type: 'audio/mp4; codecs="ec-3"',
      channels: 6,
      bitrate: 384000,
      samplerate: 48000
    }
  ];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Playback diagnostics</title>
${PICO_STYLESHEET}
</head>
<body>
<main class="container">
<article>
<header>
<h1>Playback diagnostics</h1>
<p>Run this page on macOS Safari, iOS Safari, and the Tesla browser while parked. Video tests are numbered <strong>Test 1</strong> through <strong>Test 6</strong>; audio tests are <strong>Test 7</strong> through <strong>Test 15</strong>. Use one test button at a time, confirm that the card changes to PLAYING, watch or listen to the fixture, and record both capability and real playback results. Capability APIs are hints; actual playback is the meaningful test.</p>
</header>
<div id="fixtures"></div>
<h2>Audio capability tests</h2>
<p>Each audio fixture is a three-second file with a different tone per channel. The centre channel uses 659 Hz, so a stereo downmix should make it audible. A PLAYING result confirms that the browser decoded and advanced the file; it does not prove that every channel was routed correctly.</p>
<div id="audio-fixtures"></div>
</article>
</main>
<script id="fixture-config" type="application/json">${jsonForHtmlScript(fixtures)}<\/script>
<script id="audio-fixture-config" type="application/json">${jsonForHtmlScript(audioFixtures)}<\/script>
<script>
(() => {
  const fixtures = JSON.parse(document.getElementById('fixture-config').textContent);
  const container = document.getElementById('fixtures');
  const capability = (video, type) => video.canPlayType(type) || 'no';
  const formatTime = (value) => Number.isFinite(value) ? value.toFixed(2) + 's' : '\u2014';
  const checkEfficiency = async (fixture) => {
    if (!navigator.mediaCapabilities || !navigator.mediaCapabilities.decodingInfo) return 'unavailable';
    try {
		const result = await navigator.mediaCapabilities.decodingInfo({
			type: 'file',
			video: { contentType: fixture.videoType, width: 320, height: 184, bitrate: 400000, framerate: 30 },
        audio: { contentType: fixture.audioType, channels: 2, bitrate: 96000, samplerate: 48000 },
      });
      return JSON.stringify({ supported: result.supported, smooth: result.smooth, powerEfficient: result.powerEfficient });
    } catch (_) {
      return 'error';
    }
  };

  fixtures.forEach((fixture) => {
    const card = document.createElement('article');
    const testName = 'Test ' + fixture.test;
    card.dataset.testNumber = String(fixture.test);
    card.setAttribute('aria-label', testName + ': ' + fixture.label);
    const testIndex = document.createElement('p');
    testIndex.textContent = testName;
    const heading = document.createElement('h2');
    heading.textContent = fixture.label;
    const specification = document.createElement('p');
    specification.textContent = 'Fixture contract: ' + fixture.expected;
    const video = document.createElement('video');
    video.width = 320;
    video.controls = true;
    video.playsInline = true;
    video.preload = 'none';
    video.muted = false;
    video.volume = 1;
    video.src = '/fixtures/' + encodeURIComponent(fixture.file);
    const playbackState = document.createElement('p');
    playbackState.className = 'playback-state';
    playbackState.textContent = 'READY \u2014 press play to test video and audio';
    const playButton = document.createElement('button');
    playButton.type = 'button';
    playButton.className = 'secondary';
    playButton.textContent = 'Play ' + testName;
    const progress = document.createElement('progress');
    progress.max = 1;
    progress.value = 0;
    progress.setAttribute('aria-label', 'Playback progress');
    const result = document.createElement('pre');
    const state = {
      metadata: 'loading',
      mediaCapabilities: 'checking',
      frames: typeof video.requestVideoFrameCallback === 'function' ? 0 : 'unavailable',
      playback: 'ready',
    };
    const renderResult = () => {
      const audio = video.muted || video.volume === 0 ? 'muted' : 'unmuted';
      const audioDecoded = typeof video.webkitAudioDecodedByteCount === 'number'
        ? video.webkitAudioDecodedByteCount + ' bytes'
        : 'not reported by this browser';
      result.textContent = [
        testName + ' \u2014 ' + fixture.label,
        'canPlayType: ' + capability(video, fixture.type),
        'playback: ' + state.playback + '; audio: ' + audio,
        'decoded audio: ' + audioDecoded,
        'time: ' + formatTime(video.currentTime) + ' / ' + formatTime(video.duration),
        'frames observed: ' + state.frames,
        'metadata: ' + state.metadata,
        'MediaCapabilities: ' + state.mediaCapabilities,
      ].join('\\n');
    };
    renderResult();
    const link = document.createElement('a');
    link.href = video.src;
    link.textContent = 'Open fixture directly';
    link.target = '_blank';
    link.rel = 'noreferrer';
    const fixtureActions = document.createElement('div');
    fixtureActions.append(playButton, link);
    card.append(testIndex, heading, specification, playbackState, video, progress, result, fixtureActions);
    container.appendChild(card);
    async function startPlayback() {
      if (video.networkState === 0) video.load();
      try {
        await video.play();
      } catch (_) {
        state.playback = 'play request rejected';
        playbackState.className = 'playback-state error';
        playbackState.textContent = 'PLAY REQUEST REJECTED \u2014 use the native play control';
        playButton.textContent = 'Retry ' + testName;
        renderResult();
      }
    }
    playButton.addEventListener('click', () => {
      if (video.paused || video.ended) startPlayback();
      else video.pause();
    });
    video.addEventListener('loadedmetadata', () => {
      state.metadata = 'loaded';
      progress.max = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
      renderResult();
    });
    video.addEventListener('play', () => {
      state.playback = 'play requested';
      playbackState.className = 'playback-state';
      playbackState.textContent = 'PLAY REQUESTED \u2014 waiting for media';
      playButton.textContent = 'Pause ' + testName;
      renderResult();
    });
    video.addEventListener('playing', () => {
      state.playback = 'PLAYING \u2014 media is advancing; listen for the tone';
      playbackState.className = 'playback-state playing';
      playbackState.textContent = 'PLAYING \u2014 media is advancing; listen for the tone';
      playButton.textContent = 'Pause ' + testName;
      renderResult();
      observeFrames();
    });
    video.addEventListener('waiting', () => {
      state.playback = 'buffering';
      playbackState.className = 'playback-state';
      playbackState.textContent = 'BUFFERING \u2014 waiting for media data';
      renderResult();
    });
    video.addEventListener('pause', () => {
      if (video.ended) return;
      state.playback = 'paused';
      playbackState.className = 'playback-state';
      playbackState.textContent = 'PAUSED \u2014 press play to continue';
      playButton.textContent = 'Play ' + testName;
      renderResult();
    });
    video.addEventListener('ended', () => {
      state.playback = 'ended';
      playbackState.className = 'playback-state';
      playbackState.textContent = 'ENDED \u2014 press play to replay';
      playButton.textContent = 'Replay ' + testName;
      renderResult();
    });
    video.addEventListener('timeupdate', () => {
      progress.value = Number.isFinite(video.currentTime) ? video.currentTime : 0;
      renderResult();
    });
    video.addEventListener('durationchange', () => {
      progress.max = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
      renderResult();
    });
    video.addEventListener('volumechange', () => {
      if (video.muted || video.volume === 0) {
        playbackState.textContent = video.paused ? 'AUDIO MUTED \u2014 enable volume before testing' : 'PLAYING \u2014 video active; audio muted';
      } else if (!video.paused && !video.ended) {
        playbackState.textContent = 'PLAYING \u2014 media is advancing; listen for the tone';
      }
      renderResult();
    });
    video.addEventListener('error', () => {
      state.playback = 'error';
      state.metadata = 'error';
      playbackState.className = 'playback-state error';
      playbackState.textContent = 'ERROR \u2014 this fixture did not play';
      playButton.textContent = 'Retry ' + testName;
      renderResult();
    });
    checkEfficiency(fixture).then((value) => {
      state.mediaCapabilities = value;
      renderResult();
    }).catch(() => {});

    let frameLoopStarted = false;
    function observeFrames() {
      if (frameLoopStarted || typeof video.requestVideoFrameCallback !== 'function') return;
      frameLoopStarted = true;
      const onFrame = () => {
        state.frames += 1;
        renderResult();
        if (!video.paused && !video.ended) {
          video.requestVideoFrameCallback(onFrame);
        } else {
          frameLoopStarted = false;
        }
      };
      video.requestVideoFrameCallback(onFrame);
    }
  });
})();
(() => {
  const fixtures = JSON.parse(document.getElementById('audio-fixture-config').textContent);
  const container = document.getElementById('audio-fixtures');
  const capability = (audio, type) => audio.canPlayType(type) || 'no';
  const formatTime = (value) => Number.isFinite(value) ? value.toFixed(2) + 's' : '\u2014';
  const checkEfficiency = async (fixture) => {
    if (!navigator.mediaCapabilities || !navigator.mediaCapabilities.decodingInfo) return 'unavailable';
    try {
      const result = await navigator.mediaCapabilities.decodingInfo({
        type: 'file',
        audio: {
          contentType: fixture.type,
          channels: String(fixture.channels),
          bitrate: fixture.bitrate,
          samplerate: fixture.samplerate
        }
      });
      return JSON.stringify({ supported: result.supported, smooth: result.smooth, powerEfficient: result.powerEfficient });
    } catch (_) {
      return 'error';
    }
  };
  const stopOtherAudio = (current) => {
    document.querySelectorAll('audio[data-audio-test]').forEach((other) => {
      if (other !== current) {
        other.pause();
        other.currentTime = 0;
      }
    });
  };

  fixtures.forEach((fixture) => {
    const card = document.createElement('article');
    const testName = 'Test ' + fixture.test;
    card.dataset.testNumber = String(fixture.test);
    card.setAttribute('aria-label', testName + ': ' + fixture.label);
    const testIndex = document.createElement('p');
    testIndex.textContent = testName;
    const heading = document.createElement('h2');
    heading.textContent = fixture.label;
    const specification = document.createElement('p');
    specification.textContent = 'Fixture contract: ' + fixture.expected;
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.preload = 'none';
    audio.volume = 1;
    audio.dataset.audioTest = String(fixture.test);
    audio.src = '/fixtures/' + encodeURIComponent(fixture.file);
    const playbackState = document.createElement('p');
    playbackState.className = 'playback-state';
    playbackState.textContent = 'READY - press play to test audio';
    const playButton = document.createElement('button');
    playButton.type = 'button';
    playButton.className = 'secondary';
    playButton.textContent = 'Play ' + testName;
    const progress = document.createElement('progress');
    progress.max = 1;
    progress.value = 0;
    progress.setAttribute('aria-label', 'Audio playback progress');
    const result = document.createElement('pre');
    const state = {
      metadata: 'loading',
      mediaCapabilities: 'checking',
      audioTracks: 'checking',
      playback: 'ready'
    };
    const readAudioTracks = () => {
      try {
        const tracks = audio.audioTracks;
        if (!tracks || typeof tracks.length !== 'number') return 'not exposed by this browser';
        return tracks.length + ' track(s) exposed';
      } catch (_) {
        return 'unavailable';
      }
    };
    const renderResult = () => {
      const decodedAudio = typeof audio.webkitAudioDecodedByteCount === 'number'
        ? audio.webkitAudioDecodedByteCount + ' bytes'
        : 'not reported by this browser';
      result.textContent = [
        testName + ' - ' + fixture.label,
        'canPlayType: ' + capability(audio, fixture.type),
        'playback: ' + state.playback,
        'expected channels: ' + fixture.channels,
        'audio tracks API: ' + state.audioTracks,
        'decoded audio: ' + decodedAudio,
        'time: ' + formatTime(audio.currentTime) + ' / ' + formatTime(audio.duration),
        'metadata: ' + state.metadata,
        'MediaCapabilities: ' + state.mediaCapabilities
      ].join('\\n');
    };
    renderResult();
    const link = document.createElement('a');
    link.href = audio.src;
    link.textContent = 'Open fixture directly';
    link.target = '_blank';
    link.rel = 'noreferrer';
    const fixtureActions = document.createElement('div');
    fixtureActions.append(playButton, link);
    card.append(testIndex, heading, specification, playbackState, audio, progress, result, fixtureActions);
    container.appendChild(card);

    async function startPlayback() {
      stopOtherAudio(audio);
      if (audio.networkState === 0) audio.load();
      try {
        await audio.play();
      } catch (_) {
        state.playback = 'play request rejected';
        playbackState.className = 'playback-state error';
        playbackState.textContent = 'PLAY REQUEST REJECTED - use the native play control';
        playButton.textContent = 'Retry ' + testName;
        renderResult();
      }
    }
    playButton.addEventListener('click', () => {
      if (audio.paused || audio.ended) startPlayback();
      else audio.pause();
    });
    audio.addEventListener('loadedmetadata', () => {
      state.metadata = 'loaded';
      state.audioTracks = readAudioTracks();
      progress.max = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 1;
      renderResult();
    });
    audio.addEventListener('play', () => {
      state.playback = 'play requested';
      playbackState.className = 'playback-state';
      playbackState.textContent = 'PLAY REQUESTED - waiting for media';
      playButton.textContent = 'Pause ' + testName;
      renderResult();
    });
    audio.addEventListener('playing', () => {
      state.playback = 'PLAYING - media is advancing; listen for the tone';
      playbackState.className = 'playback-state playing';
      playbackState.textContent = 'PLAYING - media is advancing; listen for the tone';
      playButton.textContent = 'Pause ' + testName;
      renderResult();
    });
    audio.addEventListener('waiting', () => {
      state.playback = 'buffering';
      playbackState.className = 'playback-state';
      playbackState.textContent = 'BUFFERING - waiting for media data';
      renderResult();
    });
    audio.addEventListener('pause', () => {
      if (audio.ended) return;
      state.playback = 'paused';
      playbackState.className = 'playback-state';
      playbackState.textContent = 'PAUSED - press play to continue';
      playButton.textContent = 'Play ' + testName;
      renderResult();
    });
    audio.addEventListener('ended', () => {
      state.playback = 'ended';
      playbackState.className = 'playback-state';
      playbackState.textContent = 'ENDED - press play to replay';
      playButton.textContent = 'Replay ' + testName;
      renderResult();
    });
    audio.addEventListener('timeupdate', () => {
      progress.value = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
      renderResult();
    });
    audio.addEventListener('error', () => {
      state.playback = 'error';
      state.metadata = 'error';
      playbackState.className = 'playback-state error';
      playbackState.textContent = 'ERROR - this fixture did not play';
      playButton.textContent = 'Retry ' + testName;
      renderResult();
    });
    checkEfficiency(fixture).then((value) => {
      state.mediaCapabilities = value;
      renderResult();
    }).catch(() => {});
  });
})();
<\/script>
</body>
</html>`;
}
__name(renderDiagnosticsPage, "renderDiagnosticsPage");
function renderDirectoryPage(listing) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Browse files</title>
${PICO_STYLESHEET}
</head>
<body>
<main class="container">
<article>
<header>
<h1>Browse files</h1>
<p>Choose a media file to open its playback page.</p>
</header>
${listing}
</article>
</main>
</body>
</html>`;
}
__name(renderDirectoryPage, "renderDirectoryPage");
function renderPlayerPage({ title, folder, playerMode, streamUrl, downloadUrl, resumeKey }) {
  const playerAssets = playerMode === "plyr" ? `<link rel="stylesheet" href="${PLYR_CSS_URL}" integrity="${PLYR_CSS_INTEGRITY}" crossorigin="anonymous">` : "";
  const plyrScript = playerMode === "plyr" ? `<script src="${PLYR_JS_URL}" integrity="${PLYR_JS_INTEGRITY}" crossorigin="anonymous"><\/script>` : "";
  const config = {
    title,
    folder,
    playerMode,
    streamUrl,
    downloadUrl,
    resumeKey
  };
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
${PICO_STYLESHEET}
${playerAssets}
</head>
<body>
<main class="container">
<article>
<header>
<hgroup>
<h1>${escapeHtml(title)}</h1>
${folder ? `<h2>${escapeHtml(folder)}</h2>` : ""}
</hgroup>
</header>
<section aria-label="Media player">
<div class="overflow-auto">
<video id="player" width="640" controls playsinline preload="metadata" src="${escapeHtml(streamUrl)}"></video>
</div>
<p id="status" role="status">Direct media delivery enabled. Cloudflare authorizes the source URL, then the browser fetches media directly from the upstream.</p>
<p id="error" role="alert" hidden>Direct playback could not start. The upstream must provide an HTTPS, browser-compatible media URL. No compatibility relay is available.</p>
<div>
<a href="/http/" role="button" class="secondary">Browse files</a>
<a href="/diagnostics" role="button" class="secondary">Diagnostics</a>
<button type="button" id="theatre-button" class="secondary">Theatre mode</button>
<button type="button" id="copy-button" class="secondary">Copy page URL</button>
<button type="button" id="download-button" class="secondary">Download media</button>
<button type="button" id="switch-player" class="secondary">Switch to ${playerMode === "plyr" ? "native" : "Plyr"}</button>
</div>
</section>
</article>
</main>
<script id="player-config" type="application/json">${jsonForHtmlScript(config)}<\/script>
${plyrScript}
<script>
(() => {
  const config = JSON.parse(document.getElementById('player-config').textContent);
  const video = document.getElementById('player');
  const status = document.getElementById('status');
  const error = document.getElementById('error');
  const copyButton = document.getElementById('copy-button');
  const downloadButton = document.getElementById('download-button');
  const theatreButton = document.getElementById('theatre-button');
  const switchButton = document.getElementById('switch-player');

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle('error', isError);
  }

  function savePosition() {
    if (!Number.isFinite(video.currentTime) || video.currentTime <= 0) return;
    try { localStorage.setItem(config.resumeKey, String(video.currentTime)); } catch (_) {}
  }

  video.addEventListener('loadedmetadata', () => {
    try {
      const saved = Number(localStorage.getItem(config.resumeKey));
      if (saved > 5 && (!Number.isFinite(video.duration) || saved < video.duration - 5)) {
        video.currentTime = saved;
        setStatus('Resumed from the last position.');
      }
    } catch (_) {}
  });
  video.addEventListener('timeupdate', () => {
    if (Math.floor(video.currentTime) % 5 === 0) savePosition();
  });
  window.addEventListener('pagehide', savePosition);

  video.addEventListener('error', () => {
    error.hidden = false;
    setStatus('The source could not be played in this browser.', true);
  });

  async function copyText(value) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const input = document.createElement('input');
        input.value = value;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        input.remove();
      }
      copyButton.textContent = 'Copied';
      setTimeout(() => { copyButton.textContent = 'Copy page URL'; }, 2000);
    } catch (_) {
      setStatus('Copy is unavailable in this browser.', true);
    }
  }

  copyButton.addEventListener('click', () => copyText(window.location.href));
  downloadButton.addEventListener('click', () => {
    if (confirm('Open the direct media URL? The upstream controls whether it plays inline or downloads.')) {
      window.location.href = config.downloadUrl;
    }
  });

  theatreButton.addEventListener('click', async () => {
    try {
      if (typeof video.webkitEnterFullscreen === 'function') {
        video.webkitEnterFullscreen();
      } else if (typeof video.requestFullscreen === 'function') {
        await video.requestFullscreen();
      } else if (typeof document.documentElement.requestFullscreen === 'function') {
        await document.documentElement.requestFullscreen();
      } else {
        setStatus('Fullscreen is not available in this browser.', true);
      }
    } catch (_) {
      setStatus('Fullscreen was declined by the browser.', true);
    }
  });

  switchButton.addEventListener('click', () => {
    savePosition();
    const nextUrl = new URL(window.location.href);
    if (config.playerMode === 'plyr') nextUrl.searchParams.delete('player');
    else nextUrl.searchParams.set('player', 'plyr');
    window.location.href = nextUrl.toString();
  });

  if (config.playerMode === 'plyr') {
    if (typeof window.Plyr === 'function') {
      try {
        const enhancedPlayer = new window.Plyr('#player', {
          controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'fullscreen'],
          keyboard: { focused: true, global: true },
        });
        enhancedPlayer.on('ready', () => setStatus('Plyr controls ready.'));
      } catch (_) {
        setStatus('Plyr could not initialize; using native controls.', true);
      }
    } else {
      setStatus('Plyr was unavailable; using native controls.', true);
    }
  }

  if (navigator.mediaSession) {
    if (typeof window.MediaMetadata === 'function') {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: config.title,
        album: config.folder || 'Zurg media',
      });
    }
    const actions = {
      play: () => { video.play().catch(() => {}); },
      pause: () => { video.pause(); },
      seekbackward: (details) => { video.currentTime = Math.max(0, video.currentTime - (details.seekOffset || 10)); },
      seekforward: (details) => { video.currentTime = Math.min(video.duration || Infinity, video.currentTime + (details.seekOffset || 10)); },
      seekto: (details) => { if (typeof details.seekTime === 'number') video.currentTime = details.seekTime; },
    };
    Object.entries(actions).forEach(([action, handler]) => {
      try { navigator.mediaSession.setActionHandler(action, handler); } catch (_) {}
    });
    const updateMediaSession = () => {
      try {
        if (typeof navigator.mediaSession.setPositionState === 'function' && Number.isFinite(video.duration) && video.duration > 0) {
          navigator.mediaSession.setPositionState({ duration: video.duration, playbackRate: video.playbackRate || 1, position: Math.min(video.currentTime, video.duration) });
        }
      } catch (_) {}
    };
    video.addEventListener('timeupdate', updateMediaSession);
    video.addEventListener('ratechange', updateMediaSession);
  }
})();
<\/script>
</body>
</html>`;
}
__name(renderPlayerPage, "renderPlayerPage");
function relativeUrl(url) {
  return `${url.pathname}${url.search}`;
}
__name(relativeUrl, "relativeUrl");
async function readBoundedText(response, maxBytes) {
  const contentLength = Number(response.headers.get("Content-Length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error("Response exceeds the permitted size");
  }
  if (!response.body) {
    return "";
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("Response exceeds the permitted size");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
__name(readBoundedText, "readBoundedText");
function passThroughResponse(response) {
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
}
__name(passThroughResponse, "passThroughResponse");
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
