# llama.cpp Vulkan: llama-server + llama-mtmd-cli - движок Vision
# Run: npm run download:vlm
#
# Кладём в <корень проекта>/llama-mtmd: там их ищет vlmEngine.cjs.
# Модель качается отдельно: npm run download:vlm-model (Qwen2.5-VL 7B)
# или npm run download:moondream.

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_net.ps1"

$root    = Split-Path -Parent $PSScriptRoot
$mtmdDir = Join-Path $root "llama-mtmd"
$tag     = "b10679"
$zipName = "llama-$tag-bin-win-vulkan-x64.zip"
$zipUrl  = "https://github.com/ggml-org/llama.cpp/releases/download/$tag/$zipName"
$zipPath = Join-Path $env:TEMP $zipName
$tmpDir  = Join-Path $env:TEMP "llama-mtmd-extract-$tag"

# Нужны оба: llama-server - основной режим, llama-mtmd-cli - резервный
# однопроходный. Раньше проверялся только cli, и неполная распаковка
# проходила как «всё на месте».
$hasServer = Test-Path (Join-Path $mtmdDir "llama-server.exe")
$hasCli    = Test-Path (Join-Path $mtmdDir "llama-mtmd-cli.exe")
if ($hasServer -and $hasCli) {
  Write-Host "[skip] llama-server.exe + llama-mtmd-cli.exe already present"
  exit 0
}

Get-RemoteFile -Url $zipUrl -Path $zipPath -MinBytes 30000000

# Битый архив в кэше (обрыв на прошлой попытке) Expand-Archive не откроет -
# тогда качаем заново один раз.
$extracted = $false
for ($attempt = 1; $attempt -le 2 -and -not $extracted; $attempt++) {
  try {
    Write-Host "[extract] $zipName"
    if (Test-Path $tmpDir) { Remove-Item $tmpDir -Recurse -Force -ErrorAction SilentlyContinue }
    Expand-Archive -Path $zipPath -DestinationPath $tmpDir -Force
    $extracted = $true
  }
  catch {
    if ($attempt -ge 2) { throw }
    Write-Host "  ! архив не открылся ($($_.Exception.Message)) - качаю заново"
    Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
    Get-RemoteFile -Url $zipUrl -Path $zipPath -MinBytes 30000000
  }
}

$cli = Get-ChildItem -Path $tmpDir -Recurse -Filter "llama-mtmd-cli.exe" | Select-Object -First 1
if (-not $cli) { throw "llama-mtmd-cli.exe not found in zip" }

$binDir = $cli.Directory.FullName
New-Item -ItemType Directory -Force -Path $mtmdDir | Out-Null
# exe + dll рядом
Copy-Item -Force -Recurse (Join-Path $binDir "*") -Destination $mtmdDir
Write-Host "[ok] llama-mtmd-cli -> $mtmdDir"

Remove-Item -Force $zipPath -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force $tmpDir -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Done."
