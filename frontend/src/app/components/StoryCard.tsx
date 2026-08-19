import { dummyStoriesData } from "../../../public/assets"

type StoryCardProps = {
    id: string
}

const getTimeAgo = (dateString: string) => {
    const seconds = Math.floor(
        (Date.now() - new Date(dateString).getTime()) / 1000
    );

    if (seconds < 60) {
        return `${seconds} second${seconds !== 1 ? "s" : ""} ago`;
    }

    const minutes = Math.floor(seconds / 60);

    if (minutes < 60) {
        return `${minutes} minute${minutes !== 1 ? "s" : ""} ago`;
    }

    const hours = Math.floor(minutes / 60);

    if (hours < 24) {
        return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
    }

    const days = Math.floor(hours / 24);

    if (days < 30) {
        return `${days} day${days !== 1 ? "s" : ""} ago`;
    }

    const months = Math.floor(days / 30);

    if (months < 12) {
        return `${months} month${months !== 1 ? "s" : ""} ago`;
    }

    const years = Math.floor(days / 365);

    return `${years} year${years !== 1 ? "s" : ""} ago`;
};

const StoryCard = (props: StoryCardProps) => {
    const data = dummyStoriesData.find((v)=>{return v._id === props.id});
    if (data === undefined) 
        return <>
            <button className="relative w-30 h-40 overflow-hidden rounded-lg border-2 border-dashed border-brand-1 items-center justify-center flex flex-col gap-2 cursor-pointer">
                <div className="bg-brand-1 w-12 h-12 rounded-full flex items-center justify-center p-0 m-0">
                    <span className="m-0 p-0 text-4xl text-white">+</span>
                </div>
                <span className="m-0 p-0">Create Story</span>
            </button>
        </>

    const lastUpdated = getTimeAgo(data.updatedAt);

    return <>
        <div style={{ backgroundColor: data.background_color }} className="relative w-30 h-40 overflow-hidden rounded-lg text-white cursor-pointer">
            {data.media_type === "image" && (
                <img src={data.media_url} alt="media" className="absolute inset-0 w-full h-full object-cover" />
            )}

            <div className="absolute inset-0 bg-black/20" />

            <img src={data.user.cover_photo.src} alt="profile icon" className="absolute top-2 left-2 z-10 w-10 h-10 rounded-full border-2 border-white object-cover" />

            <p className="absolute bottom-1 text-right z-10 text-xs w-full right-2">{lastUpdated}</p>
        </div>
    </>
}

export default StoryCard