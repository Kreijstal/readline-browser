import { width as getStringWidth } from "visualwidth";
//import getStringWidth from "string-width";
import { StringDecoder } from "string_decoder";
import { EventEmitter2 } from "eventemitter2";

import {
  charLengthAt,
  charLengthLeft,
  commonPrefix,
  kSubstringSearch,
  stripVTControlCharacters,
  clearLine,
  clearScreenDown,
  cursorTo,
  moveCursor
}  from './utils.js';

const kHistorySize = 30;
const kMincrlfDelay = 100;
// \r\n, \n, or \r followed by something other than \n
const lineEnding = /\r?\n|\r(?!\n)/;

const kLineObjectStream = Symbol('line object stream');
const kQuestionCancel = Symbol('kQuestionCancel');

// GNU readline library - keyseq-timeout is 500ms (default)
const ESCAPE_CODE_TIMEOUT = 500;

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

function emitKeypressEvents(stream,aninterface?){
	console.log("emitKeypressEvents",stream,aninterface);	
}
function createInterface(input, output?, completer?, terminal?) {
  return new Interface(input, output, completer, terminal);
}


class Interface extends EventEmitter2 {
  private _sawReturnAt = 0;

  // TODO(BridgeAR): Document this property. The name is not ideal, so we might
  // want to expose an alias and document that instead.
  private isCompletionEnabled = true;
  private _sawKeyPress = false;
  private _previousKey?: any;
  private escapeCodeTimeout = ESCAPE_CODE_TIMEOUT;
  private tabSize = 8;
  private closed = false;
  private paused = false;
  private terminal: boolean = false;

  private history: string[] = [];
  private historySize: number = kHistorySize;
  private removeHistoryDuplicates = false;
  private crlfDelay: number = kMincrlfDelay;
  private _oldPrompt = '';
  private _prompt = '> ';
  private signal: any;
  private _decoder?: StringDecoder;
  private _questionCallback: any;

  private prevRows?: number;
  private cursor = 0;
  private historyIndex = 0;

  private line = '';
  private _line_buffer: string | null = '';

  private [kQuestionCancel] = this._questionCancel.bind(this);
  private [kLineObjectStream] = undefined

