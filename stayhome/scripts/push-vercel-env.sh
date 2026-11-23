#!/usr/bin/env bash
# Register production env vars on the (new) linked Vercel project in one go.
# Part of docs/notes/vercel-migration.md.
#
#   npx vercel login && npx vercel link     # link THIS directory to the new project first
#   bash scripts/push-vercel-env.sh                 # reads .env.production
#   bash scripts/push-vercel-env.sh --dry-run       # list what would be pushed, no values
#   bash scripts/push-vercel-env.sh --skip-inngest  # Inngest's Vercel integration sets INNGEST_*
#   ENV_FILE=other.env bash scripts/push-vercel-env.sh
#
# .env.production is gitignored (.env*). Values are piped to `vercel env add`
# on stdin and never printed. Every var is added as Sensitive, matching the old
# project — which also means they can't be read back later, so keep the file
# (or a password manager copy) until the migration is verified.
set -euo pipefail

ENV_FILE="${ENV_FILE:-.env.production}"
DRY=0; SKIP_INNGEST=0
for a in "$@"; do
  case "$a" in
    --dry-run) DRY=1 ;;
    --skip-inngest) SKIP_INNGEST=1 ;;
    *) echo "unknown arg: $a" >&2; exit 1 ;;
  esac
done

# Never pushed: local-only knobs and things the platform provides.
SKIP_RE='^(AUTH_URL|VERCEL_.*|CRAWLER_DEBUG_DIR|CRAWLER_HEADLESS|CRAWL_BUDGET_MS)$'
REQUIRED=(DATABASE_URL DIRECT_URL AUTH_SECRET AUTH_TRUST_HOST RESORT_CRED_SECRET CRON_SECRET CHROMIUM_PACK_URL)

[[ -f "$ENV_FILE" ]] || { echo "$ENV_FILE not found (copy .env.example and fill it)" >&2; exit 1; }
if [[ $DRY -eq 0 ]]; then
  [[ -f .vercel/project.json ]] || { echo "not linked — run: npx vercel link" >&2; exit 1; }
  echo "linked project: $(cat .vercel/project.json)"
  read -r -p "Is this the NEW project? type 'yes': " ok
  [[ "$ok" == "yes" ]] || { echo "aborted"; exit 1; }
fi

declare -A VALS=()
order=()
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ "$line" =~ ^[[:space:]]*(#|$) ]] && continue
  [[ "$line" =~ ^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue
  key="${BASH_REMATCH[2]}"; val="${BASH_REMATCH[3]}"
  # strip one layer of matching quotes
  if [[ "$val" =~ ^\"(.*)\"$ || "$val" =~ ^\'(.*)\'$ ]]; then val="${BASH_REMATCH[1]}"; fi
  [[ "$key" =~ $SKIP_RE ]] && { echo "  skip   $key (local-only)"; continue; }
  if [[ $SKIP_INNGEST -eq 1 && "$key" == INNGEST_* ]]; then echo "  skip   $key (--skip-inngest)"; continue; fi
  [[ -z "$val" ]] && { echo "  skip   $key (empty)"; continue; }
  VALS[$key]="$val"; order+=("$key")
done <"$ENV_FILE"

missing=0
for k in "${REQUIRED[@]}"; do
  [[ -n "${VALS[$k]:-}" ]] || { echo "  MISSING $k" >&2; missing=1; }
done
[[ $missing -eq 0 ]] || { echo "fill the missing keys in $ENV_FILE first" >&2; exit 1; }

for k in "${order[@]}"; do
  if [[ $DRY -eq 1 ]]; then echo "  would push $k"; continue; fi
  # --force overwrites, so re-running the script is idempotent
  printf '%s' "${VALS[$k]}" | npx vercel env add "$k" --environment production --sensitive --force >/dev/null 2>&1
  echo "  pushed $k"
done

[[ $DRY -eq 1 ]] || echo "done. Env changes don't reach running deployments — redeploy: npx vercel --prod (or push to stayhome)."
