import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC_POSTS = path.join(ROOT, 'posts');
const OUT_POSTS = path.join(ROOT, 'src', 'content', 'posts');
const OUT_PUBLIC = path.join(ROOT, 'public');

function collectPostDirs(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'page') continue; // pagination artifacts
      collectPostDirs(full, acc);
    } else if (entry.isFile() && entry.name === 'index.html' && !full.includes(`${path.sep}page${path.sep}`)) {
      acc.push(full);
    }
  }
  return acc;
}

function yamlStr(s) {
  return JSON.stringify(String(s ?? ''));
}

function makeTurndown() {
  const td = new TurndownService({
    codeBlockStyle: 'fenced',
    headingStyle: 'atx',
    bulletListMarker: '-',
    emDelimiter: '*',
    strongDelimiter: '**',
    hr: '---',
  });
  td.use(gfm);
  td.remove(['script', 'style']);

  // Fenced code blocks with language preserved from chroma output
  td.addRule('fencedCodeBlock', {
    filter(node, options) {
      return (
        options.codeBlockStyle === 'fenced' &&
        node.nodeName === 'PRE' &&
        node.firstChild &&
        node.firstChild.nodeName === 'CODE'
      );
    },
    replacement(content, node, options) {
      const codeEl = node.firstChild;
      const className = codeEl.getAttribute('class') || '';
      const language = (className.match(/language-(\S+)/) || [null, ''])[1];
      let code = codeEl.textContent.replace(/^\n+/, '').replace(/\n+$/, '');
      const fenceChar = options.fence.charAt(0);
      let fenceSize = 3;
      const fenceInCodeRegex = new RegExp(`^\\s*${fenceChar}{3,}`, 'gm');
      let m;
      while ((m = fenceInCodeRegex.exec(code))) {
        if (m[0].length >= fenceSize) fenceSize = m[0].length + 1;
      }
      const fence = Array(fenceSize + 1).join(fenceChar);
      return `\n\n${fence}${language}\n${code}\n${fence}\n\n`;
    },
  });

  // Drop tiny favicon images injected into resource lists
  td.addRule('dropFavicons', {
    filter(node) {
      return node.nodeName === 'IMG' && /google\.com\/s2\/favicons/.test(node.getAttribute('src') || '');
    },
    replacement: () => '',
  });

  return td;
}

function transformContent($) {
  const $content = $('#content');
  if ($content.length === 0) return null;

  // 1. Chroma highlighted code -> plain pre>code.language-x
  $('div.highlight').each((_, el) => {
    const $el = $(el);
    const $code = $el.find('pre.chroma > code').first();
    const lang = $code.attr('data-lang') || $code.attr('class')?.match(/language-(\S+)/)?.[1] || '';
    const text = $code.text().replace(/^\n+/, '').replace(/\n+$/, '');
    const $replacement = cheerio.load('<div></div>')('div');
    $replacement.append(`<pre><code class="language-${lang}"></code></pre>`);
    $replacement.find('code').text(text);
    $el.replaceWith($.html($replacement.children()));
  });

  // 2. Admonitions -> blockquote with bold title
  $('div.details.admonition, div.admonition').each((_, el) => {
    const $el = $(el);
    const classes = $el.attr('class') || '';
    const type = (classes.match(/admonition (\w+)/) || [])[1] || 'note';
    const summaryText = $el
      .find('.details-summary')
      .clone()
      .children()
      .remove()
      .end()
      .text()
      .trim();
    const title = summaryText || type.toUpperCase();
    const inner = $el.find('.admonition-content').html() || $el.find('.details-content').html() || '';
    const $bq = cheerio.load(`<blockquote><p><strong>${type.toUpperCase()} — ${title}</strong></p>${inner}</blockquote>`)(
      'blockquote'
    );
    $el.replaceWith($.html($bq));
  });

  // 3. Lazy-loaded images -> plain images using data-src
  $('img.lazyload, img[data-src]').each((_, el) => {
    const $el = $(el);
    const src = $el.attr('data-src') || $el.attr('src');
    if (!src || /google\.com\/s2\/favicons/.test(src)) {
      $el.remove();
      return;
    }
    let alt = $el.attr('title') || $el.attr('alt') || '';
    if (!alt || alt === src || /\.(png|jpe?g|gif|webp|svg)$/i.test(path.basename(alt))) alt = '';
    $el.replaceWith(`<img src="${src}" alt="${alt.replace(/"/g, '&quot;')}" loading="lazy" />`);
  });

  // 4. Unwrap lightbox links around standalone images
  $('a img').each((_, el) => {
    const $parent = $(el).parent();
    if ($parent.is('a')) $parent.replaceWith($(el));
  });

  return tdHtml(cheerio.load('<div id="__root__">' + $.html($content) + '</div>'));
}

