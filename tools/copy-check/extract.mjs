// Pulls the words a runner can see out of the client (TypeScript/TSX) and the API (C#): JSX text, string literals and
// template text. Code, class names, import paths, comments and type unions are left out, so the checks below look
// at copy, not identifiers. Each segment keeps its file and line.
import ts from 'typescript'

// JSX attributes whose value is shown or read out to the runner. Every other attribute (className, href, role, ...)
// is code.
const COPY_ATTRIBUTES = new Set([
  'aria-label', 'aria-description', 'aria-valuetext', 'aria-roledescription', 'alt', 'title', 'placeholder', 'label',
  'heading', 'lede', 'hint', 'message', 'description', 'primaryLabel', 'secondaryLabel', 'confirmLabel', 'cancelLabel',
  'emptyText', 'caption', 'summary', 'kicker', 'subtitle', 'text', 'help', 'body', 'action', 'actionLabel',
])

// Object properties that hold code, not copy.
const CODE_PROPERTIES = new Set(['className', 'class', 'style', 'id', 'key', 'href', 'src', 'path', 'icon', 'tone', 'variant', 'kind', 'type', 'role'])

// A string literal is treated as copy when it reads like words: two words or more, or a word ending in sentence
// punctuation. Single tokens ('smooth', 'center', 'is-selected') and iCalendar lines (PRODID:, SUMMARY;) are code.
const looksLikeCopy = (text) => !/^[A-Z-]{4,}[:;]/.test(text) && (/[A-Za-z]{2,}[\s ]+[A-Za-z’']/.test(text) || /^[A-Z][a-z’']+[.!?…]$/.test(text))

