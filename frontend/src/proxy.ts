import { NextResponse, type NextRequest } from 'next/server';

const publicPaths = new Set([
  '/login', '/forgot', '/reset',
  '/favicon.ico', '/favicon.svg', '/logo.svg', '/logo.png',
  '/bgImage.png', '/group_users.png', '/sponsored_img.png',
  '/sample_profile.jpg', '/sample_cover.jpg',
]);

export function proxy(request: NextRequest) {
  if (!publicPaths.has(request.nextUrl.pathname) && !request.cookies.get('session_token')?.value) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api/|_next/|ws$).*)'],
};
