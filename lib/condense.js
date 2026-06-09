const METRIC_IDS = [
  'first-contentful-paint',
  'largest-contentful-paint',
  'total-blocking-time',
  'cumulative-layout-shift',
  'speed-index',
  'interactive',
];

const EXCLUDED_SCORE_MODES = new Set(['informative', 'manual', 'notApplicable']);
const MAX_ELEMENTS_PER_ISSUE = 15;

/**
 * @param {Record<string, unknown>} item
 */
function extractNodeFromItem(item) {
  const node = item.node ?? (item.type === 'node' ? item : item.relatedNode);
  if (!node || typeof node !== 'object') return null;

  const label = node.nodeLabel;
  const selector = node.selector;
  const snippet = node.snippet;
  const explanation = node.explanation;

  if (!label && !selector && !snippet) return null;

  return {
    ...(label ? { label } : {}),
    ...(selector ? { selector } : {}),
    ...(snippet ? { snippet } : {}),
    ...(explanation ? { explanation } : {}),
  };
}

/**
 * @param {import('lighthouse').AuditResult['details']} details
 */
function extractFailingElements(details) {
  if (!details?.items?.length) return undefined;

  const elements = [];

  for (const item of details.items) {
    const node = extractNodeFromItem(item);
    if (node) elements.push(node);

    if (item.subItems?.items) {
      for (const subItem of item.subItems.items) {
        const related = extractNodeFromItem(subItem);
        if (related) elements.push(related);
      }
    }
  }

  const seen = new Set();
  const unique = [];

  for (const element of elements) {
    const key = `${element.label ?? ''}|${element.selector ?? ''}|${element.snippet ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(element);
    if (unique.length >= MAX_ELEMENTS_PER_ISSUE) break;
  }

  return unique.length ? unique : undefined;
}

/**
 * @param {import('lighthouse').AuditResult['details']} details
 */
function extractResources(details) {
  if (!details?.items?.length || details.type !== 'opportunity') return undefined;

  const resources = details.items
    .slice(0, 10)
    .map((item) => ({
      ...(item.url ? { url: item.url } : {}),
      ...(item.wastedBytes != null ? { wastedBytes: item.wastedBytes } : {}),
      ...(item.wastedMs != null ? { wastedMs: item.wastedMs } : {}),
      ...(item.totalBytes != null ? { totalBytes: item.totalBytes } : {}),
    }))
    .filter((item) => Object.keys(item).length > 0);

  return resources.length ? resources : undefined;
}

/**
 * @param {import('lighthouse').AuditResult} audit
 */
function condenseIssue(audit) {
  const issue = {
    id: audit.id,
    title: audit.title,
    score: audit.score,
    ...(audit.description ? { description: audit.description } : {}),
    ...(audit.displayValue ? { displayValue: audit.displayValue } : {}),
  };

  const failingElements = extractFailingElements(audit.details);
  if (failingElements) issue.failingElements = failingElements;

  const resources = extractResources(audit.details);
  if (resources) issue.resources = resources;

  return issue;
}

/**
 * @param {import('lighthouse').Result} lhr
 * @param {number} [maxIssues=25]
 */
export function condense(lhr, maxIssues = 25) {
  const scores = Object.fromEntries(
    Object.entries(lhr.categories).map(([id, cat]) => [
      id,
      Math.round((cat.score ?? 0) * 100),
    ]),
  );

  const metrics = Object.fromEntries(
    METRIC_IDS.filter((id) => lhr.audits[id]).map((id) => {
      const audit = lhr.audits[id];
      return [
        id,
        {
          score: audit.score,
          displayValue: audit.displayValue,
          numericValue: audit.numericValue,
        },
      ];
    }),
  );

  const issues = Object.values(lhr.audits)
    .filter(
      (audit) =>
        audit.score !== null &&
        audit.score < 1 &&
        !EXCLUDED_SCORE_MODES.has(audit.scoreDisplayMode),
    )
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
    .slice(0, maxIssues)
    .map(condenseIssue);

  return {
    url: lhr.finalUrl,
    formFactor: lhr.configSettings.formFactor,
    fetchTime: lhr.fetchTime,
    scores,
    metrics,
    issues,
  };
}
