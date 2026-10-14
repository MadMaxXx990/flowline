'use strict';
/**
 * Date helpers — all operations in SERVER LOCAL TIME.
 *
 * Using toISOString() produces UTC-based strings which shift the apparent
 * date for users in timezones ahead of UTC.  These helpers use local
 * year/month/day values instead.
 */

/**
 * Return a YYYY-MM-DD string for the given date in local time.
 * @param {Date} [date=new Date()]
 */
function localDateStr(date = new Date()) {
  const y  = date.getFullYear();
  const m  = String(date.getMonth() + 1).padStart(2, '0');
  const d  = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Return a Date set to 00:00:00.000 of the given date in local time.
 * @param {Date} [date=new Date()]
 */
function startOfLocalDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Return a Date set to 23:59:59.999 of the given date in local time.
 * @param {Date} [date=new Date()]
 */
function endOfLocalDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Parse a YYYY-MM-DD string as the start of that local day.
 * Returns undefined if the string is falsy.
 */
function parseLocalDate(str) {
  if (!str) return undefined;
  const [y, m, d] = str.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
  return isNaN(dt.getTime()) ? undefined : dt;
}

module.exports = { localDateStr, startOfLocalDay, endOfLocalDay, parseLocalDate };
