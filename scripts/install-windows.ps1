param(
  [int]$Port = 3001,
  [string]$ImageRoot = "",
  [int]$ScanDepth = 4,
  [ValidateSet("local", "ssh", "vpn")]
  [string]$AccessMode = "local",
  [string]$SshUser = "user",
  [string]$SshHost = "server-address",
  [switch]$Start
)

$ErrorActionPreference = "Stop"
$requiredNodeMajor = 20
$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

function Test-Command($Name) {
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Get-NodeMajor {
  if (-not (Test-Command "node")) {
    return $null
  }

  $version = (& node --version).Trim().TrimStart("v")
  return [int]($version.Split(".")[0])
}

Set-Location $projectRoot

Write-Host "CFD Viewer server installer" -ForegroundColor Cyan
Write-Host "Project: $projectRoot"

$nodeMajor = Get-NodeMajor

if ($null -eq $nodeMajor -or $nodeMajor -lt $requiredNodeMajor) {
  Write-Host "Node.js $requiredNodeMajor+ is required. Installing Node.js LTS..." -ForegroundColor Yellow

  if (-not (Test-Command "winget")) {
    throw "winget is not available. Install Node.js LTS manually from https://nodejs.org, then rerun this script."
  }

  winget install --id OpenJS.NodeJS.LTS --source winget --accept-source-agreements --accept-package-agreements

  $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
    [System.Environment]::GetEnvironmentVariable("Path", "User")

  $nodeMajor = Get-NodeMajor
  if ($null -eq $nodeMajor -or $nodeMajor -lt $requiredNodeMajor) {
    throw "Node.js install finished, but node was not found in PATH. Open a new PowerShell window and rerun this script."
  }
}

Write-Host "Using Node.js $(node --version) and npm $(npm.cmd --version)"

Write-Host "Installing project dependencies..."
npm.cmd ci

Write-Host "Building production app..."
npm.cmd run build

Write-Host ""
Write-Host "Install complete." -ForegroundColor Green
Write-Host "Start command:"
$startCommand = "powershell -ExecutionPolicy Bypass -File scripts\start-windows.ps1 -Port $Port -AccessMode $AccessMode"
if ($ImageRoot) {
  $startCommand = "$startCommand -ImageRoot `"$ImageRoot`""
}
$startCommand = "$startCommand -ScanDepth $ScanDepth"
if ($AccessMode -eq "ssh") {
  $startCommand = "$startCommand -SshUser $SshUser -SshHost $SshHost"
}
Write-Host "  $startCommand"

if ($Start) {
  & (Join-Path $projectRoot "scripts\start-windows.ps1") -Port $Port -ImageRoot $ImageRoot -ScanDepth $ScanDepth -AccessMode $AccessMode -SshUser $SshUser -SshHost $SshHost
}