  constructor(private input, private output, private completer, terminal) {
    super();
    let history;
    let historySize;
    let removeHistoryDuplicates = false;
    let crlfDelay;
    let prompt = '> ';
    let signal;
    if (input && input.input) {
      // An options object was given
      output = input.output;
      completer = input.completer;
      terminal = input.terminal;
      history = input.history;
      historySize = input.historySize;
      signal = input.signal;
      if (input.tabSize !== undefined) {
        this.tabSize = input.tabSize;
      }
      removeHistoryDuplicates = input.removeHistoryDuplicates;
      if (input.prompt !== undefined) {
        prompt = input.prompt;
      }
      if (input.escapeCodeTimeout !== undefined) {
        if (Number.isFinite(input.escapeCodeTimeout)) {
          this.escapeCodeTimeout = input.escapeCodeTimeout;
        } else {
          throw new Error(
            'input.escapeCodeTimeout'
          );
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
    } else {

    }
  
    if (historySize === undefined) {
      historySize = kHistorySize;
    }
  
    // Backwards compat; check the isTTY prop of the output stream
    //  when `terminal` was not specified
    if (terminal === undefined && !(output === null || output === undefined)) {
      terminal = !!output.isTTY;
    }
  
    this.line = '';
    this[kSubstringSearch] = null;
    this.output = output;
    this.input = input;
    this.history = history;
    this.historySize = historySize;
    this.removeHistoryDuplicates = !!removeHistoryDuplicates;

    this.crlfDelay = crlfDelay ?
      Math.max(kMincrlfDelay, crlfDelay) : kMincrlfDelay;
    // Check arity, 2 - for async, 1 for sync
    if (typeof completer === 'function') {
      this.completer = completer.length === 2 ?
        completer :
        function completerWrapper(v, cb) {
          cb(null, completer(v));
        };
    }
  
    this[kQuestionCancel] = this._questionCancel.bind(this);
  
    this.setPrompt(prompt);
  
    this.terminal = !!terminal;
    this.input.on('error', this.onerror.bind(this));



    if (!this.terminal) {
      const onSelfCloseWithoutTerminal = () => {
        input.removeListener('data', this.ondata.bind(this));
        input.removeListener('error', this.onerror.bind(this));
        input.removeListener('end', this.onend.bind(this));
      }

      input.on('data', this.ondata.bind(this));
      input.on('end', this.onend.bind(this));
      this.once('close', onSelfCloseWithoutTerminal);
      this._decoder = new StringDecoder('utf8');
    } else {
      const onSelfCloseWithTerminal = () => {
        input.removeListener('keypress', this.onkeypress.bind(this));
        input.removeListener('error', this.onerror.bind(this));
        input.removeListener('end', this.ontermend.bind(this));
        if (output !== null && output !== undefined) {
          output.removeListener('resize', this.onresize.bind(this));
        }
      }


      // `input` usually refers to stdin
      input.on('keypress', this.onkeypress.bind(this));
      input.on('end', this.ontermend.bind(this));

      this._setRawMode(true);
      this.terminal = true;

      // Cursor position on the line.
      this.cursor = 0;

      this.historyIndex = -1;

      if (output !== null && output !== undefined)
        output.on('resize', this.onresize.bind(this));

      this.once('close', onSelfCloseWithTerminal);
    }


    // Current line
    this.line = '';

    input.resume();

  }
  get columns() {
    return this.output.columns;
  }
  private onerror(err) {
    this.emit('error', err);
  }
  private ondata(data) {
    this._normalWrite(data);
  }

  private onend() {
    if (typeof this._line_buffer === 'string' &&
      this._line_buffer.length > 0) {
      this.emit('line', this._line_buffer);
    }
    this.close();
  }

  private ontermend() {
    if (typeof this.line === 'string' && this.line.length > 0) {
      this.emit('line', this.line);
    }
    this.close();
  }

  private onkeypress(s, key) {
    this._ttyWrite(s, key);
    if (key && key.sequence) {
      // If the key.sequence is half of a surrogate pair
      // (>= 0xd800 and <= 0xdfff), refresh the line so
      // the character is displayed appropriately.
      const ch = key.sequence.codePointAt(0);
      if (ch >= 0xd800 && ch <= 0xdfff)
        this._refreshLine();
    }
  }

  private onresize() {
    this._refreshLine();
  }

  /**
   * Sets the prompt written to the output.
   * @param {string} prompt
   * @returns {void}
   */
  setPrompt(prompt) {
    this._prompt = prompt;
  };

  /**
   * Returns the current prompt used by `rl.prompt()`.
   * @returns {string}
   */
  getPrompt() {
    return this._prompt;
  };

  private _setRawMode(mode) {
    const wasInRawMode = this.input.isRaw;

    if (typeof this.input.setRawMode === 'function') {
      this.input.setRawMode(mode);
    }

    return wasInRawMode;
  };


  /**
   * Writes the configured `prompt` to a new line in `output`.
   * @param {boolean} [preserveCursor]
   * @returns {void}
   */
  prompt(preserveCursor?) {
    if (this.paused) this.resume();
    if (this.terminal) {
      if (!preserveCursor) this.cursor = 0;
      this._refreshLine();
    } else {
      this._writeToOutput(this._prompt);
    }
  };


  /**
   * Displays `query` by writing it to the `output`.
   * @param {string} query
   * @param {{ signal?: AbortSignal; }} [options]
   * @param {Function} cb
   * @returns {void}
   */
  question(query, options, cb) {
    cb = typeof options === 'function' ? options : cb;
    options = typeof options === 'object' && options !== null ? options : {};

    if (options.signal) {
      if (options.signal.aborted) {
        return;
      }

      options.signal.addEventListener('abort', () => {
        this[kQuestionCancel]();
      }, { once: true });
    }

    if (typeof cb === 'function') {
      if (this._questionCallback) {
        this.prompt();
      } else {
        this._oldPrompt = this._prompt;
        this.setPrompt(query);
        this._questionCallback = cb;
        this.prompt();
      }
    }
  };
  private _questionCancel() {
    if (this._questionCallback) {
      this._questionCallback = null;
      this.setPrompt(this._oldPrompt);
      this.clearLine();
    }
  }

  private _onLine(line) {
    if (this._questionCallback) {
      const cb = this._questionCallback;
      this._questionCallback = null;
      this.setPrompt(this._oldPrompt);
      cb(line);
    } else {
      this.emit('line', line);
    }
  };

  private _writeToOutput(stringToWrite) {

    if (this.output !== null && this.output !== undefined) {
      this.output.write(stringToWrite);
    }
  };

  private _addHistory() {
    if (this.line.length === 0) return '';

    // If the history is disabled then return the line
    if (this.historySize === 0) return this.line;

    // If the trimmed line is empty then return the line
    if (this.line.trim().length === 0) return this.line;

    if (this.history.length === 0 || this.history[0] !== this.line) {
      if (this.removeHistoryDuplicates) {
        // Remove older history line if identical to new one
        const dupIndex = this.history.indexOf(this.line);
        if (dupIndex !== -1) this.history.splice(dupIndex, 1);
      }

      this.history.unshift(this.line);

      // Only store so many
      if (this.history.length > this.historySize) this.history.pop();
    }

    this.historyIndex = -1;

    // The listener could change the history object, possibly
    // to remove the last added entry if it is sensitive and should
    // not be persisted in the history, like a password
    const line = this.history[0];

    // Emit history event to notify listeners of update
    this.emit('history', this.history);

    return line;
  };

  private _refreshLine() {
    // line length
    const line = this._prompt + this.line;
    const dispPos = this._getDisplayPos(line);
    const lineCols = dispPos.cols;
    const lineRows = dispPos.rows;

    // cursor position
    const cursorPos = this.getCursorPos();

    // First move to the bottom of the current line, based on cursor pos
    const prevRows = this.prevRows || 0;
    if (prevRows > 0) {
      moveCursor(this.output, 0, -prevRows);
    }

    // Cursor to left edge.
    cursorTo(this.output, 0);
    // erase data
    clearScreenDown(this.output);

    // Write the prompt and the current buffer content.
    this._writeToOutput(line);

    // Force terminal to allocate a new line
    if (lineCols === 0) {
      this._writeToOutput(' ');
    }

    // Move cursor to original position.
    cursorTo(this.output, cursorPos.cols);

    const diff = lineRows - cursorPos.rows;
    if (diff > 0) {
      moveCursor(this.output, 0, -diff);
    }

    this.prevRows = cursorPos.rows;
  };


  /**
   * Closes the `readline.Interface` instance.
   * @returns {void}
   */
  close() {
    if (this.closed) return;
    this.pause();
    if (this.terminal) {
      this._setRawMode(false);
    }
    this.closed = true;
    this.emit('close');
  };


  /**
   * Pauses the `input` stream.
   * @returns {void | Interface}
   */
  pause() {
    if (this.paused) return;
    this.input.pause();
    this.paused = true;
    this.emit('pause');
    return this;
  };


  /**
   * Resumes the `input` stream if paused.
   * @returns {void | Interface}
   */
  resume() {
    if (!this.paused) return;
    this.input.resume();
    this.paused = false;
    this.emit('resume');
    return this;
  };


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
  write(d?, key?) {
    if (this.paused) this.resume();
    if (this.terminal) {
      this._ttyWrite(d, key);
    } else {
      this._normalWrite(d);
    }
  };

  private _normalWrite(b) {
    if (b === undefined) {
      return;
    }
    let string = this._decoder!.write(b);
    if (this._sawReturnAt &&
      Date.now() - this._sawReturnAt <= this.crlfDelay) {
      string = string.replace(/^\n/, '');
      this._sawReturnAt = 0;
    }

    // Run test() on the new string chunk, not on the entire line buffer.
    const newPartContainsEnding = new RegExp(lineEnding).test(string);

    if (this._line_buffer) {
      string = this._line_buffer + string;
      this._line_buffer = null;
    }
    if (newPartContainsEnding) {
      this._sawReturnAt = string.endsWith('\r') ? Date.now() : 0;

      // Got one or more newlines; process into "line" events
      const lines = string.split(lineEnding);
      // Either '' or (conceivably) the unfinished portion of the next line
      string = lines.pop()!;
      this._line_buffer = string;
      for (let n = 0; n < lines.length; n++)
        this._onLine(lines[n]);
    } else if (string) {
      // No newlines this time, save what we have for next time
      this._line_buffer = string;
    }
  };
  private _insertString(c) {
    if (this.cursor < this.line.length) {
      const beg = this.line.slice(0, this.cursor);
      const end = this.line.slice(this.cursor, this.line.length);
      this.line = beg + c + end;
      this.cursor += c.length;
      this._refreshLine();
    } else {
      this.line += c;
      this.cursor += c.length;

      if (this.getCursorPos().cols === 0) {
        this._refreshLine();
      } else {
        this._writeToOutput(c);
      }
    }
  };


  private _tabComplete(lastKeypressWasTab) {
    this.pause();
    const string = this.line.slice(0, this.cursor);
    this.completer(string, (err, value) => {
      this.resume();

      if (err) {
        this._writeToOutput(`Tab completion error: ${err.stack}`);
        return;
      }

      // Result and the text that was completed.
      const { 0: completions, 1: completeOn } = value;

      if (!completions || completions.length === 0) {
        return;
      }

      // If there is a common prefix to all matches, then apply that portion.
      const prefix = commonPrefix(completions.filter((e) => e !== ''));
      if (prefix.length > completeOn.length) {
        this._insertString(prefix.slice(completeOn.length));
        return;
      }

      if (!lastKeypressWasTab) {
        return;
      }

      // Apply/show completions.
      const completionsWidth = completions.map((e) => getStringWidth(e));
      const width = Math.max(...completionsWidth) + 2; // 2 space padding
      let maxColumns = Math.floor(this.columns / width) || 1;
      if (maxColumns === Infinity) {
        maxColumns = 1;
      }
      let output = '\r\n';
      let lineIndex = 0;
      let whitespace = 0;
      for (let i = 0; i < completions.length; i++) {
        const completion = completions[i];
        if (completion === '' || lineIndex === maxColumns) {
          output += '\r\n';
          lineIndex = 0;
          whitespace = 0;
        } else {
          output += ' '.repeat(whitespace);
        }
        if (completion !== '') {
          output += completion;
          whitespace = width - completionsWidth[i];
          lineIndex++;
        } else {
          output += '\r\n';
        }
      }
      if (lineIndex !== 0) {
        output += '\r\n\r\n';
      }
      this._writeToOutput(output);
      this._refreshLine();
    });
  };


  private _wordLeft() {
    if (this.cursor > 0) {
      // Reverse the string and match a word near beginning
      // to avoid quadratic time complexity
      const leading = this.line.slice(0, this.cursor);
      const reversed = Array.from(leading).reverse().join('');
      const match = reversed.match(/^\s*(?:[^\w\s]+|\w+)?/)!;
      this._moveCursor(-match[0].length);
    }
  };


  private _wordRight() {
    if (this.cursor < this.line.length) {
      const trailing = this.line.slice(this.cursor);
      const match = trailing.match(/^(?:\s+|[^\w\s]+|\w+)\s*/)!;
      this._moveCursor(match[0].length);
    }
  };

  private _deleteLeft() {
    if (this.cursor > 0 && this.line.length > 0) {
      // The number of UTF-16 units comprising the character to the left
      const charSize = charLengthLeft(this.line, this.cursor);
      this.line = this.line.slice(0, this.cursor - charSize) +
        this.line.slice(this.cursor, this.line.length);

      this.cursor -= charSize;
      this._refreshLine();
    }
  };

  private _deleteRight() {
    if (this.cursor < this.line.length) {
      // The number of UTF-16 units comprising the character to the left
      const charSize = charLengthAt(this.line, this.cursor);
      this.line = this.line.slice(0, this.cursor) +
        this.line.slice(this.cursor + charSize, this.line.length);
      this._refreshLine();
    }
  };

  private _deleteWordLeft() {
    if (this.cursor > 0) {
      // Reverse the string and match a word near beginning
      // to avoid quadratic time complexity
      let leading = this.line.slice(0, this.cursor);
      const reversed = Array.from(leading).reverse().join('');
      const match = reversed.match(/^\s*(?:[^\w\s]+|\w+)?/)!;
      leading = leading.slice(0,
        leading.length - match[0].length);
      this.line = leading + this.line.slice(this.cursor,
        this.line.length);
      this.cursor = leading.length;
      this._refreshLine();
    }
  };

  private _deleteWordRight() {
    if (this.cursor < this.line.length) {
      const trailing = this.line.slice(this.cursor);
      const match = trailing.match(/^(?:\s+|\W+|\w+)\s*/)!;
      this.line = this.line.slice(0, this.cursor) +
        trailing.slice(match[0].length);
      this._refreshLine();
    }
  };

  private _deleteLineLeft() {
    this.line = this.line.slice(this.cursor);
    this.cursor = 0;
    this._refreshLine();
  };

  private _deleteLineRight() {
    this.line = this.line.slice(0, this.cursor);
    this._refreshLine();
  };

  clearLine() {
    this._moveCursor(+Infinity);
    this._writeToOutput('\r\n');
    this.line = '';
    this.cursor = 0;
    this.prevRows = 0;
  };

  private _line() {
    const line = this._addHistory();
    this.clearLine();
    this._onLine(line);
  };



  // TODO(BridgeAR): Add underscores to the search part and a red background in
  // case no match is found. This should only be the visual part and not the
  // actual line content!
  // TODO(BridgeAR): In case the substring based search is active and the end is
  // reached, show a comment how to search the history as before. E.g., using
  // <ctrl> + N. Only show this after two/three UPs or DOWNs, not on the first
  // one.
  private _historyNext() {
    if (this.historyIndex >= 0) {
      const search = this[kSubstringSearch] || '';
      let index = this.historyIndex - 1;
      while (index >= 0 &&
        (!this.history[index].startsWith(search) ||
          this.line === this.history[index])) {
        index--;
      }
      if (index === -1) {
        this.line = search;
      } else {
        this.line = this.history[index];
      }
      this.historyIndex = index;
      this.cursor = this.line.length; // Set cursor to end of line.
      this._refreshLine();
    }
  };


  private _historyPrev() {
    if (this.historyIndex < this.history.length && this.history.length) {
      const search = this[kSubstringSearch] || '';
      let index = this.historyIndex + 1;
      while (index < this.history.length &&
        (!this.history[index].startsWith(search) ||
          this.line === this.history[index])) {
        index++;
      }
      if (index === this.history.length) {
        this.line = search;
      } else {
        this.line = this.history[index];
      }
      this.historyIndex = index;
      this.cursor = this.line.length; // Set cursor to end of line.
      this._refreshLine();
    }
  };

  private _getDisplayPos(str) {
    let offset = 0;
    const col = this.columns;
    let rows = 0;
    str = stripVTControlCharacters(str);
    for (const char of str) {
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
      const width = getStringWidth(char);
      if (width === 0 || width === 1) {
        offset += width;
      } else { // width === 2
        if ((offset + 1) % col === 0) {
          offset++;
        }
        offset += 2;
      }
    }
    const cols = offset % col;
    rows += (offset - cols) / col;
    return { cols, rows };
  };

  /**
    * Returns the real position of the cursor in relation
    * to the input prompt + string.
    * @returns {{
    *   rows: number;
    *   cols: number;
    *   }}
    */
  getCursorPos() {
    const strBeforeCursor = this._prompt +
      this.line.slice(0, this.cursor);
    return this._getDisplayPos(strBeforeCursor);
  };

  private _getCursorPos() {
    return this.getCursorPos();
  }


  private _moveCursor(dx) {
    if (dx === 0) {
      return;
    }
    const oldPos = this.getCursorPos();
    this.cursor += dx;

    // Bounds check
    if (this.cursor < 0) {
      this.cursor = 0;
    } else if (this.cursor > this.line.length) {
      this.cursor = this.line.length;
    }

    const newPos = this.getCursorPos();

    // Check if cursor stayed on the line.
    if (oldPos.rows === newPos.rows) {
      const diffWidth = newPos.cols - oldPos.cols;
      moveCursor(this.output, diffWidth, 0);
    } else {
      this._refreshLine();
    }
  };

  private _ttyWriteDumb(s, key) {
    key = key || {};

    if (key.name === 'escape') return;

    if (this._sawReturnAt && key.name !== 'enter')
      this._sawReturnAt = 0;

    if (key.ctrl) {
      if (key.name === 'c') {
        if (this.listenerCount('SIGINT') > 0) {
          this.emit('SIGINT');
        } else {
          // This readline instance is finished
          this.close();
        }

        return;
      } else if (key.name === 'd') {
        this.close();
        return;
      }
    }

    switch (key.name) {
      case 'return':  // Carriage return, i.e. \r
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
  }

  private _ttyWrite(s, key) {
    const previousKey = this._previousKey;
    key = key || {};
    this._previousKey = key;

    // Activate or deactivate substring search.
    if ((key.name === 'up' || key.name === 'down') &&
      !key.ctrl && !key.meta && !key.shift) {
      if (this[kSubstringSearch] === null) {
        this[kSubstringSearch] = this.line.slice(0, this.cursor);
      }
    } else if (this[kSubstringSearch] !== null) {
      this[kSubstringSearch] = null;
      // Reset the index in case there's no match.
      if (this.history.length === this.historyIndex) {
        this.historyIndex = -1;
      }
    }

    // Ignore escape key, fixes
    // https://github.com/nodejs/node-v0.x-archive/issues/2876.
    if (key.name === 'escape') return;

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

    } else if (key.ctrl) {
      /* Control key pressed */

      switch (key.name) {
        case 'c':
          if (this.listenerCount('SIGINT') > 0) {
            this.emit('SIGINT');
          } else {
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
          } else if (this.cursor < this.line.length) {
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
          this._moveCursor(-charLengthLeft(this.line, this.cursor));
          break;

        case 'f': // Forward one character
          this._moveCursor(+charLengthAt(this.line, this.cursor));
          break;

        case 'l': // Clear the whole screen
          cursorTo(this.output, 0, 0);
          clearScreenDown(this.output);
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

    } else if (key.meta) {
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

    } else {
      /* No modifier keys used */

      // \r bookkeeping is only relevant if a \n comes right after.
      if (this._sawReturnAt && key.name !== 'enter')
        this._sawReturnAt = 0;

      switch (key.name) {
        case 'return':  // Carriage return, i.e. \r
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
          this._moveCursor(-charLengthLeft(this.line, this.cursor));
          break;

        case 'right':
          this._moveCursor(+charLengthAt(this.line, this.cursor));
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
            const lastKeypressWasTab = previousKey && previousKey.name === 'tab';
            this._tabComplete(lastKeypressWasTab);
            break;
          }
        // falls through
        default:
          if (typeof s === 'string' && s) {
            const lines = s.split(/\r\n|\n|\r/);
            for (let i = 0, len = lines.length; i < len; i++) {
              if (i > 0) {
                this._line();
              }
              this._insertString(lines[i]);
            }
          }
      }
    }
  };

}

export {
  Interface,
  clearLine,
  createInterface,
  clearScreenDown,
  cursorTo,
  moveCursor,
  emitKeypressEvents
};
