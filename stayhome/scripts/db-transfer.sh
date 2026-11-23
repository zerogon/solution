#!/usr/bin/env bash
# Copy the whole database from one Postgres (old Neon) to another (new Neon).
# Part of docs/notes/vercel-migration.md.
#
#   SRC_URL='postgresql://…old direct…' DST_URL='postgresql://…new direct…' \
#     bash scripts/db-transfer.sh
#
# - Use the DIRECT (non "-pooler") URLs. pg_dump through PgBouncer is unreliable.
# - Runs pg_dump/pg_restore from the official postgres Docker image whose major
#   matches the SOURCE server (there is no local pg_dump on this machine).
# - The dump holds encrypted resort credentials and live login cookies
#   (resort_sessions) — it is written to a private temp dir and deleted on exit.
# - Avoid 09:00 / 12:00 KST: a crawl writing during the dump is harmless but
#   its rows may or may not make it across.
set -euo pipefail

: "${SRC_URL:?SRC_URL (old direct URL) is required}"
: "${DST_URL:?DST_URL (new direct URL) is required}"

if [[ "$SRC_URL" == "$DST_URL" ]]; then
  echo "SRC_URL and DST_URL are the same — refusing." >&2
  exit 1
fi
for u in "$SRC_URL" "$DST_URL"; do
  if [[ "$u" == *-pooler.* ]]; then
    echo "warning: a -pooler URL was given; use the direct URL for dump/restore." >&2
  fi
done

host_of() { sed -E 's#^[a-z]+://[^@]*@([^/:?]+).*#\1#' <<<"$1"; }

# pg tools: local binaries if installed (and new enough), otherwise the
# official postgres image. All I/O is via stdin/stdout so no volume mounts are
# needed (on WSL the docker CLI may be the Windows one).
have_docker() { docker info >/dev/null 2>&1; }
local_major() { command -v "$1" >/dev/null 2>&1 && "$1" --version | grep -oE '[0-9]+' | head -1 || echo 0; }
image="postgres:17"   # replaced by the source's major once known
pg() { # pg <tool> <args…> — args are passed through unchanged
  local tool="$1"; shift
  if command -v "$tool" >/dev/null 2>&1; then "$tool" "$@"; return; fi
  have_docker || {
    cat >&2 <<'MSG'
No usable pg client. Pick one:
  - sudo apt install postgresql-client  (must be >= the source server's major; PGDG repo for 17)
  - Docker Desktop → Settings → Resources → WSL integration → enable this distro
  - or use the Neon console's "Import data" on the NEW project, pointing at the old direct URL
MSG
    exit 1; }
  docker run --rm -i "$image" "$tool" "$@"
}
psql_q() { pg psql "$1" -At -v ON_ERROR_STOP=1 -c "$2"; }

# Fail here, in the parent shell — an exit inside $(…) below would only end the subshell.
if ! command -v pg_dump >/dev/null 2>&1 && ! have_docker; then pg pg_dump; fi

echo "source: $(host_of "$SRC_URL")"
echo "target: $(host_of "$DST_URL")"

src_major="$(psql_q "$SRC_URL" 'SHOW server_version_num' | cut -c1-2)"
dst_major="$(psql_q "$DST_URL" 'SHOW server_version_num' | cut -c1-2)"
[[ "$src_major" =~ ^[0-9]+$ && "$dst_major" =~ ^[0-9]+$ ]] || { echo "could not read server versions" >&2; exit 1; }
echo "postgres major: source=$src_major target=$dst_major"
if [[ "$dst_major" -lt "$src_major" ]]; then
  echo "target major is older than source — create the new Neon project with Postgres $src_major." >&2
  exit 1
fi
image="postgres:$src_major"
if [[ "$(local_major pg_dump)" != 0 && "$(local_major pg_dump)" -lt "$src_major" ]]; then
  echo "local pg_dump is older than the server — install a newer client or remove it from PATH." >&2
  exit 1
fi

existing="$(psql_q "$DST_URL" \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")"
if [[ "$existing" != "0" ]]; then
  echo "target already has $existing table(s) in public — they will be DROPPED and replaced."
  read -r -p "type 'overwrite' to continue: " answer
  [[ "$answer" == "overwrite" ]] || { echo "aborted"; exit 1; }
fi

workdir="$(mktemp -d)"
chmod 700 "$workdir"
trap 'rm -rf "$workdir"' EXIT

echo "dumping…"
pg pg_dump "$SRC_URL" -Fc --no-owner --no-acl >"$workdir/db.dump"
echo "dump size: $(du -h "$workdir/db.dump" | cut -f1)"

echo "restoring…"
pg pg_restore -d "$DST_URL" --no-owner --no-acl --clean --if-exists --single-transaction <"$workdir/db.dump"

echo "done. Compare row counts:"
echo "  npx tsx scripts/verify-env.ts                                   # old"
echo "  DATABASE_URL=\"\$DST_URL\" DIRECT_URL=\"\$DST_URL\" npx tsx scripts/verify-env.ts   # new"
