import { Fragment, useState } from 'react';

/*
 * Telegram / Discord-style message formatting:
 *   **bold**  *italic* / __italic__  ~~strike~~  `code`  ```block```  ||spoiler||  > quote
 * plus links and @mentions (handled by the caller's `inline` renderer for plain chunks).
 */

const INLINE = /(\|\|[\s\S]+?\|\||\*\*[\s\S]+?\*\*|__[\s\S]+?__|~~[\s\S]+?~~|`[^`\n]+`|\*(?!\s)[^*\n]+?\*)/g;

function Spoiler({ children }) {
  const [open, setOpen] = useState(false);
  return (
    <span className={`spoiler ${open ? 'open' : ''}`} onClick={(e) => { if (!open) { e.stopPropagation(); setOpen(true); } }} title={open ? undefined : 'Спойлер — нажмите, чтобы показать'}>
      {children}
    </span>
  );
}

function inlineFmt(text, plain, keyBase = '') {
  const out = [];
  let last = 0;
  let k = 0;
  text.replace(INLINE, (m, _g, idx) => {
    if (idx > last) out.push(<Fragment key={`${keyBase}t${k++}`}>{plain(text.slice(last, idx))}</Fragment>);
    const key = `${keyBase}f${k++}`;
    if (m.startsWith('||')) out.push(<Spoiler key={key}>{inlineFmt(m.slice(2, -2), plain, key)}</Spoiler>);
    else if (m.startsWith('**')) out.push(<b key={key}>{inlineFmt(m.slice(2, -2), plain, key)}</b>);
    else if (m.startsWith('__')) out.push(<i key={key}>{inlineFmt(m.slice(2, -2), plain, key)}</i>);
    else if (m.startsWith('~~')) out.push(<s key={key}>{inlineFmt(m.slice(2, -2), plain, key)}</s>);
    else if (m.startsWith('`')) out.push(<code key={key} className="md-code">{m.slice(1, -1)}</code>);
    else out.push(<i key={key}>{inlineFmt(m.slice(1, -1), plain, key)}</i>);
    last = idx + m.length;
    return m;
  });
  if (last < text.length) out.push(<Fragment key={`${keyBase}t${k++}`}>{plain(text.slice(last))}</Fragment>);
  return out;
}

/** Render a message text: code blocks and quotes first, then inline styles inside the rest. */
export function RichText({ text, plain = (s) => s }) {
  if (!text) return null;
  const blocks = String(text).split(/(```[\s\S]*?```)/g);
  return blocks.map((b, bi) => {
    if (b.startsWith('```') && b.endsWith('```') && b.length >= 6) {
      const body = b.slice(3, -3).replace(/^[a-z0-9+#-]{1,15}\n/i, '').replace(/^\n|\n$/g, '');
      return <pre key={bi} className="md-pre"><code>{body}</code></pre>;
    }
    // group consecutive "> " lines into one quote block
    const lines = b.split('\n');
    const parts = [];
    let quote = [];
    let buf = [];
    const flushBuf = () => { if (buf.length) { parts.push({ t: 'p', s: buf.join('\n') }); buf = []; } };
    const flushQuote = () => { if (quote.length) { parts.push({ t: 'q', s: quote.join('\n') }); quote = []; } };
    lines.forEach((l) => {
      if (/^>\s?/.test(l) && !/^>\s*$/.test(l)) { flushBuf(); quote.push(l.replace(/^>\s?/, '')); } else { flushQuote(); buf.push(l); }
    });
    flushBuf(); flushQuote();
    return (
      <Fragment key={bi}>
        {parts.map((p, pi) => (p.t === 'q'
          ? <span key={pi} className="md-quote">{inlineFmt(p.s, plain, `${bi}q${pi}`)}</span>
          : <Fragment key={pi}>{inlineFmt(p.s, plain, `${bi}p${pi}`)}</Fragment>))}
      </Fragment>
    );
  });
}

/** Plain preview for chat lists / notifications: markers removed, spoilers hidden. */
export function stripFormatting(text) {
  return String(text || '')
    .replace(/\|\|[\s\S]+?\|\|/g, '▒▒▒▒')
    .replace(/```[a-z0-9+#-]*\n?([\s\S]*?)```/gi, '$1')
    .replace(/\*\*([\s\S]+?)\*\*/g, '$1')
    .replace(/__([\s\S]+?)__/g, '$1')
    .replace(/~~([\s\S]+?)~~/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/(^|\s)\*(?!\s)([^*\n]+?)\*/g, '$1$2')
    .replace(/^>\s?/gm, '');
}

/** Wrap the textarea selection with a marker (Ctrl+B etc.). Returns the new value and caret range. */
export function wrapSelection(el, mark) {
  const { selectionStart: a, selectionEnd: b, value } = el;
  const sel = value.slice(a, b);
  if (sel.startsWith(mark) && sel.endsWith(mark) && sel.length >= mark.length * 2) {
    const inner = sel.slice(mark.length, -mark.length);
    return { value: value.slice(0, a) + inner + value.slice(b), start: a, end: a + inner.length };
  }
  return { value: value.slice(0, a) + mark + sel + mark + value.slice(b), start: a + mark.length, end: b + mark.length };
}
