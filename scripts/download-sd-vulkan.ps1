# sd-cli / sd-server (stable-diffusion.cpp, leejet) - Vulkan-сборка для генерации картинок
# Run: npm run download:vulkan
#
# Кладём в <корень проекта>/sd-vulkan: именно там ищет sdEngine.cjs
# (sd-vulkan/sd-cli.exe и sd-vulkan/sd-server.exe).

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_net.ps1"

$VERSION  = "master-829-0a565f2"
$ZIP_NAME = "sd-master-0a565f2-bin-win-vulkan-x64.zip"
$URL      = "https://github.com/leejet/stable-diffusion.cpp/releases/download/$VERSION/$ZIP_NAME"
$ROOT     = Split-Path $PSScriptRoot -Parent
$OUTDIR   = Join-Path $ROOT "sd-vulkan"
$ZIPPATH  = Join-Path $ROOT "sd-vulkan-tmp.zip"
$TMPDIR   = Join-Path $env:TEMP "hc-sd-$VERSION"

# Нужны оба exe: sd-cli - одиночный прогон, sd-server - основной режим.
$hasCli    = Test-Path (Join-Path $OUTDIR "sd-cli.exe")
$hasServer = Test-Path (Join-Path $OUTDIR "sd-server.exe")
if ($hasCli -and $hasServer) {
  Write-Host "[skip] sd-vulkan already present (sd-cli.exe + sd-server.exe)"
  exit 0
}

Write-Host "[BAZA] Downloading leejet sd.exe Vulkan (~37 MB)..."
Get-RemoteFile -Url $URL -Path $ZIPPATH -MinBytes 30000000

# Битый архив в кэше (обрыв на прошлой попытке) Expand-Archive не откроет -
# тогда качаем заново один раз.
$extracted = $false
for ($attempt = 1; $attempt -le 2 -and -not $extracted; $attempt++) {
  try {
    Write-Host "[BAZA] Extracting..."
    if (Test-Path $TMPDIR) { Remove-Item $TMPDIR -Recurse -Force -ErrorAction SilentlyContinue }
    Expand-Archive -Path $ZIPPATH -DestinationPath $TMPDIR -Force
    $extracted = $true
  }
  catch {
    if ($attempt -ge 2) { throw }
    Write-Host "  ! архив не открылся ($($_.Exception.Message)) - качаю заново"
    Remove-Item $ZIPPATH -Force -ErrorAction SilentlyContinue
    Get-RemoteFile -Url $URL -Path $ZIPPATH -MinBytes 30000000
  }
}
Remove-Item $ZIPPATH -Force -ErrorAction SilentlyContinue

$sdexe = Get-ChildItem $TMPDIR -Recurse -Filter "sd-cli.exe" | Select-Object -First 1
if ($null -eq $sdexe) {
    Write-Host "[BAZA] ERROR: sd-cli.exe not found. Contents:"
    Get-ChildItem $TMPDIR -Recurse | Select-Object FullName
    exit 1
}

# В архиве файлы лежат в корне или в одной подпапке - в обоих случаях копируем
# содержимое рядом с exe в sd-vulkan. Существующую папку не сносим: в ней могут
# лежать уже скачанные .dll, а на 37 МБ экономия того не стоит.
New-Item -ItemType Directory -Force -Path $OUTDIR | Out-Null
Copy-Item -Force -Recurse (Join-Path $sdexe.DirectoryName "*") -Destination $OUTDIR
Remove-Item $TMPDIR -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "[BAZA] Done! sd-cli.exe path: $OUTDIR\sd-cli.exe"
Write-Host "[BAZA] Run 'npm start' to use Vulkan GPU mode."
