# Moondream 2 GGUF (F16, ~3.7 GB) - ggml-org/moondream2-20250414-GGUF
# Run: npm run download:moondream
# Требует также: npm run download:vlm  (llama-mtmd-cli)
#
# Q4_K_M для Moondream2 в публичных HF-репо нет, только F16 (~3.7 GB).
# bartowski/moondream2-GGUF мёртв (401), поэтому источник - ggml-org.

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_net.ps1"

$root = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $root "node_modules\electron\dist\resources\moondream2"
$base = "https://huggingface.co/ggml-org/moondream2-20250414-GGUF/resolve/main"

New-Item -ItemType Directory -Force -Path $dest | Out-Null
Write-Host "Target: $dest"

$files = @(
  @{
    Name     = "moondream2-text-model-f16_ct-vicuna.gguf"
    Url      = "$base/moondream2-text-model-f16_ct-vicuna.gguf"
    MinBytes = 2500000000
  },
  @{
    Name     = "moondream2-mmproj-f16-20250414.gguf"
    Url      = "$base/moondream2-mmproj-f16-20250414.gguf"
    MinBytes = 800000000
  }
)

foreach ($f in $files) {
  Get-RemoteFile -Url $f.Url -Path (Join-Path $dest $f.Name) -MinBytes $f.MinBytes
}

Write-Host ""
Write-Host "Done. Moondream2 files:"
Get-ChildItem $dest | ForEach-Object {
  Write-Host ("  {0}  {1}" -f $_.Name, (Format-Size $_.Length))
}
Write-Host "Next: npm start  (выбери модель moondream2 в Vision)"
