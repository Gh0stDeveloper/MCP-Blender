# ChatGPT and OpenAI integration

Nexora Forge MCP exposes a remote MCP URL at:

https://YOUR-PUBLIC-HOST/mcp

ChatGPT custom MCP apps connect to remote MCP servers rather than directly to localhost. Publish only the gateway; never publish the Blender bridge.

Availability of write and modify MCP actions depends on the ChatGPT plan and current product rollout. Check the current OpenAI documentation before deployment:

https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt

OpenAI API remote MCP integrations can pass authentication headers. Use the public HTTPS MCP URL with an Authorization Bearer header.

For multi-user deployments, prefer standards-based OAuth instead of distributing one shared static token.

Suggested policy: read tools without approval, confirmations for destructive mutations, and keep blender_execute_python disabled unless explicitly needed.
