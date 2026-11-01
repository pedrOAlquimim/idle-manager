#!/usr/bin/env bash
# Samples what the IdleManager processes cost, one CSV row per interval:
#   scripts/measure.sh [--samples N] [--interval SEGUNDOS] [--out ARQUIVO] [--match REGEX]
#
# Defaults: 60 samples, 60 s apart (one hour), into measure-<date>.csv in the current folder.
# CPU is measured between two samples (not the lifetime average `ps` prints), summed over every process,
# and can pass 100 because it adds up all cores. RSS adds the pages each process holds, so shared pages
# are counted once per process; PSS splits them between the processes that share them and is the honest total.
# A sample with no matching process is still written, with zeros: a missing app is a result, not an error.
# The match is made against the program path only, so this script and its own arguments never count.
set -u

HEADER='timestamp,elapsed_min,processes,cpu_percent,rss_mb,pss_mb,mem_available_mb,swap_used_mb'
usage() {
  echo 'uso: scripts/measure.sh [--samples N] [--interval SEGUNDOS] [--out ARQUIVO] [--match REGEX]' >&2
  exit 2
}

SAMPLES=60
INTERVAL=60
OUT="measure-$(date +%Y%m%d-%H%M%S).csv"
MATCH='/opt/IdleManager/|IdleManager/node_modules/electron/dist/electron'

while [ $# -gt 0 ]; do
  case "$1" in
    --samples)  [ $# -ge 2 ] || usage; SAMPLES=$2; shift 2 ;;
    --interval) [ $# -ge 2 ] || usage; INTERVAL=$2; shift 2 ;;
    --out)      [ $# -ge 2 ] || usage; OUT=$2; shift 2 ;;
    --match)    [ $# -ge 2 ] || usage; MATCH=$2; shift 2 ;;
    *) usage ;;
  esac
done
[[ $SAMPLES =~ ^[1-9][0-9]*$ ]] || usage
[[ $INTERVAL =~ ^[1-9][0-9]*$ ]] || usage

HZ=$(getconf CLK_TCK)

pids() {
  ps -eo pid=,args= | awk -v re="$MATCH" '$2 ~ re { print $1 }'
}

# utime + stime of a process, in clock ticks; fails when the process is gone.
ticks_of() {
  local stat
  stat=$(cat "/proc/$1/stat" 2>/dev/null) || return 1
  stat=${stat##*) }
  # shellcheck disable=SC2086
  set -- $stat
  echo $(( ${12} + ${13} ))
}

kb_of() { # field of a /proc file, in kB, 0 when unreadable
  awk -v key="$2:" '$1 == key { print $2; found = 1 } END { if (!found) print 0 }' "$1" 2>/dev/null || echo 0
}

declare -A current=()
declare -A previous=()

snapshot() {
  current=()
  local pid ticks
  for pid in $(pids); do
    if ticks=$(ticks_of "$pid"); then current[$pid]=$ticks; fi
  done
}

[ -s "$OUT" ] || echo "$HEADER" >> "$OUT"

START=$(date +%s.%N)
snapshot
for pid in "${!current[@]}"; do previous[$pid]=${current[$pid]}; done
PREVIOUS_TIME=$START

for ((sample = 1; sample <= SAMPLES; sample++)); do
  sleep "$INTERVAL"
  NOW=$(date +%s.%N)
  snapshot

  count=0
  delta=0
  rss_kb=0
  pss_kb=0
  for pid in "${!current[@]}"; do
    count=$((count + 1))
    # A process born since the last sample counts all of its ticks.
    delta=$((delta + current[$pid] - ${previous[$pid]:-0}))
    rss_kb=$((rss_kb + $(kb_of "/proc/$pid/status" VmRSS)))
    pss_kb=$((pss_kb + $(kb_of "/proc/$pid/smaps_rollup" Pss)))
  done
  [ "$delta" -ge 0 ] || delta=0

  available_kb=$(kb_of /proc/meminfo MemAvailable)
  swap_total_kb=$(kb_of /proc/meminfo SwapTotal)
  swap_free_kb=$(kb_of /proc/meminfo SwapFree)

  awk -v stamp="$(date -Iseconds)" -v elapsed="$(awk -v a="$NOW" -v b="$START" 'BEGIN { print (a - b) / 60 }')" \
      -v count="$count" -v delta="$delta" -v hz="$HZ" -v span="$(awk -v a="$NOW" -v b="$PREVIOUS_TIME" 'BEGIN { print a - b }')" \
      -v rss="$rss_kb" -v pss="$pss_kb" -v avail="$available_kb" -v swap_total="$swap_total_kb" -v swap_free="$swap_free_kb" \
      'BEGIN {
        cpu = (span > 0) ? delta / hz / span * 100 : 0
        printf "%s,%.2f,%d,%.1f,%.0f,%.0f,%.0f,%.0f\n", stamp, elapsed, count, cpu, rss / 1024, pss / 1024, avail / 1024, (swap_total - swap_free) / 1024
      }' >> "$OUT"

  previous=()
  for pid in "${!current[@]}"; do previous[$pid]=${current[$pid]}; done
  PREVIOUS_TIME=$NOW
done

echo "wrote $SAMPLES sample(s) to $OUT"
