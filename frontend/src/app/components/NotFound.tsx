import Link from "next/link";

// The one 404 surface for the whole app. The route-level `app/not-found.tsx`
// (an unmatched URL) and any client page that learns a resource is missing (a
// profile that does not exist) render this same component, so every "not found"
// looks alike no matter how the visitor got there.
export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-brand-1 mb-4">404</h1>
        <h2 className="text-2xl font-semibold text-brand-deep mb-4">Page Not Found</h2>
        <p className="text-gray-600 mb-8">The page you are looking for does not exist.</p>
        <Link
          href="/"
          className="px-6 py-3 bg-brand-1 text-white rounded-lg hover:bg-blue-700 transition"
        >
          Go Home
        </Link>
      </div>
    </div>
  );
}
