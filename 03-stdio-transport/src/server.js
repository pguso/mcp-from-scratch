// server.js - a process that reads JSON-RPC from stdin and writes responses to stdout
//
// This is the first real server in the course. It is not yet a full MCP server
// (that requires the lifecycle handshake from module 04), but it demonstrates
// the complete stdio transport stack:
//
//   stdin bytes
//     → framing.js (buffer → complete lines)
//     → jsonrpc.js (decode lines → message objects)
//     → dispatcher.js (route to handlers → produce response strings)
//     → stdout bytes
//
// Run it directly with: node src/server.js
// (You will need to type JSON lines manually and press Enter.)
//
// More usefully, run it via the client: node src/client.js

import { createFramer } from './framing.js';
import { Dispatcher } from '../../02-json-rpc/src/dispatcher.js';

// ─── Transport wiring ─────────────────────────────────────────────────────────

const dispatcher = new Dispatcher();

// Route dispatcher output to stdout.
//
// Why process.stdout.write and not console.log?
//
// console.log adds its own '\n'. Our encoded messages already end with '\n'
// (see encodeRequest/encodeResponse in jsonrpc.js). Using console.log would
// produce double newlines, which would confuse the framer on the other end.
//
// Also: when stdout is a pipe (as it is when spawned by client.js), Node.js
// may buffer writes. process.stdout.write bypasses that buffer.
dispatcher.onOutput = (line) => {
  process.stdout.write(line);
};

// Feed every complete line from stdin into the dispatcher.
createFramer(process.stdin, (line) => {
  dispatcher.dispatch(line);
});

// Exit cleanly when stdin closes. The client signals it is done by closing
// its end of the pipe (child.stdin.end()). Without this handler the process
// would linger as a zombie.
process.stdin.on('end', () => {
  process.exit(0);
});

// ─── Handler ──────────────────────────────────────────────────────────────────

dispatcher.register('ping', async () => ({ reply: 'pong' }));
