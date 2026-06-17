#!/usr/bin/env bash
set -euo pipefail

agent="codex"
dry_run=()
sync=()
activate=()
provider=()
model=()
budget=()
out_dir=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --agent)
      agent="$2"
      shift 2
      ;;
    --dry-run)
      dry_run=(--dry-run)
      shift
      ;;
    --sync)
      sync=(--sync)
      shift
      ;;
    --activate)
      activate=(--activate)
      shift
      ;;
    --provider)
      provider=(--provider "$2")
      shift 2
      ;;
    --model)
      model=(--model "$2")
      shift 2
      ;;
    --budget)
      budget=(--budget "$2")
      shift 2
      ;;
    --out-dir)
      out_dir=(--out-dir "$2")
      shift 2
      ;;
    --help|-h)
      echo "Usage: ./install.sh [--agent codex|claude] [--sync] [--activate] [--provider fixture|openai] [--model name] [--budget tokens] [--out-dir dir] [--dry-run]"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 2
      ;;
  esac
done

root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node "$root/bin/cavemanizer.js" install "$root" --agent "$agent" "${sync[@]}" "${activate[@]}" "${provider[@]}" "${model[@]}" "${budget[@]}" "${out_dir[@]}" "${dry_run[@]}"
