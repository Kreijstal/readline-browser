const kUTF16SurrogateThreshold = 0x10000; // 2 ** 16
const kEscape = '\x1b';
const kSubstringSearch = Symbol('kSubstringSearch');

// Regex used for ansi escape code splitting
// Adopted from https://github.com/chalk/ansi-regex/blob/master/index.js
// License: MIT, authors: @sindresorhus, Qix-, arjunmehta and LitoMore
// Matches all ansi escape code sequences in a string
const ansiPattern = '[\\u001B\\u009B][[\\]()#;?]*' +
  '(?:(?:(?:[a-zA-Z\\d]*(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)' +
  '|(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))';
const ansi = new RegExp(ansiPattern, 'g');

/**
 * Remove all VT control characters. Use to estimate displayed string width.
 */
function stripVTControlCharacters(str) {
  return str.replace(ansi, '');
}


function CSI(strings, ...args) {
  let ret = `${kEscape}[`;
  for (let n = 0; n < strings.length; n++) {
    ret += strings[n];
    if (n < args.length)
      ret += args[n];
  }
  return ret;
}

CSI.kEscape = kEscape;
CSI.kClearToLineBeginning = CSI`1K`;
CSI.kClearToLineEnd = CSI`0K`;
CSI.kClearLine = CSI`2K`;
CSI.kClearScreenDown = CSI`0J`;

// TODO(BridgeAR): Treat combined characters as single character, i.e,
// 'a\u0301' and '\u0301a' (both have the same visual output).
// Check Canonical_Combining_Class in
// http://userguide.icu-project.org/strings/properties
function charLengthLeft(str, i) {
  if (i <= 0)
    return 0;
  if ((i > 1 &&
    str.codePointAt(i - 2) >= kUTF16SurrogateThreshold) ||
    str.codePointAt(i - 1) >= kUTF16SurrogateThreshold) {
    return 2;
  }
  return 1;
}

function charLengthAt(str, i) {
  if (str.length <= i) {
    // Pretend to move to the right. This is necessary to autocomplete while
    // moving to the right.
    return 1;
  }
  return str.codePointAt(i) >= kUTF16SurrogateThreshold ? 2 : 1;
}


// This runs in O(n log n).
function commonPrefix(strings: string[]) {
  if (strings.length === 1) {
    return strings[0];
  }

  const sorted = strings.slice().sort();
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  for (let i = 0; i < min.length; i++) {
    if (min[i] !== max[i]) {
      return min.slice(0, i);
    }
  }
  return min;
}

/**
* moves the cursor to the x and y coordinate on the given stream
*/

function cursorTo(stream, x?, y?, callback?) {

  if (typeof y === 'function') {
    callback = y;
    y = undefined;
  }

  if (Number.isNaN(x)) throw new Error();;
  if (Number.isNaN(y)) throw new Error();;

  if (stream == null || (typeof x !== 'number' && typeof y !== 'number')) {
    if (typeof callback === 'function') setTimeout(callback, 0);
    return true;
  }

  if (typeof x !== 'number') throw new Error();

  const data = typeof y !== 'number' ? CSI`${x + 1}G` : CSI`${y + 1};${x + 1}H`;
  return stream.write(data, callback);
}

/**
 * moves the cursor relative to its current location
 */

function moveCursor(stream, dx, dy, callback?) {

  if (stream == null || !(dx || dy)) {
    if (typeof callback === 'function') setTimeout(callback, 0);
    return true;
  }

  let data = '';

  if (dx < 0) {
    data += CSI`${-dx}D`;
  } else if (dx > 0) {
    data += CSI`${dx}C`;
  }

  if (dy < 0) {
    data += CSI`${-dy}A`;
  } else if (dy > 0) {
    data += CSI`${dy}B`;
  }

  return stream.write(data, callback);
}

/**
 * clears the current line the cursor is on:
 *   -1 for left of the cursor
 *   +1 for right of the cursor
 *    0 for the entire line
 */

function clearLine(stream, dir, callback) {

  if (stream === null || stream === undefined) {
    if (typeof callback === 'function') setTimeout(callback, 0);
    return true;
  }

  const type =
    dir < 0 ? CSI.kClearToLineBeginning : dir > 0 ? CSI.kClearToLineEnd : CSI.kClearLine;
  return stream.write(type, callback);
}

/**
 * clears the screen from the current position of the cursor down
 */

function clearScreenDown(stream, callback?) {

  if (stream === null || stream === undefined) {
    if (typeof callback === 'function') setTimeout(callback, 0);
    return true;
  }

  return stream.write(CSI.kClearScreenDown, callback);
}


export {
  clearLine,
  clearScreenDown,
  cursorTo,
  moveCursor,
  stripVTControlCharacters,
  charLengthAt,
  charLengthLeft,
  commonPrefix,
  kSubstringSearch,
  CSI
};