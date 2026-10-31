# _net.ps1 - общий загрузчик для scripts/download-*.ps1
#
# Зачем отдельный файл: `Invoke-WebRequest` не умеет ни повторять попытку, ни
# докачивать. На 6 ГБ это значит, что любой обрыв связи (а он случается даже на
# нормальном канале) отправляет качать файл с нуля. Здесь HttpWebRequest с
# заголовком Range: недокачанный `.part` продолжается с того же байта, а сетевые
# ошибки переживаются повтором с паузой.
#
# Использование из скрипта:
#   . "$PSScriptRoot\_net.ps1"
#   Get-RemoteFile -Url $url -Path $out -MinBytes 400000000

# Windows PowerShell 5.1 по умолчанию умеет только TLS 1.0 на старых сборках
# .NET, а huggingface.co и github.com такой handshake не принимают. Явно
# добавляем TLS 1.2 к тому, что уже включено, - на новых системах это no-op.
try {
  [System.Net.ServicePointManager]::SecurityProtocol =
    [System.Net.ServicePointManager]::SecurityProtocol -bor [System.Net.SecurityProtocolType]::Tls12
} catch {
  Write-Host "  ! не удалось включить TLS 1.2: $($_.Exception.Message)"
}

function Format-Size([long]$Bytes) {
  if ($Bytes -ge 1GB) { return ('{0} GB' -f [math]::Round($Bytes / 1GB, 2)) }
  if ($Bytes -ge 1MB) { return ('{0} MB' -f [math]::Round($Bytes / 1MB, 1)) }
  return ('{0} KB' -f [math]::Round($Bytes / 1KB, 0))
}

function Get-RemoteFile {
  param(
    [Parameter(Mandatory)][string]$Url,
    [Parameter(Mandatory)][string]$Path,
    [long]$MinBytes = 1,
    [int]$Retries = 6,
    [string]$Label = ''
  )

  $name = if ($Label) { $Label } else { Split-Path $Path -Leaf }
  $dir = Split-Path $Path -Parent
  if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }

  # Уже скачан целиком - не трогаем. Порог, а не точный размер: кванты на HF
  # иногда перезаливают, и лишний мегабайт расхождения не повод качать 6 ГБ.
  if (Test-Path $Path) {
    $len = (Get-Item $Path).Length
    if ($len -ge $MinBytes) {
      Write-Host ("[skip] {0} ({1})" -f $name, (Format-Size $len))
      return
    }
    Write-Host ("[redo] {0} неполный ({1}) - качаю заново" -f $name, (Format-Size $len))
    Remove-Item $Path -Force -ErrorAction SilentlyContinue
  }

  $part = "$Path.part"
  $attempt = 0
  while ($true) {
    $attempt++
    $have = 0L
    if (Test-Path $part) { $have = (Get-Item $part).Length }

    try {
      if ($attempt -eq 1 -and $have -eq 0) {
        Write-Host "[download] $name"
        Write-Host "  $Url"
      } else {
        Write-Host ("[retry {0}/{1}] {2} с байта {3}" -f $attempt, $Retries, $name, $have)
      }

      $req = [System.Net.HttpWebRequest]::Create($Url)
      $req.UserAgent = 'hc-ai-downloader/1.0 (+https://github.com/CityStas/hc_local_ai_image_3D)'
      $req.Timeout = 60000
      $req.ReadWriteTimeout = 180000
      $req.AllowAutoRedirect = $true
      if ($have -gt 0) { $req.AddRange($have) }

      $resp = $req.GetResponse()
      $status = [int]$resp.StatusCode

      # 206 - докачка принята. Если сервер ответил 200, он отдаёт файл целиком:
      # дописывать в .part нельзя, иначе получится склейка двух начал.
      if ($have -gt 0 -and $status -ne 206) {
        $resp.Close()
        Remove-Item $part -Force -ErrorAction SilentlyContinue
        throw "сервер не поддержал докачку (HTTP $status)"
      }

      $total = 0L
      if ($resp.ContentLength -gt 0) { $total = [long]$resp.ContentLength + $have }

      $mode = if ($have -gt 0) { [System.IO.FileMode]::Append } else { [System.IO.FileMode]::Create }
      $fs = [System.IO.File]::Open($part, $mode, [System.IO.FileAccess]::Write)
      try {
        $resp.GetResponseStream().CopyTo($fs)
      } finally {
        $fs.Close()
        $resp.Close()
      }

      $got = (Get-Item $part).Length
      if ($total -gt 0 -and $got -lt $total) {
        throw "оборвалось на $(Format-Size $got) из $(Format-Size $total)"
      }
      if ($got -lt $MinBytes) {
        throw "получилось $(Format-Size $got), ожидалось не меньше $(Format-Size $MinBytes)"
      }

      Move-Item -Force $part $Path
      Write-Host ("  OK {0}" -f (Format-Size $got))
      return
    }
    catch {
      Write-Host ("  ! {0}" -f $_.Exception.Message)
      if ($attempt -ge $Retries) {
        Write-Host "[fail] $name - попытки кончились. Файл остался как $part, повторный запуск продолжит с этого места."
        throw
      }
      Start-Sleep -Seconds ([math]::Min(2 * $attempt, 15))
    }
  }
}
