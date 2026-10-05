export function allowedOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  const target = new URL(request.url);
  target.host = request.headers.get('host') || target.host;
  const allowed = (process.env.FRONTEND_ORIGINS || 'https://dfree951.github.io')
    .split(',').map(value => value.trim()).filter(Boolean);
  return origin === target.origin || allowed.includes(origin);
}
