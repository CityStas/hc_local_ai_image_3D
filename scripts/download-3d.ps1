# Модели для фона и image-to-3D (ComfyUI-сайдкар).
# Run: npm run download:3d          - основной набор, ~13.3 ГБ
#      npm run download:3d-all      - плюс бэкбон Trellis2, ещё ~6.5 ГБ
#
# Сама сборка ComfyUI-Easy-Install в репозиторий не входит и здесь не качается:
# скрипт только раскладывает веса в её ComfyUI\models\**. Куда именно - решается
# так же, как в modelPaths.cjs, чтобы приложение и скрипт не разошлись:
#
#   1. HC_COMFY_ROOT (переменная окружения или строка в .env рядом с package.json)
#   2. <корень весов>\text_image_3D\3d_gen\3d_comfy\ComfyUI-Easy-Install
#   3. <приложение>\comfy\ComfyUI-Easy-Install
#
# <корень весов> = HC_MODELS_ROOT, иначе LOCAL_LLM_MODELS, иначе resources
# приложения - то же, что видит приложение.
#
# Имена и пути совпадают с models.manifest.json проекта 3GS Master, поэтому
# один и тот же набор работает в обоих инструментах.

param(
  [switch]$Trellis2,
  [switch]$NoVerify
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_net.ps1"

$appRoot = Split-Path -Parent $PSScriptRoot

# --- .env рядом с package.json: KEY=VALUE, переменные окружения главнее ------
$dotEnv = Join-Path $appRoot ".env"
if (Test-Path $dotEnv) {
  foreach ($raw in Get-Content $dotEnv) {
    $line = $raw.Trim()
    if (-not $line -or $line.StartsWith("#")) { continue }
    $eq = $line.IndexOf("=")
    if ($eq -le 0) { continue }
    $key = $line.Substring(0, $eq).Trim()
    $val = $line.Substring($eq + 1).Trim().Trim('"').Trim("'")
    if ($key -and -not [Environment]::GetEnvironmentVariable($key, "Process")) {
      [Environment]::SetEnvironmentVariable($key, $val, "Process")
    }
  }
}

$resources = Join-Path $appRoot "node_modules\electron\dist\resources"
$modelsRoot = $env:HC_MODELS_ROOT
if (-not $modelsRoot) { $modelsRoot = $env:LOCAL_LLM_MODELS }
if (-not $modelsRoot) { $modelsRoot = $resources }

$comfyCandidates = @()
if ($env:HC_COMFY_ROOT) { $comfyCandidates += $env:HC_COMFY_ROOT }
$comfyCandidates += (Join-Path $modelsRoot "text_image_3D\3d_gen\3d_comfy\ComfyUI-Easy-Install")
$comfyCandidates += (Join-Path $appRoot "comfy\ComfyUI-Easy-Install")

$comfy = $null
foreach ($c in $comfyCandidates) {
  if (Test-Path (Join-Path $c "ComfyUI\main.py")) { $comfy = $c; break }
}
if (-not $comfy) {
  Write-Host "[!] Сборка ComfyUI-Easy-Install не найдена. Искал:"
  foreach ($c in $comfyCandidates) { Write-Host "      $c" }
  Write-Host ""
  Write-Host "    Сначала положи сборку (внутри нужен ComfyUI\main.py) в одно из этих мест,"
  Write-Host "    либо укажи путь:  set HC_COMFY_ROOT=D:\ComfyUI-Easy-Install"
  exit 1
}

$modelsDir = Join-Path $comfy "ComfyUI\models"
Write-Host "ComfyUI: $comfy"
Write-Host "Target:  $modelsDir"
Write-Host ""

# path - относительно ComfyUI\models, ровно как ждут воркфлоу из workflows\comfy\
$files = @(
  @{ Path = "diffusion_models\pixal3d_int8_convrot.safetensors"; Repo = "Comfy-Org/Pixal3D"
     Sha = "4621eac3b715484f79303c7152af641fe0b2b14f4d0e3d394fd6922d00f955ec" },
  @{ Path = "clip_vision\dino_v3_L_naf_fp32.safetensors"; Repo = "Comfy-Org/Pixal3D"
     Sha = "4ad2ec4e0879a5b5b04cd97325cc37da954a7b6edca5170b86510f17f2b2290f" },
  @{ Path = "vae\trellis_2_shape_vae_bf16.safetensors"; Repo = "Comfy-Org/Pixal3D"
     Sha = "de0cb4949a76c59ee5c091a995a69bcc8c51d5aeda939f0c641a50d2a72341f4" },
  @{ Path = "vae\trellis_2_texture_vae_bf16.safetensors"; Repo = "Comfy-Org/Pixal3D"
     Sha = "714e5ebf094a610e12a8e3b5175c18a62f37f6ea4218acb6073644456b73ab0e" },
  @{ Path = "geometry_estimation\moge_2_vitl_normal_fp16.safetensors"; Repo = "Comfy-Org/MoGe"
     Sha = "cb1a692d03235671e959e81360d7b4d9f44aefadb1f852d6ca6aa17799d5e31f" },
  @{ Path = "background_removal\birefnet.safetensors"; Repo = "Comfy-Org/BiRefNet"
     Sha = "9ab37426bf4de0567af6b5d21b16151357149139362e6e8992021b8ce356a154" },
  @{ Path = "clip_vision\dino_v3_vit_h.safetensors"; Repo = "VAST-AI/TripoSplat"
     Sha = "a29ef35101a16966972a0d50732a6f3a608ff7cfffb2afa9bbe9007cb842cc53" },
  @{ Path = "diffusion_models\triposplat_fp16.safetensors"; Repo = "VAST-AI/TripoSplat"
     Sha = "c870b97ac1d6bc9177608a5ec625e19ef9f3c5019aa68f64b0fb7803abcd6d20" },
  @{ Path = "vae\flux2-vae.safetensors"; Repo = "VAST-AI/TripoSplat"
     Sha = "d64f3a68e1cc4f9f4e29b6e0da38a0204fe9a49f2d4053f0ec1fa1ca02f9c4b5" },
  @{ Path = "vae\triposplat_vae_decoder_fp16.safetensors"; Repo = "VAST-AI/TripoSplat"
     Sha = "ed0d0c3d43b599e326845d0ec70f3cf77be9a55e2d97627ac3b34d2830763cc8" }
)

if ($Trellis2) {
  $files += @(
    @{ Path = "diffusion_models\trellis_2_int8_convrot.safetensors"; Repo = "Comfy-Org/TRELLIS.2"
       Sha = "d01952ad137213f6a868f86b6b877026276f84af5eec23069217475a0bad3a31" },
    @{ Path = "clip_vision\dino_v3_vit_l.safetensors"; Repo = "Comfy-Org/TRELLIS.2"
       Sha = "5cb785e458de7c460579082418af81f5c62380c181599344bdc60898c63468ee" }
  )
}

$total = 0
foreach ($f in $files) {
  $dest = Join-Path $modelsDir $f.Path
  $url = "https://huggingface.co/$($f.Repo)/resolve/main/$($f.Path -replace '\\', '/')"
  Get-RemoteFile -Url $url -Path $dest -MinBytes 100000000
  if (-not $NoVerify) {
    $hash = (Get-FileHash -Algorithm SHA256 -Path $dest).Hash.ToLower()
    if ($hash -ne $f.Sha) {
      Write-Host "  ! sha256 не совпал: $($f.Path)"
      Write-Host "    ожидался $($f.Sha)"
      Write-Host "    получен  $hash"
      Write-Host "    Файл оставлен - проверь, не перезалили ли его на HF."
      exit 2
    }
  }
  $total += (Get-Item $dest).Length
}

Write-Host ""
Write-Host ("Готово: {0} в {1}" -f (Format-Size $total), $modelsDir)
Write-Host "Дальше: ноды из workflows\comfy\ (ComfyUI сам перечислит отсутствующие при первом запуске), затем npm start"
