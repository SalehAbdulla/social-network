'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { type SocialUser } from '../../api/social';
import { useResource } from '../../lib/useResource';
import Loading from '../../components/Loading';
import RequestState from '../../components/RequestState';

/*
 * `@handle` → the member it names.
 *
 * A mention is only text, so the app resolves the handle and then hands the reader to the
 * profile page proper: the address they end up at is the same one every other link to
 * that member uses, which is why this redirects instead of rendering a second copy of the
 * profile. An unknown handle is answered on the spot rather than by a profile page that
 * cannot say what went wrong.
 */
export default function Handle() {
  const nickname = String(useParams<{ nickname?: string }>().nickname ?? '');
  const router = useRouter();
  const profile = useResource<SocialUser>(`/handles/${encodeURIComponent(nickname)}`, !!nickname);

  useEffect(() => {
    if (profile.data) router.replace(`/profile/${profile.data.userId}`);
  }, [profile.data, router]);

  if (profile.error) return <RequestState empty={`No member is called @${nickname}.`} />;
  return <Loading height={120} label={`Looking up @${nickname}`} />;
}