let turndownInstance;
function tdHtml($) {
  if (!turndownInstance) turndownInstance = makeTurndown();
  return turndownInstance.turndown($.html('#__root__'));
}

function extractMeta($) {
  const title = $('h1.single-title').first().text().trim() || $('title').text().trim();
  const date = $('time[datetime]').first().attr('datetime') || '';
  const categories = $('.post-meta-line .post-category a')
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean);
  const tags = $('section.post-tags a')
    .map((_, el) => $(el).text().trim())
    .get()
    .map((t) => t.replace(/,\s*$/, ''))
    .filter(Boolean)
    .filter((t, i, a) => a.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === i);
  let description = $('meta[property="og:description"]').attr('content') || '';
  description = description.replace(/\s+/g, ' ').trim();
  return { title, date, categories, tags, description };
}

// Copy static assets (images etc.) keeping public URL paths identical
function copyAssets() {
  let count = 0;
  const walk = (dir, relBase) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(relBase, full);
      if (entry.isDirectory()) {
        walk(full, relBase);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (['.html', '.xml', '.json'].includes(ext)) continue;
        const dest = path.join(OUT_PUBLIC, rel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(full, dest);
        count++;
      }
    }
  };
  walk(SRC_POSTS, SRC_POSTS);
  return count;
}

function main() {
  const files = collectPostDirs(SRC_POSTS);
  console.log(`Found ${files.length} posts`);
  fs.rmSync(OUT_POSTS, { recursive: true, force: true });
  fs.mkdirSync(OUT_POSTS, { recursive: true });

  let written = 0;
  const warnings = [];
  for (const file of files) {
    const html = fs.readFileSync(file, 'utf8');
    const $ = cheerio.load(html);
    const meta = extractMeta($);
    const markdown = transformContent($);
    if (!markdown) {
      warnings.push(`No #content in ${file}`);
      continue;
    }

    const relDir = path.relative(SRC_POSTS, path.dirname(file));
    const outPath = path.join(OUT_POSTS, `${relDir}.md`);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });

    const fmLines = [
      '---',
      `title: ${yamlStr(meta.title)}`,
      `date: ${yamlStr(meta.date)}`,
      `description: ${yamlStr(meta.description)}`,
      `categories: [${meta.categories.map(yamlStr).join(', ')}]`,
      `tags: [${meta.tags.map(yamlStr).join(', ')}]`,
      'draft: false',
      '---',
      '',
    ];
    fs.writeFileSync(outPath, fmLines.join('\n') + '\n' + markdown.trimStart() + '\n');
    written++;
  }

  const assets = copyAssets();
  console.log(`Wrote ${written} markdown files to src/content/posts`);
  console.log(`Copied ${assets} assets to public/posts`);
  warnings.forEach((w) => console.warn('WARN:', w));

  // Sanity report: leftover chroma spans or lazyload attrs in output
  const mdFiles = [];
  (function walkMd(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      e.isDirectory() ? walkMd(f) : f.endsWith('.md') && mdFiles.push(f);
    }
  })(OUT_POSTS);
  const bad = mdFiles.filter((f) => /class="|lazyload|chroma/.test(fs.readFileSync(f, 'utf8')));
  console.log(bad.length ? `CHECK ${bad.length} files for leftovers:\n${bad.join('\n')}` : 'Clean conversion ✓');
}

main();
