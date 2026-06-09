# Inaria — agent tool reference

Copy this section into your project's `AGENTS.md`, Cursor rules, or similar agent context.

## Inaria (Lighthouse CLI for agents)

`inaria` runs condensed Lighthouse audits and prints small JSON to stdout. Built for AI fix loops — not HTML reports.

**Prerequisites:** Node.js 22+, Chrome/Chromium installed on the machine.

**Install / run (no global install required):**

```bash
npx inaria <url> [options]
npx inaria --sitemap <sitemap-url> [options]
npx inaria --version
```

**Commands:**

```bash
# Check version
npx inaria --version

# Single page (desktop default)
npx inaria https://example.com

# Both form factors
npx inaria https://example.com --desktop --mobile

# Sitemap sweep with parallel workers
npx inaria --sitemap https://example.com/sitemap.xml -c 4

# Write to file (pretty-printed by default)
npx inaria https://example.com -o audit.json
```

**Output modes:**

| Mode | Flag |
|------|------|
| Default | Scores, metrics, top 25 issues |
| All issues | `--all-issues` |
| Full report | `--fullreport` (1–5+ MB; not for LLM pipes) |

**JSON formatting:**

| Target | Format |
|--------|--------|
| stdout | Compact JSON (default) |
| `-o, --output <file>` | Pretty JSON (default) |
| `--compact` | Force compact JSON |
| `--pretty` | Force pretty JSON |

**Info:**

| Flag | Description |
|------|-------------|
| `-V, --version` | Print CLI version and exit |
| `-h, --help` | Full usage reference |

**Streams:**

- **stdout** — JSON output only
- **stderr** — progress, status, errors

**Sitemap result shape:** `{ sitemap, total, scanned, pages: [{ url, audits | error }] }`

**JSON shape (condensed):**

```json
{
  "url": "https://example.com/",
  "formFactor": "desktop",
  "fetchTime": "2026-06-09T12:00:00.000Z",
  "scores": { "performance": 92, "accessibility": 88, "best-practices": 100, "seo": 91 },
  "metrics": { "largest-contentful-paint": { "score": 0.9, "displayValue": "2.1 s" } },
  "issues": [
    {
      "id": "color-contrast",
      "title": "Background and foreground colors do not have a sufficient contrast ratio.",
      "score": 0,
      "failingElements": [
        { "label": "span", "selector": "main > p.muted", "snippet": "<span class=\"muted\">" }
      ]
    }
  ]
}
```

**Fix-loop workflow:**

1. Run `npx inaria <url> --desktop --mobile` against local dev server or staging URL.
2. Read `issues` — prioritize `score: 0` and low category scores in `scores`.
3. Use `failingElements.selector` and `snippet` to locate source in the codebase.
4. Apply fixes in the repo.
5. Re-run `inaria` — confirm scores improved and issues are gone.

**Tips:**

- Audit the URL the dev server actually serves (port, `http` vs `https`).
- `failingElements.label` is often the element tag or visible text; `selector` is Lighthouse's CSS path.
- Performance issues with `resources` list URLs and wasted bytes to optimize.
- Run both form factors — mobile and desktop surface different issues.
- Use `--pretty` if you need readable stdout; default stdout is compact to save tokens.
