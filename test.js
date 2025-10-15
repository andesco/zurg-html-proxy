const finalVideoUrl = "http://example.com";
const downloadButton = document.getElementById('download-button');

downloadButton.addEventListener('click', async () => {
  const resolveUrl = `/resolve-redirect?url=${encodeURIComponent(finalVideoUrl)}`;
  const response = await fetch(resolveUrl);
  const { finalUrl: resolvedUrl } = await response.json();
  const domain = new URL(resolvedUrl).hostname;

  if (confirm(`Are you sure you want to download this file from ${domain}?`)) {
    window.location.href = resolvedUrl;
  }
});
