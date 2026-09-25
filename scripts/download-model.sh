#!/usr/bin/env bash
# Downloads a ~4B GGUF for local inference with llama.cpp. Run manually; nothing in the app
# downloads weights on its own. Usage: scripts/download-model.sh [qwen|gemma]
set -euo pipefail

MODEL_DIR="${MODEL_DIR:-$HOME/models}"
CHOICE="${1:-qwen}"

case "$CHOICE" in
  qwen)
    URL="https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/main/Qwen3.5-4B-Q4_K_M.gguf"
    FILE="Qwen3.5-4B-Q4_K_M.gguf"   # 2.74 GB, Apache-2.0
    ;;
  gemma)
    URL="https://huggingface.co/unsloth/gemma-4-E4B-it-GGUF/resolve/main/gemma-4-E4B-it-Q4_K_M.gguf"
    FILE="gemma-4-E4B-it-Q4_K_M.gguf"   # 4.98 GB, Gemma licence
    ;;
  *)
    echo "usage: $0 [qwen|gemma]" >&2
    exit 1
    ;;
esac

mkdir -p "$MODEL_DIR"
if [ -f "$MODEL_DIR/$FILE" ]; then
  echo "already present: $MODEL_DIR/$FILE"
else
  echo "downloading $FILE → $MODEL_DIR"
  curl -L --fail --progress-bar -o "$MODEL_DIR/$FILE.part" "$URL"
  mv "$MODEL_DIR/$FILE.part" "$MODEL_DIR/$FILE"
fi

cat <<MSG

Done. Start the server (or set these paths in the in-game Console → Inference → Sidecar):

  llama-server -m "$MODEL_DIR/$FILE" --port 8080 -c 16384 --jinja -ngl 99

MSG
