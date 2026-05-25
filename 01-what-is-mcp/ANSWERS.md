# Module 01 - Review question answers

Try to answer from memory first. Use this file only if you are stuck after re-reading [README.md](./README.md).

---

## 1. What is the difference between a host, a client, and a server?

**Host** - The application the user runs (e.g. Claude Desktop, Cursor). It owns the conversation, decides which servers may connect, and controls permissions such as whether a tool call needs user confirmation. It creates and manages clients.

**Client** - Infrastructure inside the host. One client per server. It manages the connection, speaks the MCP protocol, and routes messages between the host and that server. The user never interacts with it directly.

**Server** - Your standalone program that exposes tools, resources, and prompts. It only sees messages from its client and responds to them. It does not know which host is connected, what other servers exist, or what the user said in the conversation.

---

## 2. What is the difference between a tool, a resource, and a prompt?

**Tool** - A function the model can call. It takes arguments, does something (often with side effects), and returns a result. Example: send an email, write a file, query a database.

**Resource** - Read-only data the model can fetch by URI. It provides context but does not change anything. Example: a file on disk, a database row, a live sensor reading.

**Prompt** - A reusable template the **user** picks in the host UI (slash menu or prompt picker). It takes arguments and returns structured messages that seed a conversation with the model.

| | Tool | Resource | Prompt |
|---|---|---|---|
| Purpose | Act on the world | Read context | Start a conversation from a template |
| Who initiates | Model (via host) | Host / model reads | **User** (via host UI) |
| Side effects | Yes | No | No |

---

## 3. When would you use a Prompt instead of a Tool?

Use a **prompt** when the **user** should choose and fill in a reusable template to start a conversation.

Use a **tool** when the **model** should decide at runtime to invoke an action and return a result.

Example: a `/review-pr` slash command where the user picks the command and supplies a PR number is a **prompt** - it seeds the conversation with a fixed structure. A `merge_pr` function the model calls on its own when the user says "merge it" is a **tool** - the model decides when to act, and the host may ask for confirmation first.

Rule of thumb: prompts are user-controlled workflows; tools are model-autonomous actions.

---

## 4. Why does the handshake happen before any tools are called?

Every MCP session starts with a mandatory handshake. The client and server must agree on the **protocol version** and **supported features** (capabilities) before any real work begins.

Each side publishes what it can do - tools, resources, prompts, and so on - so neither side sends requests the other cannot handle. Without this step, a client might call methods the server does not support, or use a protocol version the server does not understand.

You will implement this handshake (`initialize` / `initialized`) in module 04.

---

## 5. Why is MCP a better fit for AI tools than REST?

Compared to REST specifically: REST is **stateless**. MCP sessions are **stateful** - the server process stays alive between calls.

That matters for AI tool workflows where you need persistent state across multiple model-driven calls: keeping a browser open, maintaining a database connection, holding file handles, or streaming a long result back incrementally.

REST treats each request as independent. MCP is built for an ongoing conversation between a host and a server over a single persistent connection.

---

## 6. How many clients does a host create per server?

**One client per server - always.**

If a host connects to three servers, it creates three clients - one dedicated client for each server connection.
