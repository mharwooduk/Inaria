#!/usr/bin/env node

import { writeFileSync } from 'node:fs';
import { Command } from 'commander';
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
  .description('Run Lighthouse audits and output condensed JSON')
  .argument('[url]', 'URL to audit')
  .option('--desktop', 'run desktop audit')
  .option('--mobile', 'run mobile audit')
  .option('--sitemap <url>', 'sitemap URL — audit every page listed in the sitemap')
  .option('-o, --output <file>', 'write JSON to file instead of stdout')
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

        process.stderr.write(`inaria: found ${urls.length} URLs to scan\n`);

        const pages = await runSitemapAudits(urls, formFactors);
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
