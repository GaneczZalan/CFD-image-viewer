param(
  [int]$Port = 3001,
  [string]$ImageRoot = ""
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $projectRoot

if ($ImageRoot) {
  $env:CFD_IMAGE_ROOT = $ImageRoot
  Write-Host "Using CFD_IMAGE_ROOT=$ImageRoot"
} else {
  Remove-Item Env:\CFD_IMAGE_ROOT -ErrorAction SilentlyContinue
  Write-Host "Using bundled ./images folder. Pass -ImageRoot to use server CFD folders."
}

Write-Host "Starting CFD Viewer on http://0.0.0.0:$Port"
npm.cmd run start -- --hostname 0.0.0.0 --port $Port
