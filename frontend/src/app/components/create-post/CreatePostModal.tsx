'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ChevronLeft, X } from 'lucide-react';
import { type FollowLists, type Post, errorMessage, request, upload } from '../../api/social';
import { useDialogFocus } from '../../lib/useDialogFocus';
import { useResource } from '../../lib/useResource';
import { IMAGE_ACCEPT, MAX_ATTACHMENTS, MEDIA_ACCEPT } from '../../lib/mediaLimits';
import { validateImage } from '../ImagePicker';
import Tabs from '../ui/Tabs';
import SelectStep from './SelectStep';
import CropStep from './CropStep';
import DetailsStep from './DetailsStep';
import StoryComposer from './StoryComposer';
import ShareStatus, { type SharePhase } from './ShareStatus';
import DiscardDialog from './DiscardDialog';
import { MEDIA_SQUARE, renderCroppedFile, withRatio } from './useCropper';
import { DEFAULT_CROP, fileKey, type CreateContext, type CropRatio, type SelectedImage } from './types';

type Step = 'select' | 'crop' | 'details';
type Privacy = 'public' | 'followers' | 'selected';

const UNSUPPORTED = 'Unsupported file. Use JPEG, PNG, GIF or WebP up to 10 MB.';
const HEADER_ACTION = 'inline-flex h-8 items-center rounded-[8px] px-2 text-sm font-semibold text-dm-blue transition-opacity enabled:hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none';
const CREATE_TABS = [{ value: 'post', label: 'Post' }, { value: 'story', label: 'Story' }];

