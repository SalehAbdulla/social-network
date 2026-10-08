import type { ReactNode } from 'react';
import Link from 'next/link';


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
