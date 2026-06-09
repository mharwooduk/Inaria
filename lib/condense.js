const METRIC_IDS = [
  'first-contentful-paint',
  'largest-contentful-paint',
  'total-blocking-time',
  'cumulative-layout-shift',
  'speed-index',
  'interactive',
];

const EXCLUDED_SCORE_MODES = new Set(['informative', 'manual', 'notApplicable']);
const DEFAULT_MAX_ELEMENTS_PER_ISSUE = 15;
const DEFAULT_MAX_RESOURCES = 10;

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
 * @param {number} [maxElements=DEFAULT_MAX_ELEMENTS_PER_ISSUE]
 */
function extractFailingElements(details, maxElements = DEFAULT_MAX_ELEMENTS_PER_ISSUE) {
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
    if (Number.isFinite(maxElements) && unique.length >= maxElements) break;
  }

  return unique.length ? unique : undefined;
}

/**
 * @param {import('lighthouse').AuditResult['details']} details
 * @param {number} [maxResources=DEFAULT_MAX_RESOURCES]
 */
function extractResources(details, maxResources = DEFAULT_MAX_RESOURCES) {
  if (!details?.items?.length || details.type !== 'opportunity') return undefined;

  const limit = Number.isFinite(maxResources) ? maxResources : details.items.length;
  const resources = details.items
    .slice(0, limit)
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
 * @typedef {object} CondenseOptions
 * @property {number} [maxIssues=25]
 * @property {number} [maxElementsPerIssue=15]
 * @property {number} [maxResources=10]
 */

/**
 * @param {import('lighthouse').AuditResult} audit
 * @param {CondenseOptions} [options]
 */
function condenseIssue(audit, options = {}) {
  const maxElementsPerIssue = options.maxElementsPerIssue ?? DEFAULT_MAX_ELEMENTS_PER_ISSUE;
  const maxResources = options.maxResources ?? DEFAULT_MAX_RESOURCES;

  const issue = {
    id: audit.id,
    title: audit.title,
    score: audit.score,
    ...(audit.description ? { description: audit.description } : {}),
    ...(audit.displayValue ? { displayValue: audit.displayValue } : {}),
  };

  const failingElements = extractFailingElements(audit.details, maxElementsPerIssue);
  if (failingElements) issue.failingElements = failingElements;

  const resources = extractResources(audit.details, maxResources);
  if (resources) issue.resources = resources;

  return issue;
}

/**
 * @param {import('lighthouse').Result} lhr
 * @param {number | CondenseOptions} [maxIssuesOrOptions=25]
 */
export function condense(lhr, maxIssuesOrOptions = 25) {
  const options =
    typeof maxIssuesOrOptions === 'object'
      ? maxIssuesOrOptions
      : { maxIssues: maxIssuesOrOptions };
  const maxIssues = options.maxIssues ?? 25;
  const condenseOptions = {
    maxElementsPerIssue: options.maxElementsPerIssue ?? DEFAULT_MAX_ELEMENTS_PER_ISSUE,
    maxResources: options.maxResources ?? DEFAULT_MAX_RESOURCES,
  };
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
    .slice(0, Number.isFinite(maxIssues) ? maxIssues : undefined)
    .map((audit) => condenseIssue(audit, condenseOptions));

  return {
    url: lhr.finalUrl,
    formFactor: lhr.configSettings.formFactor,
    fetchTime: lhr.fetchTime,
    scores,
    metrics,
    issues,
  };
}
