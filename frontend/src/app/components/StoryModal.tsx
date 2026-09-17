'use client';
import { CreateStory } from './StoriesBar';
export default function StoryModal({ setShowModal, fetchStories }: { setShowModal: (show: boolean) => void; fetchStories: () => void }) {
 return <CreateStory close={() => setShowModal(false)} saved={fetchStories} />;
}
