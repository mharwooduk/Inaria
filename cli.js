#!/usr/bin/env node

import { writeFileSync } from 'node:fs';
import { Command } from 'commander';
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

function writeOutput(data, outputPath) {
  const json = `${JSON.stringify(data, null, 2)}\n`;
  if (outputPath) {
    writeFileSync(outputPath, json, 'utf8');
  } else {
    process.stdout.write(json);
  }
}

const program = new Command();

program
  .name('inaria')
  .summary('Condensed Lighthouse audits as JSON for AI tools and scripts')
  .description(
    'Run Lighthouse against a single page or every URL in a sitemap. Writes condensed JSON to stdout; progress and status messages go to stderr.',
  )
  .argument(
    '[url]',
    'Page to audit (must be http or https). Not used with --sitemap.',
  )
  .option(
    '--desktop',
    'Run a desktop audit. Included by default unless you pass only --mobile.',
  )
  .option(
    '--mobile',
    'Run a mobile audit. Pass with --desktop to audit both form factors.',
  )
  .option(
    '--sitemap <url>',
    'Fetch a sitemap (supports nested sitemap indexes) and audit every listed page. Replaces the [url] argument.',
  )
  .option(
    '-c, --concurrency <n>',
    'Number of parallel Chrome workers for --sitemap scans. Higher is faster but uses more RAM. Default: half of CPU cores, capped at 4.',
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
    'Write JSON results to this file instead of stdout. Progress still prints to stderr.',
  )
  .addHelpText(
    'after',
    `
Modes:
  Single page     inaria <url> [options]
  Sitemap crawl   inaria --sitemap <sitemap-url> [options]

Form factors (single-page and sitemap):
  (none)                  desktop only
  --mobile                mobile only
  --desktop --mobile      both; JSON is an array of two audit objects per page

Output:
  stdout                  condensed JSON (safe to pipe to jq or an AI agent)
  -o, --output <file>     same JSON written to a file
  stderr                  fetch/scan progress, per-page status, and errors

Sitemap JSON shape:
  { sitemap, total, scanned, pages: [{ url, audits | error }, ...] }
`,
  )
  .action(async (url, options) => {
    try {
      const formFactors = resolveFormFactors(options);

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
        });
        writeOutput(
          {
            sitemap: sitemapUrl,
            total: urls.length,
            scanned: pages.length,
            pages,
          },
          options.output,
        );
        return;
      }

      if (!url) {
        throw new Error('Provide a URL or use --sitemap <url>');
      }

      const validatedUrl = validateUrl(url);
      const results = await runAudits(validatedUrl, formFactors);
      writeOutput(results.length === 1 ? results[0] : results, options.output);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`inaria: ${message}\n`);
      process.exit(1);
    }
  });

program.parse();
