# Using the tools from scripts and Claude (CLI + local MCP)

The ~1,700 non-interactive tools run as plain functions: `tool.run(inputs, opts, files)` in `src/tools/*.js`. The web pages, the CLI and the MCP server all call that same function, so there is one implementation of every tool. `cli/runner.mjs` is the only glue (input and option handling, file safety, output files); `cli/ft.mjs` and `cli/mcp.mjs` are thin adapters over it. Nothing is sent over the network.

## CLI

```
node cli/ft.mjs search jwt decode
node cli/ft.mjs info json-format
echo '{"b":1,"a":2}' | node cli/ft.mjs run json-format -o indent=4 -o sort=1
node cli/ft.mjs run gpt-token-counter --input-file prompt.txt
node cli/ft.mjs run zip-inspector -f archive.zip --json
```

`npm link` (or `npx --package . ft`) puts `ft` on your PATH. Generated files (images, zips, PDFs) are written to `$FT_OUT_DIR` or the temp folder, and the paths are printed. Claude Code can call this through Bash without any server.

## MCP server (stdio)

```
git clone https://github.com/sitefig/tools.git free-tools && cd free-tools && npm install
```

```json
{ "mcpServers": { "free-tools": { "command": "node", "args": ["/absolute/path/to/free-tools/cli/mcp.mjs"] } } }
```

Claude Code: `claude mcp add free-tools -- node /absolute/path/to/free-tools/cli/mcp.mjs`. It exposes four tools, not 800: `search_tools`, `list_categories`, `get_tool`, `run_tool`. The model searches, reads one tool's options, then runs it, so the server adds about 600 tokens of tool definitions instead of tens of thousands.

Safety defaults: file inputs must be inside the working directory plus `FT_ALLOWED_DIRS` (a path-delimited list); each run is a worker thread killed after `FT_TIMEOUT_MS` (60 s); text output is capped at `FT_MAX_TEXT` characters; interactive tools (games, recorders, editors) are not offered.

## Why scripts plus an MCP, rather than only an MCP

- **One core, two doors.** The logic already lives in pure functions, so the CLI is about 60 lines and the MCP server about 100. An MCP-only product would force every consumer (CI, shell pipelines, editors, other agents) through a protocol client.
- **Claude Code does not need a server for this.** It can run `ft run ...` through Bash, pipe results into other commands, and read the output files. A script is also easy to test, diff and run in CI: `test/cli.mjs` does exactly that.
- **An MCP still earns its place.** It makes the tools discoverable to clients with no shell (Claude Desktop, other MCP hosts), gives typed arguments and structured errors, and lets the host ask permission per call. Search-then-run keeps the context cost small.
- **Local, not hosted.** Inputs are often secrets (JWTs, keys, logs, PII). Running locally keeps the site's promise that input never leaves the machine, needs no accounts or keys, and works offline.
- **If you only want one:** ship the MCP, because it is the install people expect (`npx`-style, one config line), and keep the CLI because it costs nothing extra and the MCP calls it anyway. Do not maintain a second implementation of any tool.

## Limits

Interactive tools (`render`/`custom`: games, recorders, editors, visual builders) are browser-only. About 80 tools use browser APIs (canvas, DOM, media); they run when Node has what they need and otherwise return a clear "needs a browser" error. A few tools lazily read their model or vocabulary files from `data/`, so run the server from a full checkout.
