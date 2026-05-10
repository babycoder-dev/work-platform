param(
  [string]$OutputDir = "release-bundle",
  [string]$ComposeFile = "infra/docker-compose.prod.yml"
)

$ErrorActionPreference = "Stop"

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$ImageTar = Join-Path $OutputDir "work-platform-images.tar"
$SourceZip = Join-Path $OutputDir "work-platform-source.zip"
$Checksums = Join-Path $OutputDir "SHA256SUMS.txt"

docker compose -f $ComposeFile build

$images = @(
  "work-platform-workbench-shell",
  "work-platform-gateway-api",
  "work-platform-platform-api",
  "work-platform-notification-api",
  "work-platform-im-adapter-api",
  "work-platform-realtime-gateway",
  "postgres:17",
  "redis:7"
)

docker save -o $ImageTar $images

if (Test-Path $SourceZip) {
  Remove-Item -Force $SourceZip
}

Compress-Archive -Path `
  ".env.example", `
  "infra", `
  "docs", `
  "README.md" `
  -DestinationPath $SourceZip

Get-FileHash -Algorithm SHA256 $ImageTar, $SourceZip |
  ForEach-Object { "$($_.Hash.ToLower())  $(Split-Path -Leaf $_.Path)" } |
  Set-Content -Encoding UTF8 $Checksums

Write-Host "Release bundle created at $OutputDir"
