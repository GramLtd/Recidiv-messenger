import React, { useState } from 'react';
import { Platform, Text } from 'react-native';
import { C } from './theme';

/*
 * Same formatting as the web (Telegram / Discord markdown), rendered as nested <Text> so it flows inside a bubble:
 *   **bold**  *italic* / __italic__  ~~strike~~  `code`  ```block```  ||spoiler||  > quote
 */
const INLINE = /(\|\|[\s\S]+?\|\||\*\*[\s\S]+?\*\*|__[\s\S]+?__|~~[\s\S]+?~~|`[^`\n]+`|\*(?!\s)[^*\n]+?\*)/g;
const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

function Spoiler({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Text suppressHighlighting onPress={open ? undefined : () => setOpen(true)}
      style={open ? { backgroundColor: 'rgba(255,255,255,0.06)' } : { color: 'transparent', backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 4, textShadowColor: 'rgba(255,255,255,0.9)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 0 } }}>
      {open ? children : <Text style={{ color: 'transparent' }}>{children}</Text>}
    </Text>
  );
}

function inline(text: string, key: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0; let k = 0;
  text.replace(INLINE, (m: string, _g: string, idx: number) => {
    if (idx > last) out.push(text.slice(last, idx));
    const kk = `${key}${k++}`;
    if (m.startsWith('||')) out.push(<Spoiler key={kk}>{inline(m.slice(2, -2), kk)}</Spoiler>);
    else if (m.startsWith('**')) out.push(<Text key={kk} style={{ fontWeight: '700' }}>{inline(m.slice(2, -2), kk)}</Text>);
    else if (m.startsWith('__')) out.push(<Text key={kk} style={{ fontStyle: 'italic' }}>{inline(m.slice(2, -2), kk)}</Text>);
    else if (m.startsWith('~~')) out.push(<Text key={kk} style={{ textDecorationLine: 'line-through' }}>{inline(m.slice(2, -2), kk)}</Text>);
    else if (m.startsWith('`')) out.push(<Text key={kk} style={{ fontFamily: MONO, fontSize: 14, backgroundColor: 'rgba(0,0,0,0.25)' }}>{` ${m.slice(1, -1)} `}</Text>);
    else out.push(<Text key={kk} style={{ fontStyle: 'italic' }}>{inline(m.slice(1, -1), kk)}</Text>);
    last = idx + m.length;
    return m;
  });
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function richText(text?: string | null): React.ReactNode {
  if (!text) return null;
  const parts = String(text).split(/(```[\s\S]*?```)/g);
  return parts.map((b, bi) => {
    if (b.startsWith('```') && b.endsWith('```') && b.length >= 6) {
      const body = b.slice(3, -3).replace(/^[a-z0-9+#-]{1,15}\n/i, '').replace(/^\n|\n$/g, '');
      const before = parts.slice(0, bi).some((x) => x.trim()) ? '\n' : '';
      const after = parts.slice(bi + 1).some((x) => x.trim()) ? '\n' : '';
      return <Text key={bi} style={{ fontFamily: MONO, fontSize: 13.5, backgroundColor: 'rgba(0,0,0,0.3)' }}>{`${before}${body}${after}`}</Text>;
    }
    return b.split('\n').map((line, li, arr) => {
      const q = /^>\s?/.test(line) && !/^>\s*$/.test(line);
      const nl = li < arr.length - 1 ? '\n' : '';
      return q
        ? <Text key={`${bi}-${li}`}><Text style={{ color: C.accent, fontWeight: '900' }}>▍ </Text><Text style={{ opacity: 0.92 }}>{inline(line.replace(/^>\s?/, ''), `${bi}-${li}-`)}</Text>{nl}</Text>
        : <Text key={`${bi}-${li}`}>{inline(line, `${bi}-${li}-`)}{nl}</Text>;
    });
  });
}

export function stripFormatting(text?: string | null) {
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
