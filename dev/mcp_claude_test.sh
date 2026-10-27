#!/bin/sh
# Connects a real Claude Code to the neuronary MCP server with a throwaway user's token and asks it to search.
# Needs SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
set -e
TMP=$(mktemp -d)
EMAIL="mcptest_$(date +%s)@example.com"; PW="pw_$(date +%s)_x9"
UID_=$(curl -s -X POST "$SUPABASE_URL/auth/v1/admin/users" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PW\",\"email_confirm\":true,\"user_metadata\":{\"user_name\":\"mcptest_$(date +%s)\"}}" \
  | sed -E 's/.*"id":"([^"]+)".*/\1/' | head -c 36)
JWT=$(curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PW\"}" | sed -E 's/.*"access_token":"([^"]+)".*/\1/')
TOK=$(curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/create_api_token" -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" -d '{"token_name":"claude test"}' | tr -d '"')
cleanup() {
  curl -s -X DELETE "$SUPABASE_URL/auth/v1/admin/users/$UID_" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" >/dev/null
  rm -rf "$TMP"; echo "cleaned up"
}
trap cleanup EXIT
cd "$TMP"
claude mcp add --scope local --transport http neuronary "$SUPABASE_URL/functions/v1/api/mcp" --header "Authorization: Bearer $TOK" >/dev/null
claude mcp list 2>&1 | grep -i neuronary
claude -p "Use the neuronary MCP tools: search for recipes using neuron L14N8949, then get that recipe and tell me its name, recipe string, author and the first example prompt. Then tell me who you are signed in as is unknown unless a tool says so. Reply in 3 short lines." \
  --allowedTools "mcp__neuronary__search_recipes" "mcp__neuronary__get_recipe" 2>&1 | tail -6
