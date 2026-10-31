# Qwen2.5-VL 7B - модель для режима Vision (понимает фото)
# Run: npm run download:vlm-model   (сначала нужен npm run download:vlm - это CLI)
#
# Два файла, оба обязательны: сама модель (Q4_K_M, ~4.7 GB) и vision-энкодер
# mmproj (Q8_0, ~0.85 GB). Без mmproj картинки не читаются.
# Имена файлов фиксированы - их ждёт vlmEngine.cjs (dir 'Qwen2.5-VL-7B').

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_net.ps1"

$root = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $root "node_modules\electron\dist\resources\Qwen2.5-VL-7B"
$base = "https://huggingface.co/ggml-org/Qwen2.5-VL-7B-Instruct-GGUF/resolve/main"

New-Item -ItemType Directory -Force -Path $dest | Out-Null
Write-Host "Target: $dest"

$files = @(
  @{
    Name     = "Qwen2.5-VL-7B-Instruct-Q4_K_M.gguf"
    Url      = "$base/Qwen2.5-VL-7B-Instruct-Q4_K_M.gguf"
    MinBytes = 3500000000
  },
  @{
    Name     = "mmproj-Qwen2.5-VL-7B-Instruct-Q8_0.gguf"
    Url      = "$base/mmproj-Qwen2.5-VL-7B-Instruct-Q8_0.gguf"
    MinBytes = 600000000
  }
)

foreach ($f in $files) {
  Get-RemoteFile -Url $f.Url -Path (Join-Path $dest $f.Name) -MinBytes $f.MinBytes
}

Write-Host ""
Write-Host "Done. Files in Qwen2.5-VL-7B:"
Get-ChildItem $dest | ForEach-Object {
  Write-Host ("  {0}  {1}" -f $_.Name, (Format-Size $_.Length))
}
Write-Host "Next: npm start  (режим Vision)"
