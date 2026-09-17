'use client';
import { useBackend } from './BackendProvider';
import { EditProfile } from '../pages/Profile';
export default function ProfileModel({ setShowEdit }: { setShowEdit: (show: boolean) => void }) {
 const { user, refreshUser } = useBackend();
 return <EditProfile profile={user} close={() => setShowEdit(false)} saved={() => { void refreshUser(); }} />;
}
