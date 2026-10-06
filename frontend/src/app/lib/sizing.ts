/**
 * The sizes the JavaScript side has to hand over, in one place.
 *
 * Almost everything the interface is drawn at is a `--rail-*`, `--post-*`, `--story-*` or
 * `--aside-*` token in `globals.css`, and the CSS sizes the icons itself, so no component passes a
 * `size` down for those. `Avatar` is the exception: it sets `width` and `height` as an inline
 * style, which outranks any stylesheet rule, so every surface that draws one has to be handed a
 * number from here. Each mirrors a token by name, and is named for the surface rather than the call
 * site, so the same avatar cannot drift to a different size in the overlay or on the phone.
 */
export const RAIL_AVATAR_SIZE = 20;    // the rail's profile row, level with `--rail-icon`
export const POST_AVATAR_SIZE = 32;    // the post header, in the card and in the overlay
export const ACCOUNT_AVATAR_SIZE = 44; // the account block and the people list in the right column
