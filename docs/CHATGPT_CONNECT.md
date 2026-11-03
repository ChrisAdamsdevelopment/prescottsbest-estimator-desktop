# Connecting Andrew's ChatGPT to the local estimator

The estimator includes a stdio MCP server at `node scripts/mcp-launch.mjs`. A GitHub download by itself does **not** automatically connect the local application to ChatGPT.

## Option A — Desktop Commander (most practical first)
Andrew connects his own Windows computer to his own ChatGPT account using an authorized Desktop Commander installation/connector. He grants the connector access only to the estimator directory and permits specific terminal/file actions. With the local AI server running, ChatGPT can read explicitly shared bridge snapshots via:
`node server/bridge-cli.mjs status`
`node server/bridge-cli.mjs list`
`node server/bridge-cli.mjs get JOB_ID`

In the app, open the ChatGPT bridge and deliberately **Share local job snapshots**. Private photos, keys and Gmail sessions never mirror by default. MCP write actions for creating *unpriced drafts* are separately gated with `PBC_MCP_ENABLE_WRITES=1`; approving quotes, emailing customers and publishing changes must remain human-reviewed.

## Option B — private Secure MCP Tunnel
The bundled MCP server is stdio-only. ChatGPT Plugins can connect it through a configured **Secure MCP Tunnel**, where available for Andrew's workspace. Do not expose the raw local AI server or bind it to a public IP.

Official connection guide: https://developers.openai.com/api/docs/guides/secure-mcp-tunnels

ChatGPT Plugins → + → Add custom MCP server → Tunnel → choose authorized tunnel. Test read-only tools before enabling any writes. If building a shared remotely hosted MCP server instead, implement OAuth 2.1 and verified individual user roles; never distribute a shared portal master credential.

## Distinct accounts
- Andrew connects **his** ChatGPT user and **his** PC. His ChatGPT account will not inherit another user's chat memory.
- Andrew authorizes **his** Gmail/Drive scopes if needed.
- No automatic cloud sync, joint admin login or customer-data migration exists yet.
