/**
 * The rail's measurements, on the JavaScript side.
 *
 * Everything the rail is drawn with lives in the `--rail-*` block in `globals.css`: the row
 * height, the gaps, the icon size and the two strokes are all CSS, and the rail's own rule sizes
 * every icon it contains, so no component passes a `size` down. The profile avatar is the one
 * exception. `Avatar` sizes itself with an inline `width`/`height`, and an inline style outranks
 * any stylesheet rule, so its number has to be handed over from here rather than expressed as a
 * token. It is 22 to match `--rail-icon`, and it sits in this module rather than in `SideBar` so
 * the rail's measurements stay in one place per language — the same split `mediaLimits.ts` uses
 * for the upload ceilings.
 */
export const RAIL_AVATAR_SIZE = 22;
