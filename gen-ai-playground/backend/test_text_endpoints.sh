#!/usr/bin/env bash
#
# test_text_endpoints.sh
#
# Interactive script to test all /text/* endpoints step by step.
# Assumes the backend is running at localhost:8000 (via docker-compose).
#
# Usage:  bash test_text_endpoints.sh
#

set -e

BASE_URL="http://localhost:8000"
USERNAME="testuser_$$"          # unique per run
PASSWORD="TestPass123!"
INVITATION_CODE="local-invitation-code"   # from docker-compose.yml

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}  Verda Text Endpoint Test Script${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""

# ── helper ──────────────────────────────────────────────
ask_continue() {
    echo ""
    read -rp "Press Enter to continue (or Ctrl+C to stop)... "
    echo ""
}

# ── 1. Register ─────────────────────────────────────────
echo -e "${GREEN}[1/8] Registering user: ${USERNAME}${NC}"
REGISTER_RESP=$(curl -s -X POST "${BASE_URL}/register" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"${USERNAME}\",\"password\":\"${PASSWORD}\",\"invitation_code\":\"${INVITATION_CODE}\"}")
echo "$REGISTER_RESP" | python3 -m json.tool 2>/dev/null || echo "$REGISTER_RESP"

# ── 2. Login ────────────────────────────────────────────
echo -e "${GREEN}[2/8] Logging in...${NC}"
LOGIN_RESP=$(curl -s -X POST "${BASE_URL}/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"${USERNAME}\",\"password\":\"${PASSWORD}\"}")
echo "$LOGIN_RESP" | python3 -m json.tool 2>/dev/null || echo "$LOGIN_RESP"

TOKEN=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])" 2>/dev/null)
if [ -z "$TOKEN" ]; then
    echo -e "${RED}ERROR: Could not extract token from login response. Exiting.${NC}"
    exit 1
fi
echo -e "${GREEN}Got token: ${TOKEN:0:20}...${NC}"

AUTH="Authorization: Bearer ${TOKEN}"

# ── 3. List existing deployments ────────────────────────
echo ""
echo -e "${GREEN}[3/8] Listing existing Verda deployments...${NC}"
curl -s "${BASE_URL}/text/deployments" -H "${AUTH}" | python3 -m json.tool 2>/dev/null || true

ask_continue

# ── 4. Deploy a model ──────────────────────────────────
echo -e "${GREEN}[4/8] Deploying deepseek-ai/deepseek-llm-7b-chat on Verda...${NC}"
echo -e "${YELLOW}  (This creates a real serverless container — it will cost credits!)${NC}"
DEPLOY_RESP=$(curl -s -X POST "${BASE_URL}/text/deploy" \
  -H "${AUTH}" \
  -H "Content-Type: application/json" \
  -d '{"model_path":"deepseek-ai/deepseek-llm-7b-chat"}')
echo "$DEPLOY_RESP" | python3 -m json.tool 2>/dev/null || echo "$DEPLOY_RESP"

# ── 5. Poll status until healthy ───────────────────────
echo ""
echo -e "${GREEN}[5/8] Polling deployment status (will check every 30s, up to 15 min)...${NC}"
echo -e "${YELLOW}  The model needs to download first — this takes a few minutes.${NC}"

MAX_ATTEMPTS=30
ATTEMPT=0
HEALTHY=false

while [ "$ATTEMPT" -lt "$MAX_ATTEMPTS" ]; do
    ATTEMPT=$((ATTEMPT + 1))
    STATUS_RESP=$(curl -s "${BASE_URL}/text/status" -H "${AUTH}")
    STATUS=$(echo "$STATUS_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','unknown'))" 2>/dev/null)
    IS_HEALTHY=$(echo "$STATUS_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('healthy', False))" 2>/dev/null)

    echo "  Attempt ${ATTEMPT}/${MAX_ATTEMPTS} — status: ${STATUS}"

    if [ "$IS_HEALTHY" = "True" ]; then
        HEALTHY=true
        echo -e "${GREEN}  ✓ Deployment is HEALTHY!${NC}"
        break
    fi

    sleep 30
done

if [ "$HEALTHY" = false ]; then
    echo -e "${RED}  Deployment did not become healthy in time.${NC}"
    echo -e "${YELLOW}  You can keep polling manually:${NC}"
    echo "    curl -s ${BASE_URL}/text/status -H \"${AUTH}\""
    echo ""
    echo -e "${YELLOW}  Or skip ahead and delete the deployment:${NC}"
    read -rp "  Delete deployment and exit? (y/N): " DELETE_CHOICE
    if [ "$DELETE_CHOICE" = "y" ] || [ "$DELETE_CHOICE" = "Y" ]; then
        curl -s -X DELETE "${BASE_URL}/text/deploy" -H "${AUTH}" | python3 -m json.tool 2>/dev/null || true
    fi
    exit 1
fi

ask_continue

# ── 6. Generate text ────────────────────────────────────
echo -e "${GREEN}[6/8] Generating text completion...${NC}"
GEN_RESP=$(curl -s -X POST "${BASE_URL}/text/generate" \
  -H "${AUTH}" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Explain what artificial intelligence is in 2 sentences.","max_tokens":128,"temperature":0.7}')
echo "$GEN_RESP" | python3 -m json.tool 2>/dev/null || echo "$GEN_RESP"

ask_continue

# ── 7. Chat with model ─────────────────────────────────
echo -e "${GREEN}[7/8] Chatting with the model...${NC}"
CHAT_RESP=$(curl -s -X POST "${BASE_URL}/text/chat" \
  -H "${AUTH}" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"system","content":"You are a helpful assistant."},{"role":"user","content":"Tell me a short joke about programming."}],"max_tokens":128}')
echo "$CHAT_RESP" | python3 -m json.tool 2>/dev/null || echo "$CHAT_RESP"

ask_continue

# ── 8. Delete deployment ───────────────────────────────
echo -e "${GREEN}[8/8] Cleaning up — deleting deployment...${NC}"
echo -e "${YELLOW}  (Important to avoid unnecessary charges!)${NC}"
read -rp "  Delete the deployment now? (Y/n): " DELETE_CHOICE
if [ "$DELETE_CHOICE" != "n" ] && [ "$DELETE_CHOICE" != "N" ]; then
    DEL_RESP=$(curl -s -X DELETE "${BASE_URL}/text/deploy" -H "${AUTH}")
    echo "$DEL_RESP" | python3 -m json.tool 2>/dev/null || echo "$DEL_RESP"
    echo -e "${GREEN}  ✓ Deployment deleted.${NC}"
else
    echo -e "${YELLOW}  Skipped. Remember to delete it later!${NC}"
    echo "    curl -X DELETE ${BASE_URL}/text/deploy -H \"${AUTH}\""
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  All done!${NC}"
echo -e "${GREEN}========================================${NC}"
