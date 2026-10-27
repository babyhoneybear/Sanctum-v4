# Sanctum's private ChatGPT connector

This Sites Worker exposes the same twelve database, page and visual tools as the local stdio client,
using Sites-managed ChatGPT authentication. There is no model API client or key.

The signed-in connector tab runs on the computer with Sanctum. It forwards each
authenticated command to the loopback-only relay using the current local session
code. The code travels in a URL fragment, is immediately removed from the address
bar, is kept in that connected tab's session storage to survive a refresh, and is
never sent to the hosted Worker. Opening it from Sanctum connects automatically;
a plain visit without a valid current code does not. Only the exact hosted
origin can call the local Site routes, and the session code rotates on disconnect.
Disconnect clears the helper's saved session. Sanctum's own tab suspends access
when closing or reloading, and only possession of its still-current code can
resume that local session. The helper waits briefly for a vault refresh to finish.

D1 keeps owner-scoped connection heartbeats and a temporary command queue. Results
are deleted after delivery, and expired records are cleaned on subsequent requests.
This is a transport, not a cloud copy of the vault. Do not log request payloads.
Page screenshots return native MCP image content alongside metadata, rather than
base64 inside text. Images use the same owner-scoped queue and delivery cleanup.

Source `worker/tools.cjs` is the shared contract used by the local MCP script too.
Run `npm.cmd run db:generate` for future schema changes, inspect new migrations,
then `npm.cmd run build` and `npm.cmd run validate`. Publish through the Sites
workflow. Never change this private Site's audience to make authentication work.

See `../README_CHATGPT_PLUGIN.md` for the user setup and database limitations.
