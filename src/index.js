"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var _a, _b;
exports.__esModule = true;
exports.moveCursor = exports.cursorTo = exports.clearScreenDown = exports.createInterface = exports.clearLine = exports.Interface = void 0;
var string_width_1 = require("string-width");
var string_decoder_1 = require("string_decoder");
var eventemitter2_1 = require("eventemitter2");
var utils_1 = require("./utils");
exports.clearLine = utils_1.clearLine;
exports.clearScreenDown = utils_1.clearScreenDown;
exports.cursorTo = utils_1.cursorTo;
exports.moveCursor = utils_1.moveCursor;
var kHistorySize = 30;
var kMincrlfDelay = 100;
// \r\n, \n, or \r followed by something other than \n
var lineEnding = /\r?\n|\r(?!\n)/;
var kLineObjectStream = Symbol('line object stream');
var kQuestionCancel = Symbol('kQuestionCancel');
// GNU readline library - keyseq-timeout is 500ms (default)
var ESCAPE_CODE_TIMEOUT = 500;
/**
 * Creates a new `readline.Interface` instance.
 * @param {Readable | {
 *   input: Readable;
 *   output: Writable;
 *   completer?: Function;
 *   terminal?: boolean;
 *   history?: string[];
 *   historySize?: number;
 *   removeHistoryDuplicates?: boolean;
 *   prompt?: string;
 *   crlfDelay?: number;
 *   escapeCodeTimeout?: number;
 *   tabSize?: number;
 *   signal?: AbortSignal;
 *   }} input
 * @param {Writable} [output]
 * @param {Function} [completer]
 * @param {boolean} [terminal]
 * @returns {Interface}
 */
