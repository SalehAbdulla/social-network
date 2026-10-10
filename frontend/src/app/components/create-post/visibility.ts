import { Globe, Lock, Users } from 'lucide-react';

// The three audiences a post and a story share. `selected` is a grant recorded when the item is
// written: "Only me" reads as the audience of followers the author ticked by hand.
export type Visibility = 'public' | 'followers' | 'selected';

export const VISIBILITY_OPTIONS = [
  { value: 'public' as const, label: 'Public', desc: 'Anyone on or off Social Network', Icon: Globe },
  { value: 'followers' as const, label: 'Followers', desc: 'Your followers only', Icon: Users },
  { value: 'selected' as const, label: 'Only me', desc: 'Only the followers you choose', Icon: Lock },
];
