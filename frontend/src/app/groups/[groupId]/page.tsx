import { redirect } from 'next/navigation';
export default async function GroupDetails({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  redirect(`/messages/groups/${groupId}`);
}
