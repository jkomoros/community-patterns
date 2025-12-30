#!/usr/bin/env bash

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
PROJECT_ROOT="$SCRIPT_DIR/.."

FAILED_FILES=()
FILTER=""

while [[ $# -gt 0 ]]; do
  case $1 in
    -f) FILTER="$2"; shift 2 ;;
    *) echo "Usage: $0 [-f filter]"; exit 1 ;;
  esac
done

is_pattern() {
  # Check if file has a default export (patterns must have one, utilities don't)
  # This works for all pattern variants:
  #   - export default pattern<...>(...)
  #   - const X = pattern<...>(...); export default X
  #   - const X = recipe<...>(...); export default X
  grep -q "export default" "$1"
}

check_file() {
  local file="$1"

  # Skip non-pattern files (utilities, type definitions, etc.)
  if ! is_pattern "$file"; then
    echo "Skipping $file (not a pattern)"
    return 0
  fi

  echo "Checking $file..."
  if ! ct dev "$file" --no-run; then
    echo "❌ Error in $file"
    FAILED_FILES+=("$file")
  fi
}

should_check() {
  [ -z "$FILTER" ] && return 0
  [[ "$FILTER" == !* ]] && [[ "$1" != *"${FILTER#!}"* ]] && return 0
  [[ "$FILTER" != !* ]] && [[ "$1" == *"$FILTER"* ]] && return 0
  return 1
}

cd "$PROJECT_ROOT"

for file in $(find patterns -name "*.tsx"); do
  should_check "$file" && check_file "$file"
done

if [ ${#FAILED_FILES[@]} -gt 0 ]; then
  echo ""
  echo "❌ Typecheck failed in the following files:"
  for file in "${FAILED_FILES[@]}"; do
    echo "  - $file"
  done
  exit 1
else
  echo "✅ All files passed typecheck."
  exit 0
fi
