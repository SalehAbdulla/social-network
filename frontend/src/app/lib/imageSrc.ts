import { StaticImageData } from "next/image";

// Resolves a profile/cover image value that may be either a plain URL string
// or a Next.js StaticImageData object (imported image) to a usable src string.
export function imageSrc(value: string | StaticImageData | undefined | null): string {
  if (typeof value === "string") return value;
  if (value && "src" in value) return value.src;
  return "";
}