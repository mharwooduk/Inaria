import * as chromeLauncher from 'chrome-launcher';
import lighthouse, { desktopConfig } from 'lighthouse';
import { condense } from './condense.js';
import {
  createSitemapProgress,
  defaultConcurrency,
  reportSingleAudit,
} from './progress.js';

const LIGHTHOUSE_FLAGS = {
  logLevel: 'error',
  output: 'json',
  onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
};

/** @typedef {'condensed' | 'all-issues' | 'full'} OutputMode */

/**
 * @param {import('lighthouse').Result} lhr
 * @param {OutputMode} outputMode
 */
function formatResult(lhr, outputMode) {
  if (outputMode === 'full') return lhr;
  if (outputMode === 'all-issues') {
    return condense(lhr, {
      maxIssues: Infinity,
      maxElementsPerIssue: Infinity,
      maxResources: Infinity,
    });
  }
  return condense(lhr);
}

/**
 * @param {string} url
 * @param {'desktop' | 'mobile'} formFactor
 * @param {number} port
 * @param {OutputMode} [outputMode='condensed']
 */
async function runSingleAudit(url, formFactor, port, outputMode = 'condensed') {
  const config = formFactor === 'desktop' ? desktopConfig : undefined;
  const runner = await lighthouse(url, { ...LIGHTHOUSE_FLAGS, port }, config);

  if (!runner?.lhr) {
    throw new Error(`Lighthouse returned no result for ${formFactor} audit`);
  }

  return formatResult(runner.lhr, outputMode);
}

async function launchChrome() {
  return chromeLauncher.launch({ chromeFlags: ['--headless'] });
}

/**
 * @param {import('chrome-launcher').LaunchedChrome} chrome
 */
async function killChrome(chrome) {
  try {
    await chrome.kill();
  } catch (error) {
    if (error?.code !== 'EPERM') {
      throw error;
    }
  }
}

/**
 * @typedef {object} AuditRunOptions
 * @property {OutputMode} [outputMode]
 * @property {boolean} [verbose]
 */

/**
 * @param {string} url
 * @param {Array<'desktop' | 'mobile'>} formFactors
 * @param {number} port
 * @param {AuditRunOptions} [options]
 */
export async function runAuditsOnPort(url, formFactors, port, options = {}) {
  const { outputMode = 'condensed', verbose = false } = options;
  const results = [];
  for (const formFactor of formFactors) {
    if (verbose) {
      reportSingleAudit(url, formFactor);
    }
    results.push(await runSingleAudit(url, formFactor, port, outputMode));
  }
  return results;
}

/**
 * @param {string} url
 * @param {Array<'desktop' | 'mobile'>} formFactors
 * @param {AuditRunOptions} [options]
 */
export async function runAudits(url, formFactors, options = {}) {
  const chrome = await launchChrome();
  try {
    return await runAuditsOnPort(url, formFactors, chrome.port, {
      ...options,
      verbose: true,
    });
  } finally {
    await killChrome(chrome);
  }
}

/**
 * @typedef {object} SitemapAuditOptions
 * @property {number} [concurrency]
 * @property {OutputMode} [outputMode]
 * @property {ReturnType<typeof createSitemapProgress>} [progress]
 */

/**
 * @param {string[]} urls
 * @param {Array<'desktop' | 'mobile'>} formFactors
 * @param {SitemapAuditOptions} [options]
 */
export async function runSitemapAudits(urls, formFactors, options = {}) {
  const concurrency = Math.max(
    1,
    Math.min(
      options.concurrency ?? defaultConcurrency(),
      urls.length,
    ),
  );
  const progress = options.progress ?? createSitemapProgress(urls.length);
  const pages = new Array(urls.length);
  let nextIndex = 0;

  /** @type {Array<{ chrome: import('chrome-launcher').LaunchedChrome }>} */
  const workers = [];

  try {
    for (let index = 0; index < concurrency; index += 1) {
      workers.push({ chrome: await launchChrome() });
    }

    async function runWorker(worker) {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= urls.length) break;

        const url = urls[index];
        progress.onStart(url);

        try {
          const audits = await runAuditsOnPort(url, formFactors, worker.chrome.port, {
            outputMode: options.outputMode,
          });
          pages[index] = {
            url,
            audits: audits.length === 1 ? audits[0] : audits,
          };
          progress.onComplete(url, true);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          pages[index] = { url, error: message };
          progress.onComplete(url, false);
        }
      }
    }

    await Promise.all(workers.map((worker) => runWorker(worker)));
  } finally {
    progress.finish();
    await Promise.all(workers.map((worker) => killChrome(worker.chrome)));
  }

  return pages;
}
