#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Command } from 'commander';

const require = createRequire(import.meta.url);
const { version } = require('./package.json');
import { defaultConcurrency } from './lib/progress.js';
import { runAudits, runSitemapAudits } from './lib/run-audit.js';
import { fetchSitemapUrls } from './lib/sitemap.js';

function validateUrl(url, label = 'URL') {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid ${label}: ${url}`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${label} must use http or https: ${url}`);
  }
  return parsed.href;
}

function resolveFormFactors(options) {
  const factors = [];
  if (options.mobile) factors.push('mobile');
  if (options.desktop || factors.length === 0) factors.push('desktop');
  return factors;
}

/**
 * @param {object} options
 * @returns {'condensed' | 'all-issues' | 'full'}
 */

function resolveOutputMode(options) {
  if (options.fullreport) return 'full';
  if (options.allIssues) return 'all-issues';
  return 'condensed';

}

/**
 * @param {unknown} data
 * @param {string | undefined} outputPath
 * @param {{ compact?: boolean; pretty?: boolean }} options
 */

function writeOutput(data, outputPath, options = {}) {
  const compact = options.pretty ? false : (options.compact ?? !outputPath);
  const json = compact
    ? `${JSON.stringify(data)}\n`
    : `${JSON.stringify(data, null, 2)}\n`;

  if (outputPath) {
    writeFileSync(outputPath, json, 'utf8');
  } else {
    process.stdout.write(json);
  }
}

const program = new Command();

program
  .name('inaria')
  .version(version)
  .summary('Condensed Lighthouse audits as JSON for AI tools and scripts')
  .addHelpText(
    'before', 
    `
 ▄▄▄▄▄                         ▀          
   █    ▄ ▄▄    ▄▄▄    ▄ ▄▄  ▄▄▄     ▄▄▄  
   █    █▀  █  ▀   █   █▀  ▀   █    ▀   █ 
   █    █   █  ▄▀▀▀█   █       █    ▄▀▀▀█ 
 ▄▄█▄▄  █   █  ▀▄▄▀█   █     ▄▄█▄▄  ▀▄▄▀█ ${version}
    `
  )
  .description(
    'Run Lighthouse on a page or sitemap. JSON to stdout; progress to stderr. Turns megabytes of audit noise into a few kilobytes of actionable context for coding agents',
  )

  .argument(
    '[url]',
    'Page URL (http/https). Omit with --sitemap.',
  )

  .option(
    '--desktop',
    'Desktop audit (default unless --mobile only).',
  )

  .option(
    '--mobile',
    'Mobile audit. Use with --desktop for both.',
  )

  .option(
    '--sitemap <url>',
    'Audit all URLs from sitemap (nested indexes supported).',
  )

  .option(
    '-c, --concurrency <n>',
    'Parallel Chrome workers for sitemap scans (default: half CPU cores, max 4).',
    (value) => {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isFinite(parsed) || parsed < 1) {
        throw new Error('concurrency must be a positive integer');
      }
      return parsed;
    },
  )

  .option(
    '-o, --output <file>',
    'Save JSON to file instead of stdout.',
  )

  .option(
    '--fullreport',
    'Full Lighthouse JSON (1–5+ MB). Not for AI pipes.',
  )

  .option(
    '--all-issues',
    'All failing audits and elements (no caps). Ignored with --fullreport.',
  )

  .option(
    '--compact',
    'Force compact JSON (default on stdout).',
  )

  .option(
    '--pretty',
    'Force pretty JSON (default with -o).',
  )

  .addHelpText(
    'after',
    `
EXAMPLES
  inaria https://example.com
  inaria https://example.com --desktop --mobile -o report.json
  inaria --sitemap https://example.com/sitemap.xml -c 4
`,
  )

  .action(async (url, options) => {
    try {
      const formFactors = resolveFormFactors(options);
      const outputMode = resolveOutputMode(options);
      const outputOptions = { compact: options.compact, pretty: options.pretty };

      if (outputMode === 'full') {
        process.stderr.write(
          'inaria: --fullreport emits raw Lighthouse JSON (large). Not recommended for AI pipes.\n',
        );
      }

      if (options.sitemap) {
        const sitemapUrl = validateUrl(options.sitemap, 'sitemap URL');
        process.stderr.write(`inaria: fetching sitemap ${sitemapUrl}\n`);

        const urls = await fetchSitemapUrls(sitemapUrl);

        if (!urls.length) {
          throw new Error(`No URLs found in sitemap: ${sitemapUrl}`);
        }

        const workers = options.concurrency ?? defaultConcurrency();
        process.stderr.write(
          `inaria: found ${urls.length} URLs — ${workers} parallel worker(s)\n\n`,
        );

        const pages = await runSitemapAudits(urls, formFactors, {
          concurrency: workers,
          outputMode,
        });

        writeOutput(
          {
            sitemap: sitemapUrl,
            total: urls.length,
            scanned: pages.length,
            pages,
          },

          options.output,
          outputOptions,
        );
        return;
      }

      if (!url) {
        throw new Error('Provide a URL or use --sitemap <url>');
      }

      const validatedUrl = validateUrl(url);
      const results = await runAudits(validatedUrl, formFactors, { outputMode });
      writeOutput(results.length === 1 ? results[0] : results, options.output, outputOptions);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`inaria: ${message}\n`);
      process.exit(1);
    }
  });

program.parse();