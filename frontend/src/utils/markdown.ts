import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import css from 'highlight.js/lib/languages/css'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdownLanguage from 'highlight.js/lib/languages/markdown'
import python from 'highlight.js/lib/languages/python'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'
import MarkdownIt from 'markdown-it'
import katex from 'katex'
import texmath from 'markdown-it-texmath'
import 'katex/dist/katex.min.css'

hljs.registerLanguage('bash', bash)
hljs.registerLanguage('css', css)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('js', javascript)
hljs.registerLanguage('json', json)
hljs.registerLanguage('markdown', markdownLanguage)
hljs.registerLanguage('md', markdownLanguage)
hljs.registerLanguage('python', python)
hljs.registerLanguage('py', python)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('ts', typescript)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('yml', yaml)

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export const markdown: MarkdownIt = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  highlight(code: string, lang: string): string {
    if (lang && hljs.getLanguage(lang)) {
      return `<pre class="hljs"><code>${hljs.highlight(code, { language: lang }).value}</code></pre>`
    }
    return `<pre class="hljs"><code>${escapeHtml(code)}</code></pre>`
  }
})

markdown.use(texmath, {
  engine: katex,
  delimiters: 'dollars',
  katexOptions: { throwOnError: false, strict: 'warn', trust: false }
})

export function renderMarkdown(content: string): string {
  const rendered = markdown.render(content || '')
  if (typeof DOMParser === 'undefined') return rendered
  const document = new DOMParser().parseFromString(rendered, 'text/html')
  const allowedTags = new Set([
    'P', 'BR', 'STRONG', 'EM', 'DEL', 'BLOCKQUOTE', 'UL', 'OL', 'LI',
    'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'PRE', 'CODE', 'A', 'TABLE',
    'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'HR', 'SPAN', 'DIV',
    'MATH', 'SEMANTICS', 'MROW', 'MI', 'MO', 'MN', 'MSUP', 'MSUB',
    'MFRAC', 'MSQRT', 'MSPACE', 'MTEXT', 'ANNOTATION'
  ])
  for (const element of Array.from(document.body.querySelectorAll('*'))) {
    if (!allowedTags.has(element.tagName)) {
      element.replaceWith(...Array.from(element.childNodes))
      continue
    }
    for (const attribute of Array.from(element.attributes)) {
      const isKatexStyle = attribute.name === 'style' && Boolean(element.closest('.katex'))
      if (!['class', 'href', 'aria-hidden', 'encoding'].includes(attribute.name) && !isKatexStyle) {
        element.removeAttribute(attribute.name)
      }
    }
    if (element instanceof HTMLAnchorElement) {
      const href = element.getAttribute('href') || ''
      if (!/^(https?:|mailto:|\/|#)/i.test(href)) element.removeAttribute('href')
      element.setAttribute('rel', 'noopener noreferrer')
    }
  }
  return document.body.innerHTML
}
