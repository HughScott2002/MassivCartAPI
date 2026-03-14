#!/usr/bin/env bash

set -uo pipefail

BASE_URL="${TEST_BASE_URL:-http://localhost:3000}"
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

run_test "health endpoint responds" "/health" "200" "\"ok\":true"
run_test "products endpoint returns data payload" "/products?limit=5" "200" "\"cache\""
run_test "products endpoint validates bad limit" "/products?limit=101" "400" "Invalid query parameters"

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
