"use strict";
var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
};
exports.__esModule = true;
exports.CSI = exports.kSubstringSearch = exports.commonPrefix = exports.charLengthLeft = exports.charLengthAt = exports.stripVTControlCharacters = exports.moveCursor = exports.cursorTo = exports.clearScreenDown = exports.clearLine = void 0;
var kUTF16SurrogateThreshold = 0x10000; // 2 ** 16
var kEscape = '\x1b';
var kSubstringSearch = Symbol('kSubstringSearch');
exports.kSubstringSearch = kSubstringSearch;
// Regex used for ansi escape code splitting
// Adopted from https://github.com/chalk/ansi-regex/blob/master/index.js
// License: MIT, authors: @sindresorhus, Qix-, arjunmehta and LitoMore
// Matches all ansi escape code sequences in a string
var ansiPattern = '[\\u001B\\u009B][[\\]()#;?]*' +
    '(?:(?:(?:[a-zA-Z\\d]*(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)' +
    '|(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))';
var ansi = new RegExp(ansiPattern, 'g');
/**
 * Remove all VT control characters. Use to estimate displayed string width.
 */
function stripVTControlCharacters(str) {
    return str.replace(ansi, '');
}
exports.stripVTControlCharacters = stripVTControlCharacters;
function CSI(strings) {
    var args = [];
    for (var _i = 1; _i < arguments.length; _i++) {
        args[_i - 1] = arguments[_i];
    }
    var ret = "".concat(kEscape, "[");
    for (var n = 0; n < strings.length; n++) {
        ret += strings[n];
        if (n < args.length)
            ret += args[n];
    }
    return ret;
}
exports.CSI = CSI;
CSI.kEscape = kEscape;
CSI.kClearToLineBeginning = CSI(templateObject_1 || (templateObject_1 = __makeTemplateObject(["1K"], ["1K"])));
CSI.kClearToLineEnd = CSI(templateObject_2 || (templateObject_2 = __makeTemplateObject(["0K"], ["0K"])));
CSI.kClearLine = CSI(templateObject_3 || (templateObject_3 = __makeTemplateObject(["2K"], ["2K"])));
CSI.kClearScreenDown = CSI(templateObject_4 || (templateObject_4 = __makeTemplateObject(["0J"], ["0J"])));
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
exports.charLengthLeft = charLengthLeft;
function charLengthAt(str, i) {
    if (str.length <= i) {
        // Pretend to move to the right. This is necessary to autocomplete while
        // moving to the right.
        return 1;
    }
    return str.codePointAt(i) >= kUTF16SurrogateThreshold ? 2 : 1;
}
exports.charLengthAt = charLengthAt;
// This runs in O(n log n).
function commonPrefix(strings) {
    if (strings.length === 1) {
        return strings[0];
    }
    var sorted = strings.slice().sort();
    var min = sorted[0];
    var max = sorted[sorted.length - 1];
    for (var i = 0; i < min.length; i++) {
        if (min[i] !== max[i]) {
            return min.slice(0, i);
        }
    }
    return min;
}
exports.commonPrefix = commonPrefix;
/**
* moves the cursor to the x and y coordinate on the given stream
*/
function cursorTo(stream, x, y, callback) {
    if (typeof y === 'function') {
        callback = y;
        y = undefined;
    }
    if (Number.isNaN(x))
        throw new Error();
    ;
    if (Number.isNaN(y))
        throw new Error();
    ;
    if (stream == null || (typeof x !== 'number' && typeof y !== 'number')) {
        if (typeof callback === 'function')
            setTimeout(callback, 0);
        return true;
    }
    if (typeof x !== 'number')
        throw new Error();
    var data = typeof y !== 'number' ? CSI(templateObject_5 || (templateObject_5 = __makeTemplateObject(["", "G"], ["", "G"])), x + 1) : CSI(templateObject_6 || (templateObject_6 = __makeTemplateObject(["", ";", "H"], ["", ";", "H"])), y + 1, x + 1);
    return stream.write(data, callback);
}
exports.cursorTo = cursorTo;
/**
 * moves the cursor relative to its current location
 */
function moveCursor(stream, dx, dy, callback) {
    if (stream == null || !(dx || dy)) {
        if (typeof callback === 'function')
            setTimeout(callback, 0);
        return true;
    }
    var data = '';
    if (dx < 0) {
        data += CSI(templateObject_7 || (templateObject_7 = __makeTemplateObject(["", "D"], ["", "D"])), -dx);
    }
    else if (dx > 0) {
        data += CSI(templateObject_8 || (templateObject_8 = __makeTemplateObject(["", "C"], ["", "C"])), dx);
    }
    if (dy < 0) {
        data += CSI(templateObject_9 || (templateObject_9 = __makeTemplateObject(["", "A"], ["", "A"])), -dy);
    }
    else if (dy > 0) {
        data += CSI(templateObject_10 || (templateObject_10 = __makeTemplateObject(["", "B"], ["", "B"])), dy);
    }
    return stream.write(data, callback);
}
exports.moveCursor = moveCursor;
/**
 * clears the current line the cursor is on:
 *   -1 for left of the cursor
 *   +1 for right of the cursor
 *    0 for the entire line
 */
function clearLine(stream, dir, callback) {
    if (stream === null || stream === undefined) {
        if (typeof callback === 'function')
            setTimeout(callback, 0);
        return true;
    }
    var type = dir < 0 ? CSI.kClearToLineBeginning : dir > 0 ? CSI.kClearToLineEnd : CSI.kClearLine;
    return stream.write(type, callback);
}
exports.clearLine = clearLine;
/**
 * clears the screen from the current position of the cursor down
 */
function clearScreenDown(stream, callback) {
    if (stream === null || stream === undefined) {
        if (typeof callback === 'function')
            setTimeout(callback, 0);
        return true;
    }
    return stream.write(CSI.kClearScreenDown, callback);
}
exports.clearScreenDown = clearScreenDown;
var templateObject_1, templateObject_2, templateObject_3, templateObject_4, templateObject_5, templateObject_6, templateObject_7, templateObject_8, templateObject_9, templateObject_10;