/** Copy segments in a TS or TSX source: [{ line, text, kind }]. */
export function extractTypeScript(fileName, source) {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const out = []
  const lineOf = (pos) => file.getLineAndCharacterOfPosition(pos).line + 1
  const push = (node, text, kind) => {
    // SVG or XML built in strings: keep only the words between the tags.
    const markup = /^\s*</.test(text)
    const clean = (markup ? text.replace(/<[^>]*>?/g, ' ') : text).replace(/\s+/g, ' ')
    if (markup && !looksLikeCopy(clean.replace(/⁣N⁣/g, 'N'))) return
    if (clean.trim()) out.push({ line: lineOf(node.getStart(file)), text: clean, kind })
  }

  const isCodeContext = (node) => {
    const parent = node.parent
    if (!parent) return false
    if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || ts.isExternalModuleReference(parent)) return true
    if (ts.isLiteralTypeNode(parent)) return true // 'a' | 'b'
    if (ts.isPropertyAssignment(parent) && parent.name === node) return true
    if (ts.isPropertySignature(parent) || ts.isElementAccessExpression(parent)) return true
    if (ts.isCaseClause(parent)) return true
    if (ts.isBinaryExpression(parent) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken,
      ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(parent.operatorToken.kind)) return true
    if (ts.isCallExpression(parent)) {
      const callee = parent.expression.getText(file)
      // Selectors, class lists, storage keys, events and errors thrown for developers.
      if (/(querySelector\w*|classList\.\w+|getItem|setItem|removeItem|addEventListener|removeEventListener|matchMedia|getPropertyValue|setProperty|createElement\w*|setAttribute|getAttribute|closest|require|import|console\.\w+|postMessage|fetch|new URL)$/.test(callee)) return true
    }
    if (ts.isNewExpression(parent) && /Error$/.test(parent.expression.getText(file))) return true
    return false
  }

  // The JSX attribute or object property a value ends up in, through conditionals, || and ??, calls such as
  // cx(...) and arrays: className={open ? 'a b' : 'c'} is still a class name.
  const attributeName = (node) => {
    let n = node.parent
    while (n && (ts.isJsxExpression(n) || ts.isConditionalExpression(n) || ts.isParenthesizedExpression(n) || ts.isBinaryExpression(n)
      || ts.isCallExpression(n) || ts.isArrayLiteralExpression(n) || ts.isTemplateSpan(n) || ts.isTemplateExpression(n))) n = n.parent
    if (n && ts.isJsxAttribute(n)) return n.name.getText(file)
    if (n && ts.isPropertyAssignment(n) && CODE_PROPERTIES.has(n.name.getText(file))) return n.name.getText(file)
    return null
  }

  const visit = (node) => {
    if (ts.isJsxText(node)) {
      if (!node.containsOnlyTriviaWhiteSpaces) push(node, node.text, 'jsx')
    } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const attribute = attributeName(node)
      if (attribute !== null) {
        if (COPY_ATTRIBUTES.has(attribute)) push(node, node.text, 'attribute')
      } else if (!isCodeContext(node) && looksLikeCopy(node.text)) {
        push(node, node.text, 'string')
      }
    } else if (ts.isTemplateExpression(node)) {
      // Holes become a neutral token so "${n} runs" reads as "N runs".
      const attribute = attributeName(node)
      const text = node.head.text + node.templateSpans.map((s) => '⁣N⁣' + s.literal.text).join('')
      if ((attribute === null || COPY_ATTRIBUTES.has(attribute)) && !isCodeContext(node) && looksLikeCopy(text.replace(/⁣N⁣/g, 'N'))) {
        push(node, text, attribute ? 'attribute' : 'template')
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return out
}

/** Copy segments in a C# source: every string literal that reads like words, with HTML tags and holes removed. */
export function extractCSharp(source) {
  const out = []
  let i = 0
  let line = 1
  const n = source.length
  const advance = (to) => {
    for (; i < to; i++) if (source[i] === '\n') line++
  }
  while (i < n) {
    const c = source[i]
    const next = source[i + 1]
    if (c === '/' && next === '/') { const end = source.indexOf('\n', i); advance(end < 0 ? n : end); continue }
    if (c === '/' && next === '*') { const end = source.indexOf('*/', i + 2); advance(end < 0 ? n : end + 2); continue }
    if (c === '\'') { // char literal
      const end = source[i + 1] === '\\' ? source.indexOf('\'', i + 3) : i + 2
      advance(end + 1); continue
    }
    // String prefixes: $, @, $@, @$, $$...
    const prefix = /^(\$*@?\$*)"/.exec(source.slice(i, i + 6))
    if ((c === '"' || c === '$' || c === '@') && prefix && !/[A-Za-z0-9_]/.test(source[i - 1] ?? '')) {
      const startLine = line
      const marks = prefix[1]
      const interpolated = marks.includes('$')
      const verbatim = marks.includes('@')
      let j = i + marks.length
      let text = ''
      if (source.startsWith('"""', j)) { // raw string literal
        let quotes = 0
        while (source[j + quotes] === '"') quotes++
        const close = '"'.repeat(quotes)
        const end = source.indexOf(close, j + quotes)
        text = source.slice(j + quotes, end < 0 ? n : end)
        if (interpolated) { // $""" holes are {x}; $$""" holes are {{x}}
          const braces = marks.split('$').length - 1
          const hole = new RegExp(`${'\\{'.repeat(braces)}[^{}]*${'\\}'.repeat(braces)}`, 'g')
          text = text.replace(hole, '⁣N⁣')
        }
        advance(end < 0 ? n : end + quotes)
      } else {
        j++
        let depth = 0
        while (j < n) {
          const ch = source[j]
          if (depth === 0 && ch === '"') {
            if (verbatim && source[j + 1] === '"') { text += '"'; j += 2; continue }
            break
          }
          if (!verbatim && ch === '\\' && depth === 0) { text += source[j + 1] === 'n' ? '\n' : source[j + 1]; j += 2; continue }
          if (interpolated && ch === '{') {
            if (source[j + 1] === '{' && depth === 0) { text += '{'; j += 2; continue }
            depth++; if (depth === 1) text += '⁣N⁣'; j++; continue
          }
          if (interpolated && ch === '}' && depth > 0) { depth--; j++; continue }
          if (depth === 0) text += ch
          j++
        }
        advance(j + 1)
      }
      // Email HTML: keep the words, drop tags, style attributes and entities.
      const words = text.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/g, ' ')
      for (const [k, part] of words.split('\n').entries()) {
        const clean = part.replace(/[ \t]+/g, ' ')
        if (looksLikeCopy(clean.replace(/⁣N⁣/g, 'N'))) out.push({ line: startLine + k, text: clean, kind: 'string' })
      }
      continue
    }
    advance(i + 1)
  }
  return out
}
