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
powershell -ExecutionPolicy Bypass -File scripts\start-windows.ps1 -Port 3001 -ImageRoot "D:\CFD\images"
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
CFD_IMAGE_ROOT="/srv/cfd/images" PORT=3001 ./scripts/start-linux.sh
```

Install and start immediately:

```bash
CFD_IMAGE_ROOT="/srv/cfd/images" PORT=3001 START_AFTER_INSTALL=1 ./scripts/install-linux.sh
```

## Twingate/VPN Use

Run the app on the server with `--hostname 0.0.0.0`, then expose `server-ip:3001` or a DNS name like `cfd-viewer.internal:3001` as a Twingate resource.

Users must connect to Twingate first, then open:

```text
http://cfd-viewer.internal:3001
```

## Notes

- Node.js 20 or newer is required.
- The installer uses `npm ci`, so keep `package-lock.json` with the project.
- If `CFD_IMAGE_ROOT` is not set, the app uses the local `images` folder.
