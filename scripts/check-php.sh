#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
while IFS= read -r -d '' file; do
  php -l "$file"
done < <(find server/php deploy/api tests -name '*.php' -type f -print0)
