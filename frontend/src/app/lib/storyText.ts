// A story is drawn in a fixed frame, so text that runs past the frame is cropped
// — or, while composing, hidden behind a scrollbar. Neither reads well: the point
// of the text story is that the whole moment is seen. This shrinks the font until
// the whole of the text fits the frame it sits in, so a long, multi-line moment
// is read end to end.
//
// It never grows past `max`, so a short moment keeps the size it was designed
// with, and it stops at `min` so the text stays legible. The element has to be the
// frame's direct child, because the frame's height is what the text has to fit.
export function fitStoryText(element: HTMLElement, max: number, min: number) {
  const frame = element.parentElement;
  if (!frame) return;
  // `clientHeight` counts the frame's own padding, so take it back out: the text
  // has to fit the frame's content box, not the box plus its padding.
  const frameStyle = getComputedStyle(frame);
  const available = frame.clientHeight - parseFloat(frameStyle.paddingTop) - parseFloat(frameStyle.paddingBottom);
  const area = element instanceof HTMLTextAreaElement ? element : null;
  // A paragraph that fills its frame is measured at its natural height instead, so
  // the reading of `offsetHeight` below is the text's own height and not the frame's.
  const restoreBottom = element.style.bottom;
  if (!area) element.style.bottom = 'auto';
  let size = max;
  for (;;) {
    element.style.fontSize = `${size}px`;
    if (area) area.style.height = 'auto';
    const needed = area ? area.scrollHeight : element.offsetHeight;
    if (size <= min || needed <= available) break;
    size -= 1;
  }
  // Leave the textarea sized to its content: it stays centred in the frame and, at
  // the settled size, never needs to scroll. A moment too long to fit even at `min`
  // is capped at the frame instead, so the rest of it can be scrolled to rather than
  // being clipped — shrinking is the first answer, not the only one.
  if (area) area.style.height = `${Math.min(area.scrollHeight, available)}px`;
  else element.style.bottom = restoreBottom;
}
