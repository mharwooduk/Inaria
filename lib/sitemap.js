/**
 * @param {string} xml
 */
function extractLocs(xml) {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((match) =>
    match[1].trim(),
  );
}

/**
 * @param {string} xml
 */
function isSitemapIndex(xml) {
  return /<sitemapindex[\s>]/i.test(xml);
}

/**
 * @param {string} sitemapUrl
 */
async function fetchSitemapXml(sitemapUrl) {
  const response = await fetch(sitemapUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch sitemap (${response.status}): ${sitemapUrl}`);
  }

  const xml = await response.text();
  if (!xml.trim()) {
    throw new Error(`Sitemap is empty: ${sitemapUrl}`);
  }

  return xml;
}

/**
 * @param {string} sitemapUrl
 * @param {Set<string>} [visited]
 */
export async function fetchSitemapUrls(sitemapUrl, visited = new Set()) {
  if (visited.has(sitemapUrl)) return [];
  visited.add(sitemapUrl);

  const xml = await fetchSitemapXml(sitemapUrl);

  if (isSitemapIndex(xml)) {
    const childSitemaps = extractLocs(xml);
    const nested = await Promise.all(
      childSitemaps.map((childUrl) => fetchSitemapUrls(childUrl, visited)),
    );
    return dedupeUrls(nested.flat());
  }

  return dedupeUrls(extractLocs(xml));
}

/**
 * @param {string[]} urls
 */
function dedupeUrls(urls) {
  const seen = new Set();
  const unique = [];

  for (const url of urls) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    unique.push(url);
  }

  return unique;
}
