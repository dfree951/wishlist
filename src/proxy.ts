import { NextResponse, type NextRequest } from 'next/server';
import { allowedOrigin } from './lib/origins';

export function proxy(request: NextRequest) {
  if (!allowedOrigin(request)) {
    return NextResponse.json({ error: 'Please use this app to make changes.' }, { status: 403 });
  }
  const response = request.method === 'OPTIONS'
    ? new NextResponse(null, { status: 204 }) : NextResponse.next();
  const origin = request.headers.get('origin');
  if (origin) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session-Mode');
    response.headers.set('Vary', 'Origin');
  }
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export const config = { matcher: '/api/:path*' };
