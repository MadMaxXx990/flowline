'use strict';
/**
 * Signed-cookie flash middleware.
 *
 * setFlash(res, type, message)
 *   Writes a one-time flash message into a signed cookie "fl_flash".
 *   type: 'success' | 'danger' | 'warning' | 'info'
 *
 * flashMiddleware (Express middleware)
 *   Reads and immediately clears the fl_flash cookie on every request.
 *   Exposes res.locals.flash = { type, message } or null.
 *
 * Secret: COOKIE_SECRET from .env, falls back to JWT_SECRET if absent.
 * cookie-parser must be mounted before this middleware with the same secret
 * so that req.signedCookies is populated.
 */

const COOKIE_NAME = 'fl_flash';
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  signed: true,
  path: '/',
  maxAge: 60 * 1000, // 60 s is enough for one redirect round-trip
};

/**
 * Write a flash message. Call this before a redirect.
 */
const setFlash = (res, type, message) => {
  res.cookie(COOKIE_NAME, JSON.stringify({ type, message }), COOKIE_OPTS);
};

/**
 * Express middleware: read + clear the flash cookie, expose res.locals.flash.
 * Mount this after cookie-parser.
 */
const flashMiddleware = (req, res, next) => {
  const raw = req.signedCookies && req.signedCookies[COOKIE_NAME];
  if (raw) {
    // Clear immediately so it only shows once
    res.clearCookie(COOKIE_NAME, { path: '/' });
    try {
      res.locals.flash = JSON.parse(raw);
    } catch {
      res.locals.flash = null;
    }
  } else {
    res.locals.flash = null;
  }
  next();
};

module.exports = { setFlash, flashMiddleware };
