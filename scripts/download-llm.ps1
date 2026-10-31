# Qwen3.5 0.8B (Q4_K_M, ~507 MB) - встроенная текстовая модель HC AI
# Run: npm run download:llm
#
# Файл кладём под именем qwen-3.5-0.8b.gguf: именно его ждёт main.cjs
# (dir 'qwen-3.5-0.8b', file 'qwen-3.5-0.8b.gguf').
# Подойдёт любой GGUF с arch=qwen35 и квантованием Q4_K_M - размер может
# отличаться на десяток мегабайт, это нормально.

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_net.ps1"

$root = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $root "node_modules\electron\dist\resources\qwen-3.5-0.8b"

New-Item -ItemType Directory -Force -Path $dest | Out-Null
Write-Host "Target: $dest"

Get-RemoteFile `
  -Url "https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF/resolve/main/Qwen3.5-0.8B-Q4_K_M.gguf" `
  -Path (Join-Path $dest "qwen-3.5-0.8b.gguf") `
  -MinBytes 400000000

Write-Host "Next: npm start"
