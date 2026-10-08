'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { type SocialUser } from '../../api/social';
import { useResource } from '../../lib/useResource';
import Loading from '../../components/Loading';
import RequestState from '../../components/RequestState';

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
