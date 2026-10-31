# Z-Image-Turbo - три файла для stable-diffusion.cpp (leejet)
# Run: npm run download:zimage
#
# Имена файлов зашиты в sdEngine.cjs (MODEL.dir = 'z-image-turbo'):
#   z_image_turbo-Q4_K.gguf - диффузия
#   ae.safetensors          - VAE
#   Qwen3-4B-...-Q4_K_M.gguf - текст-энкодер

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_net.ps1"

$root = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $root "node_modules\electron\dist\resources\z-image-turbo"

New-Item -ItemType Directory -Force -Path $dest | Out-Null
Write-Host "Target: $dest"

$files = @(
  @{
    Name     = "ae.safetensors"
    Url      = "https://huggingface.co/Tongyi-MAI/Z-Image-Turbo/resolve/main/vae/diffusion_pytorch_model.safetensors"
    MinBytes = 150000000
  },
  @{
    Name     = "Qwen3-4B-Instruct-2507-Q4_K_M.gguf"
    Url      = "https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_K_M.gguf"
    MinBytes = 2000000000
  },
  @{
    Name     = "z_image_turbo-Q4_K.gguf"
    Url      = "https://huggingface.co/leejet/Z-Image-Turbo-GGUF/resolve/main/z_image_turbo-Q4_K.gguf"
    MinBytes = 4000000000
  }
)

foreach ($f in $files) {
  Get-RemoteFile -Url $f.Url -Path (Join-Path $dest $f.Name) -MinBytes $f.MinBytes
}

Write-Host ""
Write-Host "Done. Files in z-image-turbo:"
Get-ChildItem $dest | ForEach-Object {
  Write-Host ("  {0}  {1}" -f $_.Name, (Format-Size $_.Length))
}
Write-Host "Next: npm start"
