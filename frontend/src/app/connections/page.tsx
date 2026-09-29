import { redirect } from 'next/navigation';

// The Connections screen became the profile's followers/following dialogs, so
// this URL is deliberately kept as a redirect rather than deleted: links and
// bookmarks made while it existed still land somewhere useful. It is the only
// legacy route left — the standalone follows page was removed outright (dc453f6)
// — and the browser suite asserts both the session gate and the destination.
export default function LegacyConnections() {
  redirect('/profile');
}
