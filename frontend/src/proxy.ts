import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest, type NextFetchEvent } from 'next/server';

const clerk = clerkMiddleware();

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_DEV_USER === 'true') {
    if (request.nextUrl.pathname === '/login') return NextResponse.redirect(new URL('/', request.url));
    return NextResponse.next();
  }
  return clerk(request, event);
}

// The Go backend validates API and WebSocket sessions itself.
export const config = {
  matcher: ['/((?!_next|api/v1|ws|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)'],
};
