'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ImagePlus, Layers, Maximize2, X, ZoomIn } from 'lucide-react';
import { originalAspect, originalClamped, type CropRatio, type CropState, type SelectedImage } from './types';
import { boxStyle, geometry, imageStyle, MEDIA_SQUARE, ratioName, useCropper } from './useCropper';

/** The four shapes the menu offers, with `original` resolved to the photo's clamped aspect. */
function aspectOptions(image: SelectedImage): { ratio: CropRatio; label: string }[] {
  return [
    { ratio: 'original', label: originalClamped(image) ? ratioName(originalAspect(image)) : 'Original' },
    { ratio: '1:1', label: '1:1' },
    { ratio: '4:5', label: '4:5' },
    { ratio: '16:9', label: '16:9' },
  ];
}

/**
 * Step 2: frame each photo.
 *
 * The square shows the photo, draggable and zoomable, inside the chosen shape's frame. The bottom
 * left holds the aspect and zoom controls; the bottom right opens the strip of thumbnails, where
 * photos reorder by drag and drop and one can be removed. Next renders the framing through a canvas
 * and uploads that; a GIF is left alone.
 */
export default function CropStep({ images, index, onIndex, onCrop, onRatio, onReorder, onRemove, onAdd, max, focusRef }: {
  images: SelectedImage[];
  index: number;
  onIndex: (index: number) => void;
  onCrop: (id: string, crop: CropState) => void;
  /** Applies a shape to every photo, the way Instagram keeps one ratio per post. */
  onRatio: (ratio: CropRatio) => void;
  onReorder: (from: number, to: number) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
  max: number;
  focusRef: React.RefObject<HTMLDivElement | null>;
}) {
  const active = images[index];
  const cropper = useCropper(active, MEDIA_SQUARE, crop => onCrop(active.id, crop));
  const [menuOpen, setMenuOpen] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [stripOpen, setStripOpen] = useState(false);
  const dragFrom = useRef<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const view = useMemo(() => geometry(active, MEDIA_SQUARE), [active]);
  const options = useMemo(() => aspectOptions(active), [active]);

  // Opening the menu puts focus on the row that is already chosen, so the arrow keys start there.
  useEffect(() => {
    if (!menuOpen) return;
    menuRef.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  }, [menuOpen]);

  // Arrow keys move between the aspect rows, the contract a menu of radio rows owes a keyboard.
  // Escape closes only the menu — stopping propagation keeps the dialog's own Escape (which would
  // discard-check) from also firing, so the innermost layer is the one that closes.
  function menuKey(event: React.KeyboardEvent) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setMenuOpen(false); return; }
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    const rows = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])];
    const at = rows.indexOf(document.activeElement as HTMLElement);
    rows[(at + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length]?.focus();
    event.preventDefault();
  }

  return <>
    <div
      ref={focusRef}
      className="cp-crop"
      data-dragging={cropper.dragging}
      tabIndex={0}
      role="group"
      aria-label="Crop area. Use arrow keys to move, plus and minus to zoom"
      onPointerDown={cropper.onPointerDown}
      onPointerMove={cropper.onPointerMove}
      onPointerUp={cropper.onPointerUp}
      onPointerCancel={cropper.onPointerUp}
      onWheel={cropper.onWheel}
      onTouchStart={cropper.onTouchStart}
      onTouchMove={cropper.onTouchMove}
      onTouchEnd={cropper.onTouchEnd}
      onKeyDown={cropper.onKeyDown}
    >
      {/* The crop frame, centred, and the photo inside it. The bars around the frame are the dialog
          surface, so a wide crop reads as the picture rather than a black gap. */}
      <div className="cp-crop-box" style={boxStyle(view)}>
        <img className="cp-crop-img" style={imageStyle(view)} src={active.url} alt="" draggable={false} />
      </div>
    </div>

    <div className="cp-controls">
      <div className="cp-ctl-group">
        <button type="button" className="cp-ctl" aria-label="Select crop" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => { setMenuOpen(value => !value); setZoomOpen(false); }}><Maximize2 aria-hidden="true" /></button>
        {menuOpen && <div ref={menuRef} role="menu" aria-label="Crop shape" className="cp-aspect" onKeyDown={menuKey}>
          {options.map(option => <button
            key={option.ratio}
            type="button"
            role="menuitemradio"
            aria-checked={active.crop.ratio === option.ratio}
            className="cp-aspect-row"
            onClick={() => { onRatio(option.ratio); setMenuOpen(false); }}
          >{option.label}{active.crop.ratio === option.ratio && <Check size={16} aria-hidden="true" />}</button>)}
          {originalClamped(active) && <p className="cp-aspect-note">This photo is {active.naturalWidth > active.naturalHeight ? 'wider' : 'taller'} than the allowed range, so Original is cropped to fit.</p>}
        </div>}
      </div>
      <div className="cp-ctl-group">
        <button type="button" className="cp-ctl" aria-label="Zoom" aria-haspopup="true" aria-expanded={zoomOpen} onClick={() => { setZoomOpen(value => !value); setMenuOpen(false); }}><ZoomIn aria-hidden="true" /></button>
        {zoomOpen && <div className="cp-zoom"><input type="range" min={1} max={3} step={0.01} value={active.crop.zoom} aria-label="Zoom level" onChange={event => cropper.zoomTo(Number(event.target.value))} /></div>}
      </div>
    </div>

    <button type="button" className="cp-ctl" aria-label="Add or reorder photos" aria-expanded={stripOpen} style={{ position: 'absolute', bottom: 16, insetInlineEnd: 16, zIndex: 2 }} onClick={() => setStripOpen(value => !value)}><Layers aria-hidden="true" /></button>

    <div className="cp-strip" hidden={!stripOpen}>
      {images.map((image, position) => <div
        key={image.id}
        className="cp-thumb"
        data-selected={position === index}
        draggable
        onDragStart={() => { dragFrom.current = position; }}
        onDragOver={event => event.preventDefault()}
        onDrop={() => { if (dragFrom.current !== null && dragFrom.current !== position) onReorder(dragFrom.current, position); dragFrom.current = null; }}
      >
        <button type="button" aria-label={`Select photo ${position + 1}`} onClick={() => onIndex(position)} style={{ display: 'block', width: '100%', height: '100%' }}>
          <img src={image.url} alt="" draggable={false} />
        </button>
        <button type="button" className="cp-thumb-remove" aria-label={`Remove photo ${position + 1}`} onClick={() => onRemove(image.id)}><X aria-hidden="true" /></button>
      </div>)}
      {images.length < max && <button type="button" className="cp-thumb-add" aria-label="Add more photos" onClick={onAdd}><ImagePlus aria-hidden="true" /></button>}
    </div>
  </>;
}
