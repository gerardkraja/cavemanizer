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
schedule=0
cron=()
every=()
backend=()

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
    --schedule)
      schedule=1
      shift
      ;;
    --cron)
      cron=(--cron "$2")
      shift 2
      ;;
    --every)
      every=(--every "$2")
      shift 2
      ;;
    --backend)
      backend=(--backend "$2")
      shift 2
      ;;
    --help|-h)
      echo "Usage: ./install.sh [--agent codex|claude] [--sync] [--activate] [--schedule] [--provider fixture|openai] [--model name] [--budget tokens] [--out-dir dir] [--every daily|--cron '0 3 * * *'] [--backend auto|launchd|systemd|schtasks|cron] [--dry-run]"
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

if [[ "$schedule" -eq 1 ]]; then
  node "$root/bin/cavemanizer.js" schedule install --agent "$agent" "${activate[@]}" "${provider[@]}" "${model[@]}" "${budget[@]}" "${out_dir[@]}" "${cron[@]}" "${every[@]}" "${backend[@]}" "${dry_run[@]}"
fi
