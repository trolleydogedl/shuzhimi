(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SZM_RENDER = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MATH_ENVS = new Set([
    'align','align*','aligned','gather','gather*','multline','multline*',
    'equation','equation*','cases','array','matrix','pmatrix','bmatrix','vmatrix','Vmatrix','smallmatrix'
  ]);
  const TOKEN_RE = /\uE100SZM(\d+)\uE101/g;
  const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff]/;

  function escapeHtml(value = '') {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function isEscaped(source, index) {
    let slashes = 0;
    for (let i = index - 1; i >= 0 && source[i] === '\\'; i--) slashes++;
    return slashes % 2 === 1;
  }

  function findUnescaped(source, token, from) {
    let pos = from;
    while (pos < source.length) {
      pos = source.indexOf(token, pos);
      if (pos < 0) return -1;
      if (!isEscaped(source, pos)) return pos;
      pos += token.length;
    }
    return -1;
  }

  function removePrivateSections(source) {
    let src = source;
    const heading = '(?:评分标准|评分细则|给分点|阅卷说明|阅卷标准|参考评分|考查内容|考察内容|考查要点|原创声明|供题者信息|命题人信息|联系方式)';
    const latexSection = new RegExp(`\\\\(?:section|subsection|subsubsection)\\*?\\{[^{}]*${heading}[^{}]*\\}[\\s\\S]*?(?=\\\\(?:section|subsection|subsubsection)\\*?\\{|$)`, 'g');
    for (let i = 0; i < 8; i++) {
      const next = src.replace(latexSection, '');
      if (next === src) break;
      src = next;
    }

    const lines = src.split('\n');
    const out = [];
    let skipping = false;
    let skipLevel = 99;
    for (const line of lines) {
      const m = line.match(/^\s*(#{1,6})\s*(.+?)\s*$/);
      if (m) {
        const level = m[1].length;
        if (new RegExp(heading).test(m[2])) {
          skipping = true;
          skipLevel = level;
          continue;
        }
        if (skipping && level <= skipLevel) skipping = false;
      }
      if (!skipping) out.push(line);
    }
    return out.join('\n');
  }

  function removeTikz(source) {
    return source
      .replace(/\\section\*?\{\s*示意图\s*\}\s*(?:\\begin\{center\}\s*)?(?:\\\[\s*)?\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}(?:\s*\\\])?(?:\s*\\end\{center\})?/g, '')
      .replace(/\\begin\{center\}\s*\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}\s*\\end\{center\}/g, '')
      .replace(/\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/g, '')
      .replace(/\\usepackage(?:\[[^\]]*\])?\{tikz\}/g, '')
      .replace(/\\usetikzlibrary\{[^}]*\}/g, '');
  }

  function sanitizePublicSource(source = '') {
    let src = String(source || '')
      .replace(/^\uFEFF/, '')
      .replace(/\r\n?/g, '\n');
    src = removePrivateSections(src);
    src = removeTikz(src);
    return src.trim();
  }

  function normalizeStandaloneDisplayBrackets(source) {
    const lines = source.split('\n');
    const out = [];
    let open = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!open && trimmed === '[') {
        out.push('\\[');
        open = true;
      } else if (open && trimmed === ']') {
        out.push('\\]');
        open = false;
      } else {
        out.push(line);
      }
    }
    if (open) out.push('\\]');
    return out.join('\n');
  }

  function stripLeadingLabel(source, label) {
    if (!label) return source;
    const labels = label === 'solution'
      ? '(?:解|解答|答案|证明)'
      : '(?:题|题目|问题)';
    return source.replace(new RegExp(`^\\s*(?:#{1,6}\\s*)?${labels}\\s*(?:[：:]\\s*)?(?:\\n+|$)`, 'i'), '');
  }

  function repairMathPayload(value) {
    let src = value.replace(/\r\n?/g, '\n');
    const open = src.startsWith('\\[') ? '\\[' : src.startsWith('$$') ? '$$' : src.startsWith('\\(') ? '\\(' : src.startsWith('$') ? '$' : '';
    const close = open === '\\[' ? '\\]' : open === '$$' ? '$$' : open === '\\(' ? '\\)' : open === '$' ? '$' : '';
    let inner = open ? src.slice(open.length, close && src.endsWith(close) ? -close.length : undefined) : src;

    inner = inner.replace(/(^|[^\\])\[(\d+(?:\.\d+)?(?:mm|cm|em|ex|pt))\]/g, '$1\\\\[$2]');
    inner = inner.replace(/(^|[^\\])\[\s*(\d+(?:\.\d+)?)\s*\]/g, '$1\\\\[$2mm]');
    inner = inner.replace(/\\textup\{/g, '\\text{').replace(/\\textnormal\{/g, '\\text{');
    inner = inner.replace(/\\begin\{array\}\s*(?!\{)/g, '\\begin{array}{c}');

    if (!open && /^\\begin\{/.test(inner)) return `\\[${inner}\\]`;
    return `${open}${inner}${close}`;
  }

  function findEnvironmentEnd(source, start, env) {
    const beginToken = `\\begin{${env}}`;
    const endToken = `\\end{${env}}`;
    let depth = 1;
    let pos = start + beginToken.length;
    while (pos < source.length) {
      const nextBegin = source.indexOf(beginToken, pos);
      const nextEnd = source.indexOf(endToken, pos);
      if (nextEnd < 0) return -1;
      if (nextBegin >= 0 && nextBegin < nextEnd) {
        depth++;
        pos = nextBegin + beginToken.length;
      } else {
        depth--;
        pos = nextEnd + endToken.length;
        if (depth === 0) return pos;
      }
    }
    return -1;
  }

  function extractMath(source, math) {
    const hold = value => `\uE100SZM${math.push(repairMathPayload(value)) - 1}\uE101`;
    let out = '';
    let i = 0;
    while (i < source.length) {
      if (source.startsWith('\\[', i) && !isEscaped(source, i)) {
        const end = findUnescaped(source, '\\]', i + 2);
        if (end >= 0) {
          out += hold(source.slice(i, end + 2));
          i = end + 2;
          continue;
        }
        const paraEnd = source.indexOf('\n\n', i + 2);
        const stop = paraEnd >= 0 ? paraEnd : source.length;
        out += hold(`${source.slice(i, stop)}\\]`);
        i = stop;
        continue;
      }
      if (source.startsWith('\\(', i) && !isEscaped(source, i)) {
        const end = findUnescaped(source, '\\)', i + 2);
        if (end >= 0) {
          out += hold(source.slice(i, end + 2));
          i = end + 2;
          continue;
        }
        const lineEnd = source.indexOf('\n', i + 2);
        const stop = lineEnd >= 0 ? lineEnd : source.length;
        out += hold(`${source.slice(i, stop)}\\)`);
        i = stop;
        continue;
      }
      if (source.startsWith('$$', i) && !isEscaped(source, i)) {
        const end = findUnescaped(source, '$$', i + 2);
        if (end >= 0) {
          out += hold(source.slice(i, end + 2));
          i = end + 2;
          continue;
        }
      }
      if (source[i] === '$' && !isEscaped(source, i) && source[i + 1] !== '$') {
        const end = findUnescaped(source, '$', i + 1);
        if (end > i + 1 && !source.slice(i + 1, end).includes('\n')) {
          out += hold(source.slice(i, end + 1));
          i = end + 1;
          continue;
        }
      }
      if (source.startsWith('\\begin{', i) && !isEscaped(source, i)) {
        const m = source.slice(i).match(/^\\begin\{([^}]+)\}/);
        if (m && MATH_ENVS.has(m[1])) {
          const end = findEnvironmentEnd(source, i, m[1]);
          if (end >= 0) {
            out += hold(`\\[${source.slice(i, end)}\\]`);
            i = end;
            continue;
          }
        }
      }
      out += source[i];
      i++;
    }
    return out;
  }

  function isMathLikeParenthetical(inner) {
    const value = inner.trim();
    if (!value || value.length > 320 || value.includes('\n')) return false;
    if (CJK_RE.test(value) && !/\\text\{/.test(value)) return false;
    if (/^(?:https?:\/\/|www\.)/i.test(value)) return false;
    if (/\\[A-Za-z]+/.test(value)) return true;
    if (/[=<>≤≥≠^_+*/|∣∈∉]/.test(value)) return true;
    if (/^[A-Za-z](?:_[A-Za-z0-9{}]+)?$/.test(value)) return true;
    if (/^\d+(?:\s*,\s*\d+)*$/.test(value)) return true;
    if (/^[A-Za-z0-9(][A-Za-z0-9()\s,.;:+\-*/^_{}\\]*$/.test(value) && /[0-9A-Za-z]/.test(value)) return true;
    return false;
  }

  function normalizeParentheticalMath(source) {
    const pairs = [];
    const stack = [];
    for (let i = 0; i < source.length; i++) {
      if (source[i] === '(' && !isEscaped(source, i)) stack.push(i);
      else if (source[i] === ')' && stack.length && !isEscaped(source, i)) {
        const start = stack.pop();
        if (stack.length === 0) pairs.push([start, i]);
      }
    }
    let out = source;
    for (let i = pairs.length - 1; i >= 0; i--) {
      const [start, end] = pairs[i];
      const inner = out.slice(start + 1, end);
      if (isMathLikeParenthetical(inner)) {
        out = `${out.slice(0, start)}\\(${inner}\\)${out.slice(end + 1)}`;
      }
    }
    return out;
  }

  function prepareStructures(source) {
    let src = source;
    src = src
      .replace(/\\section\*?\{([^{}]*)\}/g, '\n## $1\n')
      .replace(/\\subsection\*?\{([^{}]*)\}/g, '\n### $1\n')
      .replace(/\\subsubsection\*?\{([^{}]*)\}/g, '\n#### $1\n')
      .replace(/\\paragraph\*?\{([^{}]*)\}/g, '\n#### $1\n')
      .replace(/\\begin\{proof\}/g, '\n@@PROOF_START@@\n')
      .replace(/\\end\{proof\}/g, '\n@@PROOF_END@@\n')
      .replace(/\\begin\{(lemma|theorem|proposition|corollary)\}(?:\[([^\]]*)\])?/g, (_, kind, title) => `\n@@THEOREM_START:${kind}:${title || ''}@@\n`)
      .replace(/\\end\{(?:lemma|theorem|proposition|corollary)\}/g, '\n@@THEOREM_END@@\n')
      .replace(/\\begin\{quote\}/g, '\n@@QUOTE_START@@\n')
      .replace(/\\end\{quote\}/g, '\n@@QUOTE_END@@\n')
      .replace(/\\begin\{center\}/g, '\n@@CENTER_START@@\n')
      .replace(/\\end\{center\}/g, '\n@@CENTER_END@@\n')
      .replace(/\\begin\{itemize\}/g, '\n@@UL_START@@\n')
      .replace(/\\end\{itemize\}/g, '\n@@UL_END@@\n')
      .replace(/\\begin\{enumerate\}(?:\[[^\]]*\])?/g, '\n@@OL_START@@\n')
      .replace(/\\end\{enumerate\}/g, '\n@@OL_END@@\n')
      .replace(/\\begin\{description\}(?:\[[^\]]*\])?/g, '\n@@DL_START@@\n')
      .replace(/\\end\{description\}/g, '\n@@DL_END@@\n')
      .replace(/\\item\[([^\]]*)\]\s*/g, '\n@@DT:$1@@\n')
      .replace(/\\item\s*/g, '\n@@ITEM@@ ')
      .replace(/\\(?:medskip|bigskip|smallskip|noindent|newpage|clearpage|dotfill)\b/g, ' ')
      .replace(/\\(?:vspace|hspace)\*?\{[^}]*\}/g, ' ')
      .replace(/\\label\{[^}]*\}/g, '')
      .replace(/\\ref\{([^}]*)\}/g, '$1');
    return src;
  }

  function inlineFormat(source) {
    let src = escapeHtml(source);
    for (let i = 0; i < 8; i++) {
      src = src
        .replace(/\\textbf\{([^{}]*)\}/g, '<strong>$1</strong>')
        .replace(/\\(?:emph|textit)\{([^{}]*)\}/g, '<em>$1</em>')
        .replace(/\\underline\{([^{}]*)\}/g, '<u>$1</u>')
        .replace(/\\text\{([^{}]*)\}/g, '$1');
    }
    src = src
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_]+)__/g, '<strong>$1</strong>')
      .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\\(?:quad|qquad|[,;!])/g, ' ')
      .replace(/~+/g, '&nbsp;')
      .replace(/\\\\(?:\[[^\]]*\])?/g, '<br>');
    return src;
  }

  function parseBlocks(source) {
    const lines = source.split('\n');
    const html = [];
    let paragraph = [];
    let markdownList = null;
    let explicitList = null;
    let explicitItemOpen = false;

    const flushParagraph = () => {
      const text = paragraph.join(' ').trim();
      if (text) html.push(`<p>${inlineFormat(text)}</p>`);
      paragraph = [];
    };
    const closeMarkdownList = () => {
      if (markdownList) html.push(`</${markdownList}>`);
      markdownList = null;
    };
    const closeExplicitItem = () => {
      if (explicitItemOpen) html.push('</li>');
      explicitItemOpen = false;
    };
    const closeAllLists = () => {
      closeMarkdownList();
      if (explicitList) {
        closeExplicitItem();
        html.push(`</${explicitList}>`);
        explicitList = null;
      }
    };

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        flushParagraph();
        closeMarkdownList();
        continue;
      }

      if (line === '@@PROOF_START@@') {
        flushParagraph(); closeAllLists();
        html.push('<div class="proof-box"><div class="proof-title">证明</div>');
        continue;
      }
      if (line === '@@PROOF_END@@') {
        flushParagraph(); closeAllLists(); html.push('</div>'); continue;
      }
      const theorem = line.match(/^@@THEOREM_START:(lemma|theorem|proposition|corollary):(.*)@@$/);
      if (theorem) {
        flushParagraph(); closeAllLists();
        const names = {lemma:'引理', theorem:'定理', proposition:'命题', corollary:'推论'};
        html.push(`<div class="theorem"><div class="theorem-title">${names[theorem[1]]}${theorem[2] ? `（${inlineFormat(theorem[2])}）` : ''}</div>`);
        continue;
      }
      if (line === '@@THEOREM_END@@') { flushParagraph(); closeAllLists(); html.push('</div>'); continue; }
      if (line === '@@QUOTE_START@@') { flushParagraph(); closeAllLists(); html.push('<blockquote>'); continue; }
      if (line === '@@QUOTE_END@@') { flushParagraph(); closeAllLists(); html.push('</blockquote>'); continue; }
      if (line === '@@CENTER_START@@') { flushParagraph(); closeAllLists(); html.push('<div class="text-center">'); continue; }
      if (line === '@@CENTER_END@@') { flushParagraph(); closeAllLists(); html.push('</div>'); continue; }

      if (line === '@@UL_START@@' || line === '@@OL_START@@') {
        flushParagraph(); closeMarkdownList();
        if (explicitList) { closeExplicitItem(); html.push(`</${explicitList}>`); }
        explicitList = line === '@@UL_START@@' ? 'ul' : 'ol';
        html.push(`<${explicitList}>`);
        explicitItemOpen = false;
        continue;
      }
      if (line === '@@UL_END@@' || line === '@@OL_END@@') {
        flushParagraph();
        if (explicitList) { closeExplicitItem(); html.push(`</${explicitList}>`); }
        explicitList = null;
        continue;
      }
      if (line === '@@DL_START@@') { flushParagraph(); closeAllLists(); html.push('<dl>'); continue; }
      if (line === '@@DL_END@@') { flushParagraph(); closeAllLists(); html.push('</dl>'); continue; }
      const dt = line.match(/^@@DT:(.*)@@$/);
      if (dt) { flushParagraph(); html.push(`<dt>${inlineFormat(dt[1])}</dt><dd>`); continue; }
      if (line === '@@ITEM@@' || line.startsWith('@@ITEM@@ ')) {
        flushParagraph(); closeMarkdownList();
        if (!explicitList) { explicitList = 'ul'; html.push('<ul>'); }
        closeExplicitItem();
        html.push(`<li>${inlineFormat(line.replace(/^@@ITEM@@\s*/, ''))}`);
        explicitItemOpen = true;
        continue;
      }

      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        flushParagraph(); closeAllLists();
        const level = Math.min(4, heading[1].length + 1);
        html.push(`<h${level}>${inlineFormat(heading[2])}</h${level}>`);
        continue;
      }
      if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(line)) {
        flushParagraph(); closeAllLists(); html.push('<hr>'); continue;
      }

      const bullet = line.match(/^[-*+]\s+(.+)$/);
      const number = line.match(/^\d+[.)]\s+(.+)$/);
      if (bullet || number) {
        flushParagraph();
        if (explicitList) { closeExplicitItem(); html.push(`</${explicitList}>`); explicitList = null; }
        const type = bullet ? 'ul' : 'ol';
        if (markdownList !== type) { closeMarkdownList(); markdownList = type; html.push(`<${type}>`); }
        html.push(`<li>${inlineFormat((bullet || number)[1])}</li>`);
        continue;
      }

      if (explicitItemOpen) {
        html.push(` ${inlineFormat(line)}`);
        continue;
      }
      paragraph.push(line);
    }

    flushParagraph();
    closeAllLists();
    return html.join('\n');
  }

  function restoreMathTokens(source, math) {
    let src = source;
    for (let pass = 0; pass < 4; pass++) {
      const next = src.replace(TOKEN_RE, (_, index) => math[Number(index)] || '');
      if (next === src) break;
      src = next;
    }
    return src;
  }

  function normalizeForRendering(source = '', options = {}) {
    let src = sanitizePublicSource(source);
    src = stripLeadingLabel(src, options.stripLeading || '');
    src = normalizeStandaloneDisplayBrackets(src);
    const math = [];
    src = extractMath(src, math);
    src = normalizeParentheticalMath(src);
    src = extractMath(src, math);
    src = prepareStructures(src);
    return { source: src, math };
  }

  function renderRichText(source = '', options = {}) {
    const normalized = normalizeForRendering(source, options);
    const html = parseBlocks(normalized.source);
    return restoreMathTokens(html, normalized.math) || '<p>暂无内容</p>';
  }

  function previewSource(source = '', limit = 280) {
    const normalized = normalizeForRendering(source);
    let src = normalized.source
      .replace(/@@[A-Z_]+(?::[^@]*)?@@/g, ' ')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^[-*+]\s+/gm, '')
      .replace(/^\d+[.)]\s+/gm, '')
      .replace(/\\(?:section|subsection|subsubsection|paragraph)\*?\{([^{}]*)\}/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();

    const parts = src.split(/(\uE100SZM\d+\uE101)/g);
    let out = '';
    let visible = 0;
    let mathCount = 0;
    for (const part of parts) {
      const m = part.match(/^\uE100SZM(\d+)\uE101$/);
      if (m) {
        if (mathCount >= 3 || visible >= limit) continue;
        let value = normalized.math[Number(m[1])] || '';
        if (value.startsWith('\\[') && value.endsWith('\\]')) value = `\\(${value.slice(2, -2)}\\)`;
        else if (value.startsWith('$$') && value.endsWith('$$')) value = `\\(${value.slice(2, -2)}\\)`;
        if (value.length > 360 || /\\begin\{(?:align|gather|multline)/.test(value)) continue;
        out += ` ${value} `;
        visible += Math.min(value.length, 56);
        mathCount++;
      } else if (visible < limit) {
        const take = part.slice(0, limit - visible);
        out += take;
        visible += take.length;
      }
    }
    if (visible >= limit) out += '…';
    return out.trim();
  }

  function stripText(source = '') {
    const normalized = normalizeForRendering(source);
    let src = normalized.source;
    src = restoreMathTokens(src, normalized.math)
      .replace(/\\\[[\s\S]*?\\\]/g, ' ')
      .replace(/\\\([\s\S]*?\\\)/g, ' ')
      .replace(/\$\$[\s\S]*?\$\$/g, ' ')
      .replace(/\$[^$\n]*\$/g, ' ')
      .replace(/@@[^@]+@@/g, ' ')
      .replace(/[#*_`>-]/g, ' ')
      .replace(/\\[A-Za-z]+\*?(?:\[[^\]]*\])?/g, ' ')
      .replace(/[{}^_]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return src;
  }

  return {
    sanitizePublicSource,
    renderRichText,
    previewSource,
    stripText,
    normalizeForRendering,
    normalizeStandaloneDisplayBrackets,
    normalizeParentheticalMath,
    extractMath
  };
});
