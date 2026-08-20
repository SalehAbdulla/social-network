"use client";

import { useRef, useState } from "react";
import StoryCard from "./StoryCard";
import { dummyStoriesData } from "../../../public/assets";

export default function StoryCarousel() {
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const startX = useRef(0);
  const scrollLeft = useRef(0);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!sliderRef.current) return;

    setIsDragging(true);

    startX.current = e.clientX;
    scrollLeft.current = sliderRef.current.scrollLeft;

    // Keep receiving pointer events even outside the div
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !sliderRef.current) return;

    const distance = e.clientX - startX.current;

    sliderRef.current.scrollLeft = scrollLeft.current - distance;
  };

  const stopDragging = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(false);

    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <div
      ref={sliderRef}
      className={`flex gap-5 w-165 overflow-x-auto scrollbar-hide select-none ${
        isDragging ? "cursor-grabbing" : "cursor-grab"
      }`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopDragging}
      onPointerCancel={stopDragging}
    >
      <StoryCard id="" />

      {dummyStoriesData.map((v) => (
        <StoryCard key={v._id} id={v._id} />
      ))}
    </div>
  );
}