export default function CreatePostModal({ context, groupId, groupName = '', groupAvatar = '', onClose, onShared }: {
  context: CreateContext;
  groupId?: string;
  groupName?: string;
  groupAvatar?: string;
  onClose: () => void;
  onShared: (post?: Post) => void;
}) {
  const [step, setStep] = useState<Step>('select');
  const [images, setImages] = useState<SelectedImage[]>([]);
  const [index, setIndex] = useState(0);
  const [caption, setCaption] = useState('');
  const [privacy, setPrivacy] = useState<Privacy>('public');
  const [selectedFollowers, setSelectedFollowers] = useState<string[]>([]);
  const [textMode, setTextMode] = useState(false);
  const [helper, setHelper] = useState('');
  const [phase, setPhase] = useState<SharePhase | 'editing'>('editing');
  const [errorMsg, setErrorMsg] = useState('');
  const [progress, setProgress] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [mode, setMode] = useState<'post' | 'story'>('post');
  const [storyText, setStoryText] = useState('');
  const [storyColor, setStoryColor] = useState('#4f46e5');
  const [storyMedia, setStoryMedia] = useState<{ file: File; preview: string; kind: 'image' | 'video' } | null>(null);
  const pending = useRef<() => void>(() => {});
  const busy = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const liveUrls = useRef<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const pickRef = useRef<HTMLButtonElement>(null);
  const cropRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLTextAreaElement>(null);
  const storyInput = useRef<HTMLInputElement>(null);
  const storyTextRef = useRef<HTMLTextAreaElement>(null);
  const followers = useResource<FollowLists>('/users/me/follows', privacy === 'selected');

  const maxImages = context === 'group' ? 1 : MAX_ATTACHMENTS;
  const editing = phase === 'editing';
  const storyMode = mode === 'story';
  const dirty = images.length > 0 || caption.trim() !== '' || storyText.trim() !== '' || !!storyMedia;
  const followersLoading = privacy === 'selected' && followers.loading;
  const selectedMissing = privacy === 'selected' && (followersLoading || selectedFollowers.length === 0);
  const hasContent = !!caption.trim() || images.length > 0;
  const shareBlocked = !hasContent || (context === 'feed' && selectedMissing);
  const shareHint = !hasContent ? 'Write something or add a photo.' : selectedMissing ? 'Choose at least one follower.' : '';
  const storyReady = storyText.trim() !== '' || !!storyMedia;
  const storyBlocked = !storyReady || selectedMissing;
  const storyHint = !storyReady ? 'Write something or add a photo.' : selectedMissing ? 'Choose at least one follower.' : '';
  const showTabs = editing && context === 'feed' && step === 'select';
  const title = storyMode ? 'Create new story' : 'Create new post';

  const requestClose = useCallback(() => {
    if (phase === 'sharing') return;
    if (confirmOpen) { setConfirmOpen(false); return; }
    if (dirty) { pending.current = () => onClose(); setConfirmOpen(true); return; }
    onClose();
  }, [phase, confirmOpen, dirty, onClose]);
  const dialog = useDialogFocus<HTMLDivElement>(requestClose, { initialFocus: pickRef as React.RefObject<HTMLElement | null> });

  useEffect(() => () => { liveUrls.current.forEach(url => URL.revokeObjectURL(url)); }, []);
  useEffect(() => () => { if (storyMedia) URL.revokeObjectURL(storyMedia.preview); }, [storyMedia]);

  useEffect(() => {
    if (!editing) return;
    if (storyMode) storyTextRef.current?.focus();
    else if (step === 'crop') cropRef.current?.focus();
    else if (step === 'details') captionRef.current?.focus();
  }, [step, editing, storyMode]);

  useEffect(() => {
    if (!editing || !dirty) return;
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [editing, dirty]);

  useEffect(() => {
    if (phase !== 'success') return;
    const timer = window.setTimeout(onClose, 1200);
    return () => window.clearTimeout(timer);
  }, [phase, onClose]);

  function makeImage(file: File, width: number, height: number): SelectedImage {
    const url = URL.createObjectURL(file);
    liveUrls.current.push(url);
    return { id: `${fileKey(file)}:${url}`, file, url, naturalWidth: width, naturalHeight: height, crop: { ...DEFAULT_CROP } };
  }

  async function addFiles(files: File[]) {
    if (!editing || !files.length) return;
    let list = images;
    let rejected = false;
    for (const file of files) {
      if (list.length >= maxImages) { toast.error(maxImages === 1 ? 'You can add 1 photo.' : `You can add up to ${maxImages} photos.`); break; }
      try {
        const size = await validateImage(file);
        list = [...list, makeImage(file, size.width, size.height)];
      } catch { rejected = true; }
    }
    if (rejected) setHelper(UNSUPPORTED);
    else if (list.length !== images.length) setHelper('');
    if (list.length === images.length) return;
    setImages(list);
    setIndex(list.length - 1);
    setTextMode(false);
    if (step !== 'details') setStep('crop');
  }

  function pickPhotos() { fileInput.current?.click(); }

  function pickStoryMedia() { storyInput.current?.click(); }

  function addStoryFile(file: File) {
    setStoryMedia({ file, preview: URL.createObjectURL(file), kind: file.type.startsWith('video/') ? 'video' : 'image' });
  }

  function reorder(from: number, to: number) {
    setImages(list => { const next = [...list]; const [moved] = next.splice(from, 1); next.splice(to, 0, moved); return next; });
    setIndex(to);
  }

  function removeAt(id: string) {
    setImages(list => {
      const at = list.findIndex(image => image.id === id);
      const removed = list[at];
      if (removed) URL.revokeObjectURL(removed.url);
      const next = list.filter(image => image.id !== id);
      setIndex(current => next.length === 0 ? 0 : Math.min(current >= at ? current - 1 : current, next.length - 1));
      if (next.length === 0) { setStep('select'); setTextMode(false); }
      return next;
    });
  }

  function updateCrop(id: string, crop: SelectedImage['crop']) {
    setImages(list => list.map(image => image.id === id ? { ...image, crop } : image));
  }

  function applyRatio(ratio: CropRatio) {
    setImages(list => list.map(image => ({ ...image, crop: withRatio(image, ratio, MEDIA_SQUARE) })));
  }

  function toggleFollower(id: string) {
    setSelectedFollowers(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  }

  function clearPhotos() {
    setImages(list => { list.forEach(image => URL.revokeObjectURL(image.url)); return []; });
    setIndex(0);
  }

  function goNext() { if (step === 'crop') setStep('details'); }

  function goBack() {
    if (step === 'details') { setStep(images.length ? 'crop' : 'select'); return; }
    if (step !== 'crop') return;
    if (dirty) { pending.current = () => { clearPhotos(); setStep('select'); }; setConfirmOpen(true); return; }
    setStep('select');
  }

  async function uploadOnce(file: File): Promise<string> {
    try { return (await upload(file, abort.current?.signal)).url; }
    catch { return (await upload(file, abort.current?.signal)).url; }
  }

  async function share() {
    if (!editing || busy.current || shareBlocked) return;
    busy.current = true;
    abort.current = new AbortController();
    setPhase('sharing');
    setProgress(0);
    setErrorMsg('');
    try {
      if (context === 'group') {
        const mediaUrl = images[0] ? await uploadOnce(await renderCroppedFile(images[0])) : '';
        await request(`/groups/${groupId}/content/posts?parentId=0`, 'POST',
          { title: '', content: caption.trim(), mediaUrl, startsAt: '' }, abort.current.signal);
        onShared();
      } else {
        const urls = new Array<string>(images.length).fill('');
        let done = 0;
        await Promise.all(images.map(async (image, position) => {
          urls[position] = await uploadOnce(await renderCroppedFile(image));
          done += 1;
          setProgress(Math.round((done / images.length) * 100));
        }));
        const created = await request<Post>('/posts', 'POST', {
          title: '', content: caption.trim(), imageUrls: urls, privacy,
          selectedFollowerIds: privacy === 'selected' ? selectedFollowers : [],
        }, abort.current.signal);
        onShared(created);
      }
      setPhase('success');
    } catch (error) {
      setPhase('error');
      setErrorMsg(errorMessage(error));
    } finally {
      busy.current = false;
    }
  }

  async function shareStory() {
    if (!editing || busy.current || storyBlocked) return;
    busy.current = true;
    abort.current = new AbortController();
    setPhase('sharing');
    setProgress(0);
    setErrorMsg('');
    try {
      const attachment = storyMedia ? await upload(storyMedia.file, abort.current.signal) : null;
      await request('/stories', 'POST', {
        content: storyText.trim(),
        backgroundColor: storyColor,
        mediaUrl: attachment?.url || '',
        mediaType: attachment?.mediaType || 'text',
        privacy,
        selectedFollowerIds: privacy === 'selected' ? selectedFollowers : [],
      }, abort.current.signal);
      onShared();
      setPhase('success');
    } catch (error) {
      setPhase('error');
      setErrorMsg(errorMessage(error));
    } finally {
      busy.current = false;
    }
  }

  function backToEdit() { setPhase('editing'); setErrorMsg(''); }

  function discard() {
    abort.current?.abort();
    const action = pending.current;
    pending.current = () => {};
    setConfirmOpen(false);
    action();
  }

  const textOnly = textMode && images.length === 0;

  return <>
    <div className="cp-scrim" aria-hidden="true" />
    <div className="cp-root" onClick={event => { if (event.target === event.currentTarget) requestClose(); }}>
      <input
        ref={fileInput}
        type="file"
        accept={IMAGE_ACCEPT}
        multiple={maxImages > 1}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
        onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ''; void addFiles(files); }}
      />
      <input
        ref={storyInput}
        type="file"
        accept={MEDIA_ACCEPT}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
        onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) addStoryFile(file); }}
      />
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cp-title"
        tabIndex={-1}
        className="cp-dialog"
        data-step={step}
        data-mode={storyMode ? 'story' : textOnly ? 'text' : 'edit'}
        data-anim="true"
        onDragOver={event => { if (editing && !storyMode && step !== 'details') { event.preventDefault(); setDragOver(true); } }}
        onDragLeave={event => { const to = event.relatedTarget as Node | null; if (!to || !event.currentTarget.contains(to)) setDragOver(false); }}
        onDrop={event => { event.preventDefault(); setDragOver(false); if (editing && !storyMode && step !== 'details') void addFiles(Array.from(event.dataTransfer.files)); }}
        onPaste={event => { if (!editing || storyMode || step === 'details') return; const files = Array.from(event.clipboardData.files); if (files.length) { event.preventDefault(); void addFiles(files); } }}
        onKeyDown={event => { if (!editing || !(event.metaKey || event.ctrlKey) || event.key !== 'Enter') return; if (storyMode) { event.preventDefault(); void shareStory(); } else if (step === 'details') { event.preventDefault(); void share(); } }}
      >
        <header className="cp-header">
          <div className="cp-head-zone">
            {editing && !storyMode && step !== 'select' && <button type="button" className="flex size-8 items-center justify-center rounded-full text-text transition-colors hover:bg-dm-surface motion-reduce:transition-none" aria-label="Back" onClick={goBack}><ChevronLeft size={20} aria-hidden="true" /></button>}
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-center self-stretch">
            {showTabs && <Tabs tabs={CREATE_TABS} value={mode} onChange={value => setMode(value as 'post' | 'story')} label="Create" />}
            <h2 id="cp-title" className={showTabs ? 'sr-only' : 'cp-title'}>{phase === 'sharing' ? 'Sharing' : title}</h2>
          </div>
          <div className="cp-head-zone" data-align="end">
            {editing && !storyMode && step === 'crop' && <button type="button" className={HEADER_ACTION} onClick={goNext}>Next</button>}
            {editing && !storyMode && step === 'details' && <span title={shareHint || undefined}><button type="button" className={HEADER_ACTION} disabled={shareBlocked} onClick={() => void share()}>Share</button></span>}
            {editing && storyMode && <span title={storyHint || undefined}><button type="button" className={HEADER_ACTION} disabled={storyBlocked} onClick={() => void shareStory()}>Share</button></span>}
          </div>
        </header>

        {phase === 'sharing' && <div className="cp-progress"><div className="cp-progress-fill" style={{ width: `${progress}%` }} /></div>}

        <div className="cp-body">
          {phase !== 'editing'
            ? <ShareStatus phase={phase} message={errorMsg} onRetry={() => void (storyMode ? shareStory() : share())} onBack={backToEdit} onDone={onClose} />
            : storyMode
              ? <StoryComposer
                text={storyText}
                onText={setStoryText}
                color={storyColor}
                onColor={setStoryColor}
                media={storyMedia}
                onPickMedia={pickStoryMedia}
                onClearMedia={() => setStoryMedia(null)}
                textRef={storyTextRef}
                privacy={privacy}
                onPrivacy={setPrivacy}
                followers={followers.data?.followers ?? []}
                selectedFollowers={selectedFollowers}
                onToggleFollower={toggleFollower}
                followersLoading={followersLoading}
              />
              : step === 'select'
                ? <div className="cp-media" data-drop={dragOver}>
                  <SelectStep onPick={pickPhotos} onTextPost={() => { setTextMode(true); setStep('details'); }} helper={helper} pickRef={pickRef} />
                </div>
                : step === 'crop'
                  ? <div className="cp-media">
                    <CropStep images={images} index={index} onIndex={setIndex} onCrop={updateCrop} onRatio={applyRatio} onReorder={reorder} onRemove={removeAt} onAdd={pickPhotos} max={maxImages} focusRef={cropRef} />
                  </div>
                  : <DetailsStep
                    context={context}
                    groupName={groupName}
                    groupAvatar={groupAvatar}
                    images={images}
                    index={index}
                    onIndex={setIndex}
                    textMode={textOnly}
                    caption={caption}
                    onCaption={setCaption}
                    privacy={privacy}
                    onPrivacy={setPrivacy}
                    followers={followers.data?.followers ?? []}
                    selectedFollowers={selectedFollowers}
                    onToggleFollower={toggleFollower}
                    followersLoading={followersLoading}
                    onAddPhotos={() => setStep('select')}
                    captionRef={captionRef}
                  />}
        </div>
        {confirmOpen && <DiscardDialog onDiscard={discard} onCancel={() => setConfirmOpen(false)} />}
      </div>
      <button type="button" className="fixed end-4 top-4 z-[62] flex size-6 items-center justify-center rounded-[8px] text-white transition-colors hover:bg-white/15 disabled:opacity-40 motion-reduce:transition-none" aria-label="Close" disabled={phase === 'sharing'} onClick={requestClose}><X aria-hidden="true" /></button>
    </div>
  </>;
}