# CFD Viewer Deployment

Use these scripts after copying the project folder to a server.

## Windows Server

Open PowerShell in the project folder:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-windows.ps1
```

Or run the wrapper:

```bat
install-windows.bat
```

Start with bundled test images:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start-windows.ps1 -Port 3001
```

Or:

```bat
start-windows.bat -Port 3001
```

Start with real CFD images:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start-windows.ps1 -Port 3001 -ImageRoot "D:\CFD\images" -ScanDepth 4
```

Install and start immediately:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-windows.ps1 -Port 3001 -ImageRoot "D:\CFD\images" -Start
```

## Linux Server

Open a terminal in the project folder:

```bash
chmod +x scripts/*.sh
./scripts/install-linux.sh
```

Start with bundled test images:

```bash
PORT=3001 ./scripts/start-linux.sh
```

Start with real CFD images:

```bash
CFD_IMAGE_ROOT="/srv/cfd/images" CFD_SCAN_DEPTH=4 PORT=3001 ./scripts/start-linux.sh
```

Install and start immediately:

```bash
CFD_IMAGE_ROOT="/srv/cfd/images" PORT=3001 START_AFTER_INSTALL=1 ./scripts/install-linux.sh
```

## Access Modes

The app supports three startup access modes:

- `local`: binds to `127.0.0.1`; only the same machine can open the app.
- `ssh`: binds to `127.0.0.1`; users connect with an SSH tunnel.
- `vpn`: binds to `0.0.0.0`; users connect through your VPN/Twingate/private network.

`ssh` is the safest mode if you do not want a VPN and only want users with SSH access to reach the app. `vpn` leaves VPN/Twingate configuration to you.

## Local-Only Use

Use this when the viewer is only used directly on the machine running it.

Windows:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start-windows.ps1 -AccessMode local -Port 3001 -ImageRoot "D:\CFD\images"
```

Linux:

```bash
CFD_IMAGE_ROOT="/srv/cfd/images" ACCESS_MODE=local PORT=3001 ./scripts/start-linux.sh
```

Open on the same machine:

```text
http://localhost:3001
```

## SSH Tunnel Use

Use this when the app should not be publicly reachable and users should access it through SSH.

Start the app on the server bound to `127.0.0.1`.

Windows server:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start-windows.ps1 -AccessMode ssh -Port 3001 -ImageRoot "D:\CFD\images" -SshUser zalan -SshHost cfd-server.example.com
```

Linux server:

```bash
CFD_IMAGE_ROOT="/srv/cfd/images" ACCESS_MODE=ssh PORT=3001 SSH_USER=zalan SSH_HOST=cfd-server.example.com ./scripts/start-linux.sh
```

Each user runs this on their own machine:

```bash
ssh -L 3001:127.0.0.1:3001 zalan@cfd-server.example.com
```

Then they open:

```text
http://localhost:3001
```

Keep the SSH window open while using the viewer.

## Twingate/VPN Use

Run the app in VPN mode, then expose `server-ip:3001` or a DNS name like `cfd-viewer.internal:3001` through your VPN/Twingate configuration.

Windows:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start-windows.ps1 -AccessMode vpn -Port 3001 -ImageRoot "D:\CFD\images"
```

Linux:

```bash
CFD_IMAGE_ROOT="/srv/cfd/images" ACCESS_MODE=vpn PORT=3001 ./scripts/start-linux.sh
```

Users must connect to Twingate first, then open:

```text
http://cfd-viewer.internal:3001
```

## Notes

- Node.js 20 or newer is required.
- The installer uses `npm ci`, so keep `package-lock.json` with the project.
- `CFD_IMAGE_ROOT` / `-ImageRoot` is the only folder configured at startup. The viewer then lets users select any folders under that root that directly contain images.
- Images are compared by exact shared filename across the selected folders.
- `CFD_SCAN_DEPTH` / `-ScanDepth` limits how deep the app scans under the image root. The default is `4`. Use `2` for layouts like `root\case\image.png` or `root\case\result_type\image.png`; raise it only if your images are deeper.
- If `CFD_IMAGE_ROOT` is not set, the app uses the local `images` folder.
- Do not use `vpn` mode on the public internet without separate authentication/reverse-proxy protection.
