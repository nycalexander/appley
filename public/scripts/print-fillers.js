// Converts patterns like ": _____" (5+ underscores) into printable fillable inputs
// at print time. Reverts the DOM after printing.
(function () {
  'use strict'

  const WRAPPER_CLASS = 'print-fillers-wrapper'
  const INPUT_CLASS = 'print-fillable-input'
  const STYLE_ID = 'print-fillers-style'
  // match a colon, optional spaces, then at least 5 underscores
  const PATTERN = /:(\s*)(_{5,})/g

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = `
      /* Styling used only during print preview / print */
      @media print {
        .${INPUT_CLASS} {
          -webkit-print-color-adjust: exact;
          color: #000 !important;
          background: transparent !important;
          border: none !important;
          border-bottom: 1px solid #000 !important;
          padding: 0 !important;
          margin: 0 .1ch !important;
          font: inherit !important;
          box-sizing: content-box !important;
        }
        .${WRAPPER_CLASS} input { -webkit-appearance: none; appearance: none; }
      }

      /* Keep inputs visually unobtrusive on the screen if they appear briefly */
      .${INPUT_CLASS} {
        font: inherit;
        vertical-align: baseline;
      }
    `
    document.head.appendChild(style)
  }

  function createInputFor(underscoresCount) {
    const input = document.createElement('input')
    input.type = 'text'
    input.className = INPUT_CLASS
    // prefer ch unit width so width scales with font
    input.style.width = (Math.max(2, underscoresCount) + 'ch')
    input.setAttribute('data-underscores', String(underscoresCount))
    input.setAttribute('aria-label', 'fillable')
    input.autocomplete = 'off'
    input.spellcheck = false
    // Make it easy to type in the printed PDF preview if the PDF supports form fields
    input.style.background = 'transparent'
    input.style.border = 'none'
    input.style.borderBottom = '1px solid #000'
    input.style.padding = '0'
    input.style.margin = '0 .1ch'
    input.style.boxSizing = 'content-box'
    input.style.font = 'inherit'
    return input
  }

  function replaceInTextNode(node) {
    const text = node.nodeValue
    if (!text) return false
    PATTERN.lastIndex = 0
    let m
    let lastIndex = 0
    const frag = document.createDocumentFragment()
    let replaced = false

    while ((m = PATTERN.exec(text)) !== null) {
      const matchStart = m.index
      const matchEnd = PATTERN.lastIndex
      const before = text.slice(lastIndex, matchStart)
      const spaces = m[1] || ''
      const underscores = m[2] || ''
      const count = underscores.length

      if (before.length) frag.appendChild(document.createTextNode(before))
      // append the ':' and any intervening spaces as plain text
      frag.appendChild(document.createTextNode(':' + spaces))
      // create an input sized to the underscore count
      const input = createInputFor(count)
      frag.appendChild(input)

      lastIndex = matchEnd
      replaced = true
    }

    if (!replaced) return false

    const remainder = text.slice(lastIndex)
    if (remainder.length) frag.appendChild(document.createTextNode(remainder))

    const wrapper = document.createElement('span')
    wrapper.className = WRAPPER_CLASS
    // store original text so we can easily revert later
    wrapper.dataset.original = text
    wrapper.appendChild(frag)

    node.parentNode.replaceChild(wrapper, node)
    return true
  }

  function scan(root) {
    try {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT
          const parent = node.parentNode
          if (!parent || parent.nodeType !== 1) return NodeFilter.FILTER_REJECT
          const tag = parent.tagName.toLowerCase()
          // skip elements where replacement would be wrong or harmful
          if (['script', 'style', 'textarea', 'code', 'pre', 'input', 'select', 'button', 'svg'].includes(tag)) return NodeFilter.FILTER_REJECT
          // quick test for performance
          PATTERN.lastIndex = 0
          return PATTERN.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
        },
      })

      const nodes = []
      let cur
      while ((cur = walker.nextNode())) nodes.push(cur)
      for (const n of nodes) replaceInTextNode(n)
    } catch (err) {
      // fail gracefully
      console.warn('print-fillers: scanning failed', err)
    }
  }

  function beforePrint() {
    ensureStyle()
    scan(document.body)
  }

  function afterPrint() {
    const wrappers = document.querySelectorAll('span.' + WRAPPER_CLASS)
    wrappers.forEach((w) => {
      const original = w.dataset.original
      if (original !== undefined) {
        const txt = document.createTextNode(original)
        w.parentNode.replaceChild(txt, w)
      }
    })
  }

  if (typeof window !== 'undefined') {
    // Modern browsers fire beforeprint/afterprint when opening print preview
    window.addEventListener('beforeprint', beforePrint)
    window.addEventListener('afterprint', afterPrint)
    // Also provide a fallback: when user explicitly triggers window.print(), call beforePrint first
    const origPrint = window.print
    window.print = function (...args) {
      try {
        beforePrint()
      } catch (e) {
        /* ignore */
      }
      const res = origPrint.apply(window, args)
      try {
        // give the print dialog some time then revert
        setTimeout(afterPrint, 500)
      } catch (e) {
        /* ignore */
      }
      return res
    }
  }
})()
