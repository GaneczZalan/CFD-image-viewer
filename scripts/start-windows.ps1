param(
  [int]$Port = 3001,
  [string]$ImageRoot = "",
  [int]$ScanDepth = 4,
  [ValidateSet("local", "ssh", "vpn")]
  [string]$AccessMode = "vpn",
  [string]$SshUser = "user",
  [string]$SshHost = "server-address"
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

$env:CFD_SCAN_DEPTH = "$ScanDepth"
Write-Host "Using CFD_SCAN_DEPTH=$ScanDepth"

$bindHost = if ($AccessMode -eq "vpn") { "0.0.0.0" } else { "127.0.0.1" }
$localUrl = "http://localhost:$Port"

Write-Host "Access mode: $AccessMode"
Write-Host "Binding CFD Viewer to $bindHost`:$Port"

if ($AccessMode -eq "ssh") {
  Write-Host ""
  Write-Host "SSH tunnel command for users to run on their own machine:"
  Write-Host "  ssh -L $Port`:127.0.0.1`:$Port $SshUser@$SshHost"
  Write-Host "Then open: $localUrl"
} elseif ($AccessMode -eq "vpn") {
  Write-Host "VPN/Twingate routing is configured outside this script."
  Write-Host "Users on the private network can open: http://server-private-address:$Port"
} else {
  Write-Host "Open locally on this machine: $localUrl"
}

npm.cmd run start -- --hostname $bindHost --port $Port