function createInterface(input, output, completer, terminal) {
    return new Interface(input, output, completer, terminal);
}
exports.createInterface = createInterface;
var Interface = /** @class */ (function (_super) {
    __extends(Interface, _super);
    function Interface(input, output, completer, terminal) {
        var _this = _super.call(this) || this;
        _this.input = input;
        _this.output = output;
        _this.completer = completer;
        _this._sawReturnAt = 0;
        // TODO(BridgeAR): Document this property. The name is not ideal, so we might
        // want to expose an alias and document that instead.
        _this.isCompletionEnabled = true;
        _this._sawKeyPress = false;
        _this.escapeCodeTimeout = ESCAPE_CODE_TIMEOUT;
        _this.tabSize = 8;
        _this.closed = false;
        _this.paused = false;
        _this.terminal = false;
        _this.history = [];
        _this.historySize = kHistorySize;
        _this.removeHistoryDuplicates = false;
        _this.crlfDelay = kMincrlfDelay;
        _this._oldPrompt = '';
        _this._prompt = '> ';
        _this.cursor = 0;
        _this.historyIndex = 0;
        _this.line = '';
        _this._line_buffer = '';
        _this[_a] = _this._questionCancel.bind(_this);
        _this[_b] = undefined;
        var history;
        var historySize;
        var removeHistoryDuplicates = false;
        var crlfDelay;
        var prompt = '> ';
        var signal;
        if (input && input.input) {
            // An options object was given
            output = input.output;
            completer = input.completer;
            terminal = input.terminal;
            history = input.history;
            historySize = input.historySize;
            signal = input.signal;
            if (input.tabSize !== undefined) {
                _this.tabSize = input.tabSize;
            }
            removeHistoryDuplicates = input.removeHistoryDuplicates;
            if (input.prompt !== undefined) {
                prompt = input.prompt;
            }
            if (input.escapeCodeTimeout !== undefined) {
                if (Number.isFinite(input.escapeCodeTimeout)) {
                    _this.escapeCodeTimeout = input.escapeCodeTimeout;
                }
                else {
                    throw new Error('input.escapeCodeTimeout');
                }
            }
            crlfDelay = input.crlfDelay;
            input = input.input;
        }
        if (completer !== undefined && typeof completer !== 'function') {
            throw new Error('completer');
        }
        if (history === undefined) {
            history = [];
        }
        else {
        }
        if (historySize === undefined) {
            historySize = kHistorySize;
        }
        // Backwards compat; check the isTTY prop of the output stream
        //  when `terminal` was not specified
        if (terminal === undefined && !(output === null || output === undefined)) {
            terminal = !!output.isTTY;
        }
        _this.line = '';
        _this[utils_1.kSubstringSearch] = null;
        _this.output = output;
        _this.input = input;
        _this.history = history;
        _this.historySize = historySize;
        _this.removeHistoryDuplicates = !!removeHistoryDuplicates;
        _this.crlfDelay = crlfDelay ?
            Math.max(kMincrlfDelay, crlfDelay) : kMincrlfDelay;
        // Check arity, 2 - for async, 1 for sync
        if (typeof completer === 'function') {
            _this.completer = completer.length === 2 ?
                completer :
                function completerWrapper(v, cb) {
                    cb(null, completer(v));
                };
        }
        _this[kQuestionCancel] = _this._questionCancel.bind(_this);
        _this.setPrompt(prompt);
        _this.terminal = !!terminal;
        _this.input.on('error', _this.onerror.bind(_this));
        if (!_this.terminal) {
            var onSelfCloseWithoutTerminal = function () {
                input.removeListener('data', _this.ondata.bind(_this));
                input.removeListener('error', _this.onerror.bind(_this));
                input.removeListener('end', _this.onend.bind(_this));
            };
            input.on('data', _this.ondata.bind(_this));
            input.on('end', _this.onend.bind(_this));
            _this.once('close', onSelfCloseWithoutTerminal);
            _this._decoder = new string_decoder_1.StringDecoder('utf8');
        }
        else {
            var onSelfCloseWithTerminal = function () {
                input.removeListener('keypress', _this.onkeypress.bind(_this));
                input.removeListener('error', _this.onerror.bind(_this));
                input.removeListener('end', _this.ontermend.bind(_this));
                if (output !== null && output !== undefined) {
                    output.removeListener('resize', _this.onresize.bind(_this));
                }
            };
            // `input` usually refers to stdin
            input.on('keypress', _this.onkeypress.bind(_this));
            input.on('end', _this.ontermend.bind(_this));
            _this._setRawMode(true);
            _this.terminal = true;
            // Cursor position on the line.
            _this.cursor = 0;
            _this.historyIndex = -1;
            if (output !== null && output !== undefined)
                output.on('resize', _this.onresize.bind(_this));
            _this.once('close', onSelfCloseWithTerminal);
        }
        // Current line
        _this.line = '';
        input.resume();
        return _this;
    }
    Object.defineProperty(Interface.prototype, "columns", {
        get: function () {
            return this.output.columns;
        },
        enumerable: false,
        configurable: true
    });
    Interface.prototype.onerror = function (err) {
        this.emit('error', err);
    };
    Interface.prototype.ondata = function (data) {
        this._normalWrite(data);
    };
    Interface.prototype.onend = function () {
        if (typeof this._line_buffer === 'string' &&
            this._line_buffer.length > 0) {
            this.emit('line', this._line_buffer);
        }
        this.close();
    };
    Interface.prototype.ontermend = function () {
        if (typeof this.line === 'string' && this.line.length > 0) {
            this.emit('line', this.line);
        }
        this.close();
    };
    Interface.prototype.onkeypress = function (s, key) {
        this._ttyWrite(s, key);
        if (key && key.sequence) {
            // If the key.sequence is half of a surrogate pair
            // (>= 0xd800 and <= 0xdfff), refresh the line so
            // the character is displayed appropriately.
            var ch = key.sequence.codePointAt(0);
            if (ch >= 0xd800 && ch <= 0xdfff)
                this._refreshLine();
        }
    };
    Interface.prototype.onresize = function () {
        this._refreshLine();
    };
    /**
     * Sets the prompt written to the output.
     * @param {string} prompt
     * @returns {void}
     */
    Interface.prototype.setPrompt = function (prompt) {
        this._prompt = prompt;
    };
    ;
    /**
     * Returns the current prompt used by `rl.prompt()`.
     * @returns {string}
     */
    Interface.prototype.getPrompt = function () {
        return this._prompt;
    };
    ;
    Interface.prototype._setRawMode = function (mode) {
        var wasInRawMode = this.input.isRaw;
        if (typeof this.input.setRawMode === 'function') {
            this.input.setRawMode(mode);
        }
        return wasInRawMode;
    };
    ;
    /**
     * Writes the configured `prompt` to a new line in `output`.
     * @param {boolean} [preserveCursor]
     * @returns {void}
     */
    Interface.prototype.prompt = function (preserveCursor) {
        if (this.paused)
            this.resume();
        if (this.terminal) {
            if (!preserveCursor)
                this.cursor = 0;
            this._refreshLine();
        }
        else {
            this._writeToOutput(this._prompt);
        }
    };
    ;
    /**
     * Displays `query` by writing it to the `output`.
     * @param {string} query
     * @param {{ signal?: AbortSignal; }} [options]
     * @param {Function} cb
     * @returns {void}
     */
    Interface.prototype.question = function (query, options, cb) {
        var _this = this;
        cb = typeof options === 'function' ? options : cb;
        options = typeof options === 'object' && options !== null ? options : {};
        if (options.signal) {
            if (options.signal.aborted) {
                return;
            }
            options.signal.addEventListener('abort', function () {
                _this[kQuestionCancel]();
            }, { once: true });
        }
        if (typeof cb === 'function') {
            if (this._questionCallback) {
                this.prompt();
            }
            else {
                this._oldPrompt = this._prompt;
                this.setPrompt(query);
                this._questionCallback = cb;
                this.prompt();
            }
        }
    };
    ;
    Interface.prototype._questionCancel = function () {
        if (this._questionCallback) {
            this._questionCallback = null;
            this.setPrompt(this._oldPrompt);
            this.clearLine();
        }
    };
    Interface.prototype._onLine = function (line) {
        if (this._questionCallback) {
            var cb = this._questionCallback;
            this._questionCallback = null;
            this.setPrompt(this._oldPrompt);
            cb(line);
        }
        else {
            this.emit('line', line);
        }
    };
    ;
    Interface.prototype._writeToOutput = function (stringToWrite) {
        if (this.output !== null && this.output !== undefined) {
            this.output.write(stringToWrite);
        }
    };
    ;
    Interface.prototype._addHistory = function () {
        if (this.line.length === 0)
            return '';
        // If the history is disabled then return the line
        if (this.historySize === 0)
            return this.line;
        // If the trimmed line is empty then return the line
        if (this.line.trim().length === 0)
            return this.line;
        if (this.history.length === 0 || this.history[0] !== this.line) {
            if (this.removeHistoryDuplicates) {
                // Remove older history line if identical to new one
                var dupIndex = this.history.indexOf(this.line);
                if (dupIndex !== -1)
                    this.history.splice(dupIndex, 1);
            }
            this.history.unshift(this.line);
            // Only store so many
            if (this.history.length > this.historySize)
                this.history.pop();
        }
        this.historyIndex = -1;
        // The listener could change the history object, possibly
        // to remove the last added entry if it is sensitive and should
        // not be persisted in the history, like a password
        var line = this.history[0];
        // Emit history event to notify listeners of update
        this.emit('history', this.history);
        return line;
    };
    ;
    Interface.prototype._refreshLine = function () {
        // line length
        var line = this._prompt + this.line;
        var dispPos = this._getDisplayPos(line);
        var lineCols = dispPos.cols;
        var lineRows = dispPos.rows;
        // cursor position
        var cursorPos = this.getCursorPos();
        // First move to the bottom of the current line, based on cursor pos
        var prevRows = this.prevRows || 0;
        if (prevRows > 0) {
            (0, utils_1.moveCursor)(this.output, 0, -prevRows);
        }
        // Cursor to left edge.
        (0, utils_1.cursorTo)(this.output, 0);
        // erase data
        (0, utils_1.clearScreenDown)(this.output);
        // Write the prompt and the current buffer content.
        this._writeToOutput(line);
        // Force terminal to allocate a new line
        if (lineCols === 0) {
            this._writeToOutput(' ');
        }
        // Move cursor to original position.
        (0, utils_1.cursorTo)(this.output, cursorPos.cols);
        var diff = lineRows - cursorPos.rows;
        if (diff > 0) {
            (0, utils_1.moveCursor)(this.output, 0, -diff);
        }
        this.prevRows = cursorPos.rows;
    };
    ;
    /**
     * Closes the `readline.Interface` instance.
     * @returns {void}
     */
    Interface.prototype.close = function () {
        if (this.closed)
            return;
        this.pause();
        if (this.terminal) {
            this._setRawMode(false);
        }
        this.closed = true;
        this.emit('close');
    };
    ;
    /**
     * Pauses the `input` stream.
     * @returns {void | Interface}
     */
    Interface.prototype.pause = function () {
        if (this.paused)
            return;
        this.input.pause();
        this.paused = true;
        this.emit('pause');
        return this;
    };
    ;
    /**
     * Resumes the `input` stream if paused.
     * @returns {void | Interface}
     */
    Interface.prototype.resume = function () {
        if (!this.paused)
            return;
        this.input.resume();
        this.paused = false;
        this.emit('resume');
        return this;
    };
    ;
    /**
     * Writes either `data` or a `key` sequence identified by
     * `key` to the `output`.
     * @param {string} d
     * @param {{
     *   ctrl?: boolean;
     *   meta?: boolean;
     *   shift?: boolean;
     *   name?: string;
     *   }} [key]
     * @returns {void}
     */
    Interface.prototype.write = function (d, key) {
        if (this.paused)
            this.resume();
        if (this.terminal) {
            this._ttyWrite(d, key);
        }
        else {
            this._normalWrite(d);
        }
    };
    ;
    Interface.prototype._normalWrite = function (b) {
        if (b === undefined) {
            return;
        }
        var string = this._decoder.write(b);
        if (this._sawReturnAt &&
            Date.now() - this._sawReturnAt <= this.crlfDelay) {
            string = string.replace(/^\n/, '');
            this._sawReturnAt = 0;
        }
        // Run test() on the new string chunk, not on the entire line buffer.
        var newPartContainsEnding = new RegExp(lineEnding).test(string);
        if (this._line_buffer) {
            string = this._line_buffer + string;
            this._line_buffer = null;
        }
        if (newPartContainsEnding) {
            this._sawReturnAt = string.endsWith('\r') ? Date.now() : 0;
            // Got one or more newlines; process into "line" events
            var lines = string.split(lineEnding);
            // Either '' or (conceivably) the unfinished portion of the next line
            string = lines.pop();
            this._line_buffer = string;
            for (var n = 0; n < lines.length; n++)
                this._onLine(lines[n]);
        }
        else if (string) {
            // No newlines this time, save what we have for next time
            this._line_buffer = string;
        }
    };
    ;
    Interface.prototype._insertString = function (c) {
        if (this.cursor < this.line.length) {
            var beg = this.line.slice(0, this.cursor);
            var end = this.line.slice(this.cursor, this.line.length);
            this.line = beg + c + end;
            this.cursor += c.length;
            this._refreshLine();
        }
        else {
            this.line += c;
            this.cursor += c.length;
            if (this.getCursorPos().cols === 0) {
                this._refreshLine();
            }
            else {
                this._writeToOutput(c);
            }
        }
    };
    ;
    Interface.prototype._tabComplete = function (lastKeypressWasTab) {
        var _this = this;
        this.pause();
        var string = this.line.slice(0, this.cursor);
        this.completer(string, function (err, value) {
            _this.resume();
            if (err) {
                _this._writeToOutput("Tab completion error: ".concat(err.stack));
                return;
            }
            // Result and the text that was completed.
            var completions = value[0], completeOn = value[1];
            if (!completions || completions.length === 0) {
                return;
            }
            // If there is a common prefix to all matches, then apply that portion.
            var prefix = (0, utils_1.commonPrefix)(completions.filter(function (e) { return e !== ''; }));
            if (prefix.length > completeOn.length) {
                _this._insertString(prefix.slice(completeOn.length));
                return;
            }
            if (!lastKeypressWasTab) {
                return;
            }
            // Apply/show completions.
            var completionsWidth = completions.map(function (e) { return (0, string_width_1["default"])(e); });
            var width = Math.max.apply(Math, completionsWidth) + 2; // 2 space padding
            var maxColumns = Math.floor(_this.columns / width) || 1;
            if (maxColumns === Infinity) {
                maxColumns = 1;
            }
            var output = '\r\n';
            var lineIndex = 0;
            var whitespace = 0;
            for (var i = 0; i < completions.length; i++) {
                var completion = completions[i];
                if (completion === '' || lineIndex === maxColumns) {
                    output += '\r\n';
                    lineIndex = 0;
                    whitespace = 0;
                }
                else {
                    output += ' '.repeat(whitespace);
                }
                if (completion !== '') {
                    output += completion;
                    whitespace = width - completionsWidth[i];
                    lineIndex++;
                }
                else {
                    output += '\r\n';
                }
            }
            if (lineIndex !== 0) {
                output += '\r\n\r\n';
            }
            _this._writeToOutput(output);
            _this._refreshLine();
        });
    };
    ;
    Interface.prototype._wordLeft = function () {
        if (this.cursor > 0) {
            // Reverse the string and match a word near beginning
            // to avoid quadratic time complexity
            var leading = this.line.slice(0, this.cursor);
            var reversed = Array.from(leading).reverse().join('');
            var match = reversed.match(/^\s*(?:[^\w\s]+|\w+)?/);
            this._moveCursor(-match[0].length);
        }
    };
    ;
    Interface.prototype._wordRight = function () {
        if (this.cursor < this.line.length) {
            var trailing = this.line.slice(this.cursor);
            var match = trailing.match(/^(?:\s+|[^\w\s]+|\w+)\s*/);
            this._moveCursor(match[0].length);
        }
    };
    ;
    Interface.prototype._deleteLeft = function () {
        if (this.cursor > 0 && this.line.length > 0) {
            // The number of UTF-16 units comprising the character to the left
            var charSize = (0, utils_1.charLengthLeft)(this.line, this.cursor);
            this.line = this.line.slice(0, this.cursor - charSize) +
                this.line.slice(this.cursor, this.line.length);
            this.cursor -= charSize;
            this._refreshLine();
        }
    };
    ;
    Interface.prototype._deleteRight = function () {
        if (this.cursor < this.line.length) {
            // The number of UTF-16 units comprising the character to the left
            var charSize = (0, utils_1.charLengthAt)(this.line, this.cursor);
            this.line = this.line.slice(0, this.cursor) +
                this.line.slice(this.cursor + charSize, this.line.length);
            this._refreshLine();
        }
    };
    ;
    Interface.prototype._deleteWordLeft = function () {
        if (this.cursor > 0) {
            // Reverse the string and match a word near beginning
            // to avoid quadratic time complexity
            var leading = this.line.slice(0, this.cursor);
            var reversed = Array.from(leading).reverse().join('');
            var match = reversed.match(/^\s*(?:[^\w\s]+|\w+)?/);
            leading = leading.slice(0, leading.length - match[0].length);
            this.line = leading + this.line.slice(this.cursor, this.line.length);
            this.cursor = leading.length;
            this._refreshLine();
        }
    };
    ;
    Interface.prototype._deleteWordRight = function () {
        if (this.cursor < this.line.length) {
            var trailing = this.line.slice(this.cursor);
            var match = trailing.match(/^(?:\s+|\W+|\w+)\s*/);
            this.line = this.line.slice(0, this.cursor) +
                trailing.slice(match[0].length);
            this._refreshLine();
        }
    };
    ;
    Interface.prototype._deleteLineLeft = function () {
        this.line = this.line.slice(this.cursor);
        this.cursor = 0;
        this._refreshLine();
    };
    ;
    Interface.prototype._deleteLineRight = function () {
        this.line = this.line.slice(0, this.cursor);
        this._refreshLine();
    };
    ;
    Interface.prototype.clearLine = function () {
        this._moveCursor(+Infinity);
        this._writeToOutput('\r\n');
        this.line = '';
        this.cursor = 0;
        this.prevRows = 0;
    };
    ;
    Interface.prototype._line = function () {
        var line = this._addHistory();
        this.clearLine();
        this._onLine(line);
    };
    ;
    // TODO(BridgeAR): Add underscores to the search part and a red background in
    // case no match is found. This should only be the visual part and not the
    // actual line content!
    // TODO(BridgeAR): In case the substring based search is active and the end is
    // reached, show a comment how to search the history as before. E.g., using
    // <ctrl> + N. Only show this after two/three UPs or DOWNs, not on the first
    // one.
    Interface.prototype._historyNext = function () {
        if (this.historyIndex >= 0) {
            var search = this[utils_1.kSubstringSearch] || '';
            var index = this.historyIndex - 1;
            while (index >= 0 &&
                (!this.history[index].startsWith(search) ||
                    this.line === this.history[index])) {
                index--;
            }
            if (index === -1) {
                this.line = search;
            }
            else {
                this.line = this.history[index];
            }
            this.historyIndex = index;
            this.cursor = this.line.length; // Set cursor to end of line.
            this._refreshLine();
        }
    };
    ;
    Interface.prototype._historyPrev = function () {
        if (this.historyIndex < this.history.length && this.history.length) {
            var search = this[utils_1.kSubstringSearch] || '';
            var index = this.historyIndex + 1;
            while (index < this.history.length &&
                (!this.history[index].startsWith(search) ||
                    this.line === this.history[index])) {
                index++;
            }
            if (index === this.history.length) {
                this.line = search;
            }
            else {
                this.line = this.history[index];
            }
            this.historyIndex = index;
            this.cursor = this.line.length; // Set cursor to end of line.
            this._refreshLine();
        }
    };
    ;
    Interface.prototype._getDisplayPos = function (str) {
        var offset = 0;
        var col = this.columns;
        var rows = 0;
        str = (0, utils_1.stripVTControlCharacters)(str);
        for (var _i = 0, str_1 = str; _i < str_1.length; _i++) {
            var char = str_1[_i];
            if (char === '\n') {
                // Rows must be incremented by 1 even if offset = 0 or col = +Infinity.
                rows += 1;
                offset = 0;
                continue;
            }
            // Tabs must be aligned by an offset of the tab size.
            if (char === '\t') {
                offset += this.tabSize - (offset % this.tabSize);
                continue;
            }
            var width = (0, string_width_1["default"])(char);
            if (width === 0 || width === 1) {
                offset += width;
            }
            else { // width === 2
                if ((offset + 1) % col === 0) {
                    offset++;
                }
                offset += 2;
            }
        }
        var cols = offset % col;
        rows += (offset - cols) / col;
        return { cols: cols, rows: rows };
    };
    ;
    /**
      * Returns the real position of the cursor in relation
      * to the input prompt + string.
      * @returns {{
      *   rows: number;
      *   cols: number;
      *   }}
      */
    Interface.prototype.getCursorPos = function () {
        var strBeforeCursor = this._prompt +
            this.line.slice(0, this.cursor);
        return this._getDisplayPos(strBeforeCursor);
    };
    ;
    Interface.prototype._getCursorPos = function () {
        return this.getCursorPos();
    };
    Interface.prototype._moveCursor = function (dx) {
        if (dx === 0) {
            return;
        }
        var oldPos = this.getCursorPos();
        this.cursor += dx;
        // Bounds check
        if (this.cursor < 0) {
            this.cursor = 0;
        }
        else if (this.cursor > this.line.length) {
            this.cursor = this.line.length;
        }
        var newPos = this.getCursorPos();
        // Check if cursor stayed on the line.
        if (oldPos.rows === newPos.rows) {
            var diffWidth = newPos.cols - oldPos.cols;
            (0, utils_1.moveCursor)(this.output, diffWidth, 0);
        }
        else {
            this._refreshLine();
        }
    };
    ;
    Interface.prototype._ttyWriteDumb = function (s, key) {
        key = key || {};
        if (key.name === 'escape')
            return;
        if (this._sawReturnAt && key.name !== 'enter')
            this._sawReturnAt = 0;
        if (key.ctrl) {
            if (key.name === 'c') {
                if (this.listenerCount('SIGINT') > 0) {
                    this.emit('SIGINT');
                }
                else {
                    // This readline instance is finished
                    this.close();
                }
                return;
            }
            else if (key.name === 'd') {
                this.close();
                return;
            }
        }
        switch (key.name) {
            case 'return': // Carriage return, i.e. \r
                this._sawReturnAt = Date.now();
                this._line();
                break;
            case 'enter':
                // When key interval > crlfDelay
                if (this._sawReturnAt === 0 ||
                    Date.now() - this._sawReturnAt > this.crlfDelay) {
                    this._line();
                }
                this._sawReturnAt = 0;
                break;
            default:
                if (typeof s === 'string' && s) {
                    this.line += s;
                    this.cursor += s.length;
                    this._writeToOutput(s);
                }
        }
    };
    Interface.prototype._ttyWrite = function (s, key) {
        var previousKey = this._previousKey;
        key = key || {};
        this._previousKey = key;
        // Activate or deactivate substring search.
        if ((key.name === 'up' || key.name === 'down') &&
            !key.ctrl && !key.meta && !key.shift) {
            if (this[utils_1.kSubstringSearch] === null) {
                this[utils_1.kSubstringSearch] = this.line.slice(0, this.cursor);
            }
        }
        else if (this[utils_1.kSubstringSearch] !== null) {
            this[utils_1.kSubstringSearch] = null;
            // Reset the index in case there's no match.
            if (this.history.length === this.historyIndex) {
                this.historyIndex = -1;
            }
        }
        // Ignore escape key, fixes
        // https://github.com/nodejs/node-v0.x-archive/issues/2876.
        if (key.name === 'escape')
            return;
        if (key.ctrl && key.shift) {
            /* Control and shift pressed */
            switch (key.name) {
                // TODO(BridgeAR): The transmitted escape sequence is `\b` and that is
                // identical to <ctrl>-h. It should have a unique escape sequence.
                case 'backspace':
                    this._deleteLineLeft();
                    break;
                case 'delete':
                    this._deleteLineRight();
                    break;
            }
        }
        else if (key.ctrl) {
            /* Control key pressed */
            switch (key.name) {
                case 'c':
                    if (this.listenerCount('SIGINT') > 0) {
                        this.emit('SIGINT');
                    }
                    else {
                        // This readline instance is finished
                        this.close();
                    }
                    break;
                case 'h': // delete left
                    this._deleteLeft();
                    break;
                case 'd': // delete right or EOF
                    if (this.cursor === 0 && this.line.length === 0) {
                        // This readline instance is finished
                        this.close();
                    }
                    else if (this.cursor < this.line.length) {
                        this._deleteRight();
                    }
                    break;
                case 'u': // Delete from current to start of line
                    this._deleteLineLeft();
                    break;
                case 'k': // Delete from current to end of line
                    this._deleteLineRight();
                    break;
                case 'a': // Go to the start of the line
                    this._moveCursor(-Infinity);
                    break;
                case 'e': // Go to the end of the line
                    this._moveCursor(+Infinity);
                    break;
                case 'b': // back one character
                    this._moveCursor(-(0, utils_1.charLengthLeft)(this.line, this.cursor));
                    break;
                case 'f': // Forward one character
                    this._moveCursor(+(0, utils_1.charLengthAt)(this.line, this.cursor));
                    break;
                case 'l': // Clear the whole screen
                    (0, utils_1.cursorTo)(this.output, 0, 0);
                    (0, utils_1.clearScreenDown)(this.output);
                    this._refreshLine();
                    break;
                case 'n': // next history item
                    this._historyNext();
                    break;
                case 'p': // Previous history item
                    this._historyPrev();
                    break;
                case 'z':
                    break;
                case 'w': // Delete backwards to a word boundary
                // TODO(BridgeAR): The transmitted escape sequence is `\b` and that is
                // identical to <ctrl>-h. It should have a unique escape sequence.
                // Falls through
                case 'backspace':
                    this._deleteWordLeft();
                    break;
                case 'delete': // Delete forward to a word boundary
                    this._deleteWordRight();
                    break;
                case 'left':
                    this._wordLeft();
                    break;
                case 'right':
                    this._wordRight();
                    break;
            }
        }
        else if (key.meta) {
            /* Meta key pressed */
            switch (key.name) {
                case 'b': // backward word
                    this._wordLeft();
                    break;
                case 'f': // forward word
                    this._wordRight();
                    break;
                case 'd': // delete forward word
                case 'delete':
                    this._deleteWordRight();
                    break;
                case 'backspace': // Delete backwards to a word boundary
                    this._deleteWordLeft();
                    break;
            }
        }
        else {
            /* No modifier keys used */
            // \r bookkeeping is only relevant if a \n comes right after.
            if (this._sawReturnAt && key.name !== 'enter')
                this._sawReturnAt = 0;
            switch (key.name) {
                case 'return': // Carriage return, i.e. \r
                    this._sawReturnAt = Date.now();
                    this._line();
                    break;
                case 'enter':
                    // When key interval > crlfDelay
                    if (this._sawReturnAt === 0 ||
                        Date.now() - this._sawReturnAt > this.crlfDelay) {
                        this._line();
                    }
                    this._sawReturnAt = 0;
                    break;
                case 'backspace':
                    this._deleteLeft();
                    break;
                case 'delete':
                    this._deleteRight();
                    break;
                case 'left':
                    // Obtain the code point to the left
                    this._moveCursor(-(0, utils_1.charLengthLeft)(this.line, this.cursor));
                    break;
                case 'right':
                    this._moveCursor(+(0, utils_1.charLengthAt)(this.line, this.cursor));
                    break;
                case 'home':
                    this._moveCursor(-Infinity);
                    break;
                case 'end':
                    this._moveCursor(+Infinity);
                    break;
                case 'up':
                    this._historyPrev();
                    break;
                case 'down':
                    this._historyNext();
                    break;
                case 'tab':
                    // If tab completion enabled, do that...
                    if (typeof this.completer === 'function' && this.isCompletionEnabled) {
                        var lastKeypressWasTab = previousKey && previousKey.name === 'tab';
                        this._tabComplete(lastKeypressWasTab);
                        break;
                    }
                // falls through
                default:
                    if (typeof s === 'string' && s) {
                        var lines = s.split(/\r\n|\n|\r/);
                        for (var i = 0, len = lines.length; i < len; i++) {
                            if (i > 0) {
                                this._line();
                            }
                            this._insertString(lines[i]);
                        }
                    }
            }
        }
    };
    ;
    return Interface;
}(eventemitter2_1.EventEmitter2));
exports.Interface = Interface;
_a = kQuestionCancel, _b = kLineObjectStream;
