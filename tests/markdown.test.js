import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from '../js/markdown.js';

test('headings, bold, italic, strike and code render', () => {
  assert.equal(renderMarkdown('# Plan'), '<h3>Plan</h3>');
  assert.equal(renderMarkdown('## Sub'), '<h4>Sub</h4>');
  assert.equal(renderMarkdown('**bold** and *it* and _it2_ and ~~gone~~ and `x*y`'),
    '<p><strong>bold</strong> and <em>it</em> and <em>it2</em> and <s>gone</s> and <code>x*y</code></p>');
});

test('lists and quotes render, and paragraphs break on blank lines', () => {
  assert.equal(renderMarkdown('- a\n- b\n\n1. one\n2. two'), '<ul><li>a</li><li>b</li></ul><ol><li>one</li><li>two</li></ol>');
  assert.equal(renderMarkdown('> quoted'), '<blockquote>quoted</blockquote>');
  assert.equal(renderMarkdown('line one\nline two\n\nnext'), '<p>line one<br>line two</p><p>next</p>');
});

test('links are live, open in a new tab, and bare web addresses link too', () => {
  assert.equal(renderMarkdown('[Docs](https://example.com/a?b=1&c=2)'),
    '<p><a href="https://example.com/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">Docs</a></p>');
  assert.equal(renderMarkdown('see https://example.com.'),
    '<p>see <a href="https://example.com" target="_blank" rel="noopener noreferrer">https://example.com</a>.</p>');
  assert.equal(renderMarkdown('www.example.org'),
    '<p><a href="https://www.example.org" target="_blank" rel="noopener noreferrer">www.example.org</a></p>');
  assert.equal(renderMarkdown('mail [me](mailto:a@b.co)'),
    '<p>mail <a href="mailto:a@b.co" target="_blank" rel="noopener noreferrer">me</a></p>');
});

test('typed HTML and unsafe links never become markup', () => {
  assert.equal(renderMarkdown('<script>alert(1)</script>'), '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  assert.equal(renderMarkdown('[bad](javascript:alert(1))'), '<p>[bad](javascript:alert(1))</p>');
  const attack = renderMarkdown('[x](https://a.com"onmouseover="y)');   // quotes can never close the href
  assert.ok(!/onmouseover="/.test(attack) && !/href="[^"]*"[^>]*onmouseover/.test(attack), attack);
  assert.equal(renderMarkdown(''), '');
});
