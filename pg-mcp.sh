#!/usr/bin/env bash
# pg-mcp.sh - Minimal MCP stdio server for PostgreSQL via psql
# Requires: bash, psql, jq

DB_URL="${DATABASE_URL:?DATABASE_URL not set}"

send_response() {
  local id="$1" result="$2"
  printf '%s\n' "$(jq -nc --argjson result "$result" '{jsonrpc:"2.0",id:'$id',result:$result}')"
}

send_error() {
  local id="$1" code="$2" message="$3"
  printf '%s\n' "$(jq -nc --arg message "$message" '{jsonrpc:"2.0",id:'$id',error:{code:'$code',message:$message}}')"
}

while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  method=$(echo "$line" | jq -r .method)
  id=$(echo "$line" | jq -r .id)
  case "$method" in
    initialize)
      send_response "$id" '{"protocolVersion":"2024-11-05","capabilities":{"tools":{}},"serverInfo":{"name":"pg-mcp","version":"1.0.0"}}'
      ;;
    "tools/list")
      send_response "$id" '{"tools":[{"name":"query","description":"Run a SQL query","inputSchema":{"type":"object","properties":{"sql":{"type":"string"}},"required":["sql"]}}]}'
      ;;
    "tools/call")
      sql=$(echo "$line" | jq -r '.params.arguments.sql')
      if [[ -z "$sql" ]]; then
        send_error "$id" -32602 "Missing sql argument"
        continue
      fi
      result=$(psql "$DB_URL" -c "$sql" -tA --no-align 2>&1)
      if [[ $? -eq 0 ]]; then
        # format as JSON text content
        text=$(echo "$result" | jq -Rs .)
        send_response "$id" '{"content":[{"type":"text","text":'$text'}]}'
      else
        send_error "$id" -32000 "$result"
      fi
      ;;
    notifications/initialized)
      # no-op
      ;;
  esac
done
