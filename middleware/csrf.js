import crypto from 'crypto';

const csrfCookieName = 'csrfToken';
const csrfHeaderName = 'x-csrf-token';
const stateChangingMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const isProduction = process.env.NODE_ENV === 'production';

export const csrfCookieOptions = {
  httpOnly: false,
  secure: isProduction,
  sameSite: isProduction ? 'none' : 'lax',
  partitioned: isProduction,
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

export function issueCsrfToken(res) {
  const token = crypto.randomBytes(32).toString('hex');
  res.cookie(csrfCookieName, token, csrfCookieOptions);
  return token;
}

export default function csrfProtection(req, res, next) {
  if (!stateChangingMethods.has(req.method)) {
    return next();
  }

  const cookieToken = req.cookies[csrfCookieName];
  const headerToken = req.get(csrfHeaderName);

  if (
    typeof cookieToken !== 'string'
    || typeof headerToken !== 'string'
    || cookieToken.length !== headerToken.length
    || !crypto.timingSafeEqual(
      Buffer.from(cookieToken),
      Buffer.from(headerToken),
    )
  ) {
    return res.status(403).json({ error: 'CSRF-tarkistus epäonnistui.' });
  }

  return next();
}
