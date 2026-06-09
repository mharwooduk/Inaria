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

/**
 * @param {string} url
 * @param {'desktop' | 'mobile'} formFactor
 * @param {number} port
 */
async function runSingleAudit(url, formFactor, port) {
  const config = formFactor === 'desktop' ? desktopConfig : undefined;
  const runner = await lighthouse(url, { ...LIGHTHOUSE_FLAGS, port }, config);

  if (!runner?.lhr) {
    throw new Error(`Lighthouse returned no result for ${formFactor} audit`);
  }

  return condense(runner.lhr);
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
 * @param {string} url
 * @param {Array<'desktop' | 'mobile'>} formFactors
 * @param {number} port
 * @param {boolean} [verbose]
 */
export async function runAuditsOnPort(url, formFactors, port, verbose = false) {
  const results = [];
  for (const formFactor of formFactors) {
    if (verbose) {
      reportSingleAudit(url, formFactor);
    }
    results.push(await runSingleAudit(url, formFactor, port));
  }
  return results;
}

/**
 * @param {string} url
 * @param {Array<'desktop' | 'mobile'>} formFactors
 */
export async function runAudits(url, formFactors) {
  const chrome = await launchChrome();
  try {
    return await runAuditsOnPort(url, formFactors, chrome.port, true);
  } finally {
    await killChrome(chrome);
  }
}

/**
 * @typedef {object} SitemapAuditOptions
 * @property {number} [concurrency]
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
          const audits = await runAuditsOnPort(url, formFactors, worker.chrome.port);
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
