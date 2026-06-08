import * as chromeLauncher from 'chrome-launcher';
import lighthouse, { desktopConfig } from 'lighthouse';
import { condense } from './condense.js';
import { clearScanProgress, reportScanProgress } from './progress.js';

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
 */
export async function runAuditsOnPort(url, formFactors, port) {
  const results = [];
  for (const formFactor of formFactors) {
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
    return await runAuditsOnPort(url, formFactors, chrome.port);
  } finally {
    await killChrome(chrome);
  }
}

/**
 * @param {string[]} urls
 * @param {Array<'desktop' | 'mobile'>} formFactors
 * @param {(current: number, total: number, url: string) => void} [onProgress]
 */
export async function runSitemapAudits(urls, formFactors, onProgress = reportScanProgress) {
  const chrome = await launchChrome();
  const pages = [];

  try {
    for (let index = 0; index < urls.length; index += 1) {
      const url = urls[index];
      onProgress(index + 1, urls.length, url);

      try {
        const audits = await runAuditsOnPort(url, formFactors, chrome.port);
        pages.push({
          url,
          audits: audits.length === 1 ? audits[0] : audits,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        pages.push({ url, error: message });
      }
    }
  } finally {
    clearScanProgress();
    await killChrome(chrome);
  }

  return pages;
}
