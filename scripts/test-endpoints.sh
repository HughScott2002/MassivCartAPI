#!/usr/bin/env bash

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"

detect_port() {
  if [ -f "$ENV_FILE" ]; then
    local env_port
    env_port="$(sed -n 's/^PORT=//p' "$ENV_FILE" | tail -n 1 | tr -d '[:space:]')"
    if [ -n "$env_port" ]; then
      echo "$env_port"
      return
    fi
  fi

  echo "3000"
}

DEFAULT_PORT="$(detect_port)"
BASE_URL="${TEST_BASE_URL:-http://localhost:$DEFAULT_PORT}"
OUTPUT_FILE="${TEST_OUTPUT_FILE:-test-results/endpoint-test-results.txt}"

mkdir -p "$(dirname "$OUTPUT_FILE")"

STARTED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
PASS_COUNT=0
FAIL_COUNT=0
TOTAL_COUNT=0

{
  echo "Endpoint test run"
  echo "Base URL: $BASE_URL"
  echo "Started: $STARTED_AT"
  echo
} > "$OUTPUT_FILE"

preflight_check() {
  local health_file
  health_file="$(mktemp)"

  local status
  status="$(curl -sS -o "$health_file" -w "%{http_code}" "$BASE_URL/health")"
  local curl_exit=$?
  rm -f "$health_file"

  if [ "$curl_exit" -ne 0 ] || [ "$status" != "200" ]; then
    {
      echo "Preflight"
      echo "Health check URL: $BASE_URL/health"
      echo "Failure: API server is not reachable. Start the API first, or override TEST_BASE_URL."
      echo
      echo "Summary"
      echo "Finished: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
      echo "Total: 0"
      echo "Passed: 0"
      echo "Failed: 1"
    } >> "$OUTPUT_FILE"

    echo "API server is not reachable at $BASE_URL."
    echo "Start the API first, or set TEST_BASE_URL to the correct host and port."
    echo "Results written to $OUTPUT_FILE"
    exit 1
  fi
}

run_test() {
  local name="$1"
  local path="$2"
  local expected_status="$3"
  local expected_body_fragment="$4"

  TOTAL_COUNT=$((TOTAL_COUNT + 1))

  local body_file
  body_file="$(mktemp)"

  local status
  status="$(curl -sS -o "$body_file" -w "%{http_code}" "$BASE_URL$path")"
  local curl_exit=$?
  local body
  body="$(cat "$body_file")"
  rm -f "$body_file"

  local passed="false"
  local failure_reason=""

  if [ "$curl_exit" -ne 0 ]; then
    failure_reason="curl failed with exit code $curl_exit"
  elif [ "$status" != "$expected_status" ]; then
    failure_reason="expected status $expected_status but got $status"
  elif [[ "$body" != *"$expected_body_fragment"* ]]; then
    failure_reason="response did not contain expected fragment: $expected_body_fragment"
  else
    passed="true"
  fi

  if [ "$passed" = "true" ]; then
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi

  {
    echo "Test: $name"
    echo "Path: $path"
    echo "Expected status: $expected_status"
    echo "Actual status: $status"
    echo "Passed: $passed"
    if [ -n "$failure_reason" ]; then
      echo "Failure: $failure_reason"
    fi
    echo "Response:"
    echo "$body"
    echo
  } >> "$OUTPUT_FILE"
}

run_post_test() {
  local name="$1"
  local path="$2"
  local json_body="$3"
  local expected_status="$4"
  local expected_body_fragment="$5"

  TOTAL_COUNT=$((TOTAL_COUNT + 1))

  local body_file
  body_file="$(mktemp)"

  local status
  status="$(curl -sS -o "$body_file" -w "%{http_code}" \
    -X POST \
    -H "Content-Type: application/json" \
    -d "$json_body" \
    "$BASE_URL$path")"
  local curl_exit=$?
  local body
  body="$(cat "$body_file")"
  rm -f "$body_file"

  local passed="false"
  local failure_reason=""

  if [ "$curl_exit" -ne 0 ]; then
    failure_reason="curl failed with exit code $curl_exit"
  elif [ "$status" != "$expected_status" ]; then
    failure_reason="expected status $expected_status but got $status"
  elif [[ "$body" != *"$expected_body_fragment"* ]]; then
    failure_reason="response did not contain expected fragment: $expected_body_fragment"
  else
    passed="true"
  fi

  if [ "$passed" = "true" ]; then
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi

  {
    echo "Test: $name"
    echo "Path: $path"
    echo "Method: POST"
    echo "Request body: $json_body"
    echo "Expected status: $expected_status"
    echo "Actual status: $status"
    echo "Passed: $passed"
    if [ -n "$failure_reason" ]; then
      echo "Failure: $failure_reason"
    fi
    echo "Response:"
    echo "$body"
    echo
  } >> "$OUTPUT_FILE"
}

preflight_check

run_test "health endpoint responds" "/health" "200" "\"ok\":true"
run_test "products endpoint returns data payload" "/products?limit=5" "200" "\"cache\""
run_test "products endpoint validates bad limit" "/products?limit=101" "400" "Invalid query parameters"
run_post_test "search endpoint returns rice matches" "/api/search" '{"terms":["rice"]}' "200" "\"canonical_name\""
run_post_test "search endpoint validates empty terms" "/api/search" '{"terms":[]}' "400" "Invalid query parameters"
run_post_test "command endpoint returns rice search results" "/api/command" '{"message":"cheapest rice","intent":"find"}' "200" "\"results\""
run_post_test "command endpoint validates missing message" "/api/command" '{"message":"","intent":"find"}' "400" "Invalid query parameters"

FINISHED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

{
  echo "Summary"
  echo "Finished: $FINISHED_AT"
  echo "Total: $TOTAL_COUNT"
  echo "Passed: $PASS_COUNT"
  echo "Failed: $FAIL_COUNT"
} >> "$OUTPUT_FILE"

if [ "$FAIL_COUNT" -eq 0 ]; then
  echo "All $PASS_COUNT endpoint tests passed."
else
  echo "$FAIL_COUNT of $TOTAL_COUNT endpoint tests failed."
fi

echo "Results written to $OUTPUT_FILE"

if [ "$FAIL_COUNT" -ne 0 ]; then
  exit 1
fi
