import { redirect } from 'next/navigation';

export default function LegacyConnections() {
  redirect('/follows');
}
