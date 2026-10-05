import { z } from 'zod';
import { clearOwnerSession, isOwner, setOwnerSession, validPassword } from '@/lib/auth';
import { body, errorResponse, HttpError, json, rateLimit, sameOrigin } from '@/lib/http';
import { createSessionToken } from '@/lib/session-token';
export async function GET() { try { return json({ authenticated: await isOwner() }); } catch (e) { return errorResponse(e); } }
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await rateLimit(request, 'login', 30);
    const { password } = z.object({ password: z.string().max(200) }).parse(await body(request));
    if (!validPassword(password)) throw new HttpError(401, 'That password is not correct.');
    if (request.headers.get('x-session-mode') === 'bearer') {
      return json({ authenticated: true, token: createSessionToken() });
    }
    await setOwnerSession();
    return json({ authenticated: true });
  } catch (e) { return errorResponse(e); }
}
export async function DELETE(request: Request) {
  try { sameOrigin(request); await clearOwnerSession(); return json({ authenticated: false }); } catch (e) { return errorResponse(e); }
}
