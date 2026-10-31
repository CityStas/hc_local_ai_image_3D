# Real-ESRGAN ncnn Vulkan - апскейл изображений x4
# Run: npm run download:esrgan
#
# 45 MB: exe + все .param/.bin модели. Ставим в
# node_modules/electron/dist/resources/Real-ESRGAN-ncnn-vulkan - оттуда его
# берёт upscaleEngine.cjs. Апскейл необязателен: без него всё остальное
# приложение работает, просто кнопка «Увеличить x4» не найдёт движок.

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_net.ps1"

$root    = Split-Path -Parent $PSScriptRoot
$dest    = Join-Path $root "node_modules\electron\dist\resources\Real-ESRGAN-ncnn-vulkan"
$version = "v0.2.5.0"
$zipName = "realesrgan-ncnn-vulkan-20220424-windows.zip"
$url     = "https://github.com/xinntao/Real-ESRGAN/releases/download/$version/$zipName"
$zipPath = Join-Path $env:TEMP $zipName
$tmpDir  = Join-Path $env:TEMP "hc-esrgan-$version"

if (Test-Path (Join-Path $dest "realesrgan-ncnn-vulkan.exe")) {
  Write-Host "[skip] realesrgan-ncnn-vulkan.exe already present"
  exit 0
}

Get-RemoteFile -Url $url -Path $zipPath -MinBytes 44000000

# Архив в TEMP - кэш между запусками. Если он остался битым (обрыв на прошлой
# попытке), Expand-Archive скажет «разделенные и составные архивы не
# поддерживаются»; тогда кэш выбрасываем и качаем заново один раз.
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
    Get-RemoteFile -Url $url -Path $zipPath -MinBytes 44000000
  }
}

$exe = Get-ChildItem $tmpDir -Recurse -Filter "realesrgan-ncnn-vulkan.exe" | Select-Object -First 1
if (-not $exe) { throw "realesrgan-ncnn-vulkan.exe not found in archive" }

# В архиве всё лежит в подпапке - копируем содержимое наверх: движок ищет exe
# и models/ рядом, а не во вложенной папке.
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item -Force -Recurse (Join-Path $exe.DirectoryName "*") -Destination $dest

Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
Remove-Item $tmpDir -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "[ok] Done. Files in Real-ESRGAN-ncnn-vulkan:"
Get-ChildItem $dest | ForEach-Object { Write-Host ("  {0}" -f $_.Name) }
