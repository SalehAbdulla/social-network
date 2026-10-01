import type { ReactNode } from 'react';
import Link from 'next/link';

/**
 * Turns the `#tags` and `@handles` in a piece of text into links.
 *
 * It is a scan rather than a regular expression on purpose. The boundary rule — the
 * symbol may not be glued to a word on its left — is naturally a lookbehind, and a
 * lookbehind is a syntax error in the browser versions this app still has to serve,
 * where the failure would be a page that does not parse rather than one message that
 * renders plainly.
 *
 * The two halves are the app's two ways of being named: `#tag` opens that tag's results
 * page, and `@handle` opens the member it names. A tag link is lowercased because the
 * tag page compares against a lowercased body, and a handle link keeps the typed case
 * because the lookup ignores case — so the same text works the way it was written and
 * the way it is clicked.
 */

const WORD = /[A-Za-z0-9_]/;

function isWord(character: string | undefined): boolean {
  return character !== undefined && WORD.test(character);
}

const linkClass = 'font-medium text-brand-1 hover:underline';

export function linkify(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let plain = '';
  let index = 0;
  while (index < text.length) {
    const character = text[index];
    // Four things make a symbol start a link rather than sit in a word: it is `#` or
    // `@`, it is not preceded by a word character (which is what keeps `someone@host`
    // and `word#tag` as plain text), it is not preceded by a slash (a URL fragment like
    // `site/#top` is an address, not a tag), and something follows it.
    const boundary = !isWord(text[index - 1]) && text[index - 1] !== '/';
    if ((character === '#' || character === '@') && boundary) {
      let end = index + 1;
      while (end < text.length && isWord(text[end])) end += 1;
      const word = text.slice(index + 1, end);
      if (word) {
        if (plain) {
          nodes.push(plain);
          plain = '';
        }
        nodes.push(character === '#'
          ? <Link key={index} href={`/hashtag/${word.toLowerCase()}`} className={linkClass}>#{word}</Link>
          : <Link key={index} href={`/u/${word}`} className={linkClass}>@{word}</Link>);
        index = end;
        continue;
      }
    }
    plain += character;
    index += 1;
  }
  if (plain) nodes.push(plain);
  return nodes;
}
