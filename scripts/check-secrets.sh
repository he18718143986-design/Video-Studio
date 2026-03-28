#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v rg >/dev/null 2>&1; then
  echo "ERROR: ripgrep (rg) is required. Install it first."
  exit 2
fi

FAIL=0

print_error() {
  local title="$1"
  local result="$2"
  echo "ERROR: ${title}"
  echo "${result}"
  echo
  FAIL=1
}

declare -a FILES=()

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  # Scan tracked files + untracked non-ignored files.
  while IFS= read -r -d '' f; do
    FILES+=("$f")
  done < <(git ls-files -z -co --exclude-standard)

  # .env should never be tracked.
  if git ls-files --error-unmatch .env >/dev/null 2>&1; then
    print_error ".env is tracked by git (must be ignored)" ".env"
  fi
else
  # Fallback when directory is not yet a git repo.
  while IFS= read -r -d '' f; do
    FILES+=("${f#./}")
  done < <(
    find . -type f \
      -not -path './node_modules/*' \
      -not -path './.next/*' \
      -not -path './coverage/*' \
      -not -path './.git/*' \
      -not -path './test-results/*' \
      -print0
  )
fi

if [[ ${#FILES[@]} -eq 0 ]]; then
  echo "No files to scan."
  exit $FAIL
fi

declare -a FILTERED_FILES=()
for f in "${FILES[@]}"; do
  if [[ "$f" == "scripts/check-secrets.sh" || "$f" == "./scripts/check-secrets.sh" ]]; then
    continue
  fi
  FILTERED_FILES+=("$f")
done
FILES=("${FILTERED_FILES[@]}")

scan_pattern() {
  local title="$1"
  local pattern="$2"
  local output=""
  set +e
  output="$(printf '%s\0' "${FILES[@]}" | xargs -0 rg -n --color never -I -P -e "$pattern" 2>/dev/null)"
  local code=$?
  set -e
  if [[ $code -eq 0 && -n "$output" ]]; then
    print_error "$title" "$output"
  fi
}

# 1) Hard secret formats
scan_pattern "Private key block detected" '-----BEGIN (?:RSA |EC |OPENSSH |DSA |)?PRIVATE KEY-----'
scan_pattern "Google API key detected" 'AIza[0-9A-Za-z_-]{35}'
scan_pattern "OpenAI-style secret key detected" 'sk-[A-Za-z0-9]{20,}'
scan_pattern "Anthropic-style secret key detected" 'sk-ant-[A-Za-z0-9_-]{20,}'

# 2) Sensitive env vars assigned with non-placeholder values
scan_pattern \
  "Sensitive environment variable appears to contain a real value" \
  '^(?!\s*#)\s*(?:export\s+)?(?:SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_SUPABASE_ANON_KEY|INNGEST_EVENT_KEY|INNGEST_SIGNING_KEY|GOOGLE_AI_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|ELEVENLABS_API_KEY|STABILITY_API_KEY|KLING_API_KEY|RUNWAY_API_KEY|LANGFUSE_SECRET_KEY|LANGFUSE_PUBLIC_KEY)\s*=\s*(?!$)(?!<[^>]+>$)(?!your-)(?!path/to)(?!placeholder)(?!local-dev-key$).+'

# 3) Service account JSON likely embedded
scan_pattern "Inline service account private key detected" '"private_key"\s*:\s*"-----BEGIN PRIVATE KEY-----'

if [[ $FAIL -ne 0 ]]; then
  echo "Secret scan failed. Remove secrets before pushing to GitHub."
  exit 1
fi

echo "Secret scan passed. No obvious exposed secrets found."
