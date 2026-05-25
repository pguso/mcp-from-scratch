// framing.js - buffer a readable stream and emit one complete line per message
//
// The problem this solves:
//
//   Node.js streams fire 'data' events as bytes arrive. Those chunks have no
//   guaranteed relationship to your JSON messages. One 'data' event might carry
//   half a message; the next might carry two messages and a fragment of a third.
//
//   MCP's stdio transport uses newline-delimited JSON: every message is a single
//   JSON object followed by '\n'. The framer turns the raw byte stream into a
//   series of complete line strings, one per MCP message.
//
// Usage:
//
//   createFramer(process.stdin, (line) => {
//     const msg = decode(line);   // from jsonrpc.js
//     dispatcher.dispatch(msg);
//   });

/**
 * Attach a line framer to a Node.js Readable stream.
 *
 * Calls `onLine(line)` once for each complete `\n`-terminated line.
 * The trailing `\n` is stripped before calling `onLine`.
 * Blank lines (empty or whitespace-only) are silently skipped.
 *
 * @param {import('stream').Readable} readable - Any Node.js readable stream.
 * @param {(line: string) => void}    onLine   - Called with each complete line.
 */
export function createFramer(readable, onLine) {
  // The accumulator holds any bytes that arrived but do not yet form a complete
  // line. When a new chunk arrives we append it here and then look for '\n'.
  let buffer = '';

  // Streams deliver bytes as Buffer objects by default. Setting 'utf8' encoding
  // makes each 'data' event a string, which lets us use normal string methods.
  readable.setEncoding('utf8');

  readable.on('data', (chunk) => {
    buffer += chunk;

    // Split on newline. The result is always at least one element.
    // If the buffer is 'hello\nworld', split gives ['hello', 'world'].
    // If the buffer ends with '\n', the last element is '' (empty string).
    // If the buffer has no '\n' yet, the array has one element: the whole buffer.
    const lines = buffer.split('\n');

    // The last element is either:
    //   - An empty string: the previous chunk ended cleanly with '\n'.
    //   - A partial line: the chunk ended mid-message.
    // Either way, we put it back in the buffer and do not process it yet.
    buffer = lines.pop();

    for (const line of lines) {
      // Skip blank lines. These can appear between messages in some editors or
      // when a sender adds extra newlines for readability during debugging.
      if (line.trim() === '') continue;

      onLine(line);
    }
  });

  // When stdin closes (the sending process ended or closed its pipe end),
  // process any remaining content in the buffer. A well-formed MCP stream
  // should not have a partial message at EOF, but we handle it defensively
  // by emitting whatever is left if it looks non-empty.
  readable.on('end', () => {
    const remaining = buffer.trim();
    if (remaining !== '') {
      onLine(remaining);
    }
    buffer = '';
  });
}
