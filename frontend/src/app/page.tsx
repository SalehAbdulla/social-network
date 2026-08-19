import Image from "next/image";
import { dummyStoriesData } from "../../public/assets";
import StoryCard from "./components/StoryCard";

export default function Feed() {
  return (
    <div className="flex flex-col justify-center px-10">
      <div className="flex gap-5">
        <StoryCard id=""/>
        {dummyStoriesData.slice(0, 4).map((v) => <StoryCard key={v._id} id={v._id} />)}
      </div>
    </div>
  );
}
