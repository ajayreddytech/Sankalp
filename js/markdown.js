// A small, safe Markdown renderer for SMART goal descriptions. Pure: no DOM, no network.
// Every piece of text is escaped first, so typed text can never become markup. Only http, https and
// mailto links become links. Supported: # headings, paragraphs and line breaks, - and 1. lists,
// > quotes, **bold**, *italic* or _italic_, ~~strike~~, `code`, [text](link) and bare web addresses.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

// Only these may be links. Anything else (javascript:, data:, relative paths) stays plain text.
const SAFE_LINK = /^(https?:\/\/|mailto:)/i;

function linkTag(href, text) {
  return `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
}

// Works on already-escaped text.
function formatEscaped(s) {
  return s.replace(
    /\[([^\]\n]+)\]\(([^)\s]+)\)|((?:https?:\/\/|www\.)[^\s<>"]+)|\*\*([^*\n]+)\*\*|~~([^~\n]+)~~|\*([^*\n]+)\*|_([^_\n]+)_/g,
    (m, text, href, bare, bold, strike, italicStar, italicUnder) => {
      if (text !== undefined) {
        if (!SAFE_LINK.test(href)) return m;
        return linkTag(href, text);
      }
      if (bare !== undefined) {
        // Trailing punctuation belongs to the sentence, not the link.
        const trail = (/[.,;:!?)]+$/.exec(bare) || [''])[0];
        const url = bare.slice(0, bare.length - trail.length);
        const href = url.startsWith('www.') ? `https://${url}` : url;
        return linkTag(href, url) + trail;
      }
      if (bold !== undefined) return `<strong>${bold}</strong>`;
      if (strike !== undefined) return `<s>${strike}</s>`;
      if (italicStar !== undefined) return `<em>${italicStar}</em>`;
      return `<em>${italicUnder}</em>`;
    },
  );
}

// Inline text: code spans are kept as they are; everything else gets the formatting.
function inline(raw) {
  return String(raw ?? '').split(/(`[^`\n]+`)/)
    .map((part, i) => (i % 2 ? `<code>${esc(part.slice(1, -1))}</code>` : formatEscaped(esc(part))))
    .join('');
}

/** Markdown source to safe HTML. Blank input gives an empty string. */
export function renderMarkdown(src = '') {
  const out = [];
  let para = [];
  let list = null;   // { tag: 'ul' | 'ol', items: [] }

  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) out.push(`<${list.tag}>${list.items.map((t) => `<li>${inline(t)}</li>`).join('')}</${list.tag}>`);
    list = null;
  };
  const startList = (tag) => {
    if (list?.tag !== tag) { flushList(); list = { tag, items: [] }; }
  };

  const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flushPara(); flushList(); continue; }

    let m = /^(#{1,3})\s+(.*)$/.exec(line);
    if (m) {
      flushPara(); flushList();
      const level = m[1].length + 2;   // # is h3, ## h4, ### h5: the page already has its own h1
      out.push(`<h${level}>${inline(m[2])}</h${level}>`);
      continue;
    }
    m = /^[-*+]\s+(.*)$/.exec(line);
    if (m) { flushPara(); startList('ul'); list.items.push(m[1]); continue; }
    m = /^\d+[.)]\s+(.*)$/.exec(line);
    if (m) { flushPara(); startList('ol'); list.items.push(m[1]); continue; }
    m = /^>\s?(.*)$/.exec(line);
    if (m) { flushPara(); flushList(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); continue; }

    flushList();
    para.push(line);
  }
  flushPara();
  flushList();
  return out.join('');
}
