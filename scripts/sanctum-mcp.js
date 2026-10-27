#!/usr/bin/env node
// Run via a private stdio MCP connection (including Secure MCP Tunnel).
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
  const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
  const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
  const { tools, methods, annotations, formatResult } = require('../chatgpt-tools');
  const server = new Server({ name: 'sanctum', version: '0.1.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: tools.map((tool, i) => ({ ...tool, annotations: annotations(i) })) }));
  server.setRequestHandler(CallToolRequestSchema, async request => {
    try {
      const index = tools.findIndex(tool => tool.name === request.params.name);
      if (index < 0) throw new Error('Unknown Sanctum tool.');
      const connectionPath = process.env.SANCTUM_MCP_CONNECTION_FILE || path.join(__dirname, '..', '.local-tools', 'chatgpt', `connection-${process.env.SANCTUM_PORT || 3005}.json`);
      const connection = JSON.parse(fs.readFileSync(connectionPath, 'utf8'));
      const url = new URL(connection.url);
      if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') throw new Error('The vault relay must use local loopback.');
      const response = await fetch(new URL('/api/chatgpt/rpc', url), {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${connection.secret}` },
        body: JSON.stringify({ method: methods[index], args: request.params.arguments || {} }),
        signal: AbortSignal.timeout(50000)
      });
      const result = await response.json();
      return { content: formatResult(result, methods[index]), isError: !response.ok || !!result.error };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: error.code === 'ENOENT'
        ? 'Start Sanctum and enable ChatGPT in Settings → Data first.' : error.message }] };
    }
  });
  await server.connect(new StdioServerTransport());
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
