import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  authorHasUnseen,
  findPosition,
  firstUnseenIndex,
  groupStories,
  isLive,
  nextPosition,
  positionForUser,
  prevPosition,
  startPosition,
  storyAt,
} from './storySequence.ts';

/** A tiny story factory so the tests read as prose, not as object literals. */
const story = (storyId: number, userId: string, viewed = false) => ({ storyId, userId, viewed });

test('groupStories keeps first-appearance order and plays each author oldest first', () => {
  const groups = groupStories([
    story(5, 'a'), story(3, 'a'), // newest first, as the server lists them
    story(9, 'b'),
    story(1, 'a'),
  ]);
  assert.deepEqual(groups.map(g => g.userId), ['a', 'b']);
  assert.deepEqual(groups[0].stories.map(s => s.storyId), [1, 3, 5]);
  assert.deepEqual(groups[1].stories.map(s => s.storyId), [9]);
});

test('firstUnseenIndex picks the earliest unseen, falls back to the first, handles empty', () => {
  assert.equal(firstUnseenIndex([story(1, 'a', true), story(2, 'a', false), story(3, 'a', false)]), 1);
  assert.equal(firstUnseenIndex([story(1, 'a', true), story(2, 'a', true)]), 0);
  assert.equal(firstUnseenIndex([]), 0);
});

test('nextPosition walks within an author, then across authors, then ends', () => {
  const groups = groupStories([story(1, 'a'), story(2, 'a'), story(3, 'b')]);
  assert.deepEqual(nextPosition(groups, { user: 0, story: 0 }), { user: 0, story: 1 });
  // last story of author a → first of author b
  assert.deepEqual(nextPosition(groups, { user: 0, story: 1 }), { user: 1, story: 0 });
  // last story overall → null (close)
  assert.equal(nextPosition(groups, { user: 1, story: 0 }), null);
});

test('prevPosition steps back and restarts at the very first story', () => {
  const groups = groupStories([story(1, 'a'), story(2, 'a'), story(3, 'b')]);
  assert.deepEqual(prevPosition(groups, { user: 1, story: 0 }), { user: 0, story: 1 });
  assert.deepEqual(prevPosition(groups, { user: 0, story: 1 }), { user: 0, story: 0 });
  // first story of the first author: nowhere to go, so it stays (the caller restarts it)
  assert.deepEqual(prevPosition(groups, { user: 0, story: 0 }), { user: 0, story: 0 });
});

test('findPosition locates a story by id, and null when it is absent', () => {
  const groups = groupStories([story(1, 'a'), story(2, 'a'), story(3, 'b')]);
  assert.deepEqual(findPosition(groups, 3), { user: 1, story: 0 });
  assert.deepEqual(findPosition(groups, 2), { user: 0, story: 1 });
  assert.equal(findPosition(groups, 99), null);
});

test('positionForUser opens at the requested story, else the author first unseen', () => {
  const groups = groupStories([story(1, 'a', true), story(2, 'a', false), story(3, 'b')]);
  assert.deepEqual(positionForUser(groups, 'a', 1), { user: 0, story: 0 });
  // unknown story id for a known author → first unseen
  assert.deepEqual(positionForUser(groups, 'a', 42), { user: 0, story: 1 });
  assert.deepEqual(positionForUser(groups, 'b'), { user: 1, story: 0 });
  assert.equal(positionForUser(groups, 'zzz'), null);
});

test('startPosition is the first author first unseen, or null with nothing to show', () => {
  const groups = groupStories([story(1, 'a', true), story(2, 'a', false), story(3, 'b')]);
  assert.deepEqual(startPosition(groups), { user: 0, story: 1 });
  assert.equal(startPosition([]), null);
});

test('storyAt reads a position and returns null when out of range', () => {
  const groups = groupStories([story(1, 'a'), story(2, 'b')]);
  assert.equal(storyAt(groups, { user: 1, story: 0 })?.storyId, 2);
  assert.equal(storyAt(groups, { user: 5, story: 0 }), null);
});

test('a full walk forwards visits every story exactly once and ends', () => {
  const groups = groupStories([story(1, 'a'), story(2, 'a'), story(3, 'b'), story(4, 'b')]);
  const visited: number[] = [];
  let pos = startPosition(groups);
  for (let guard = 0; pos && guard < 50; guard++) {
    visited.push(storyAt(groups, pos)!.storyId);
    pos = nextPosition(groups, pos);
  }
  assert.deepEqual(visited, [1, 2, 3, 4]);
});

/** A fixed "now" and two factories: a story still live at it, and one already expired. */
const NOW = Date.parse('2026-10-07T12:00:00Z');
const live = (storyId: number, userId: string, viewed = false) => ({ storyId, userId, viewed, expiresAt: '2026-10-07 18:00:00' });
const expired = (storyId: number, userId: string, viewed = false) => ({ storyId, userId, viewed, expiresAt: '2026-10-06 00:00:00' });

test('authorHasUnseen is true when any live story is unseen', () => {
  assert.equal(authorHasUnseen([live(1, 'a', true), live(2, 'a', false)], NOW), true);
});

test('authorHasUnseen is false when every live story is seen', () => {
  assert.equal(authorHasUnseen([live(1, 'a', true), live(2, 'a', true)], NOW), false);
});

test('authorHasUnseen ignores an expired unseen story', () => {
  assert.equal(authorHasUnseen([live(1, 'a', true), expired(2, 'a', false)], NOW), false);
});

test('authorHasUnseen treats an empty set — and a fully-seen own set — as seen', () => {
  assert.equal(authorHasUnseen([], NOW), false);
  assert.equal(authorHasUnseen([live(1, 'me', true)], NOW), false);
});

test('isLive compares a story against its expiry instant', () => {
  assert.equal(isLive(live(1, 'a'), NOW), true);
  assert.equal(isLive(expired(1, 'a'), NOW), false);
});
