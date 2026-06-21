# CFD Image Viewer

Local/server-hosted Next.js app for comparing CFD or other simulation image folders.

## Local Development

```bash
npm install
npm run dev -- --hostname 0.0.0.0 --port 3001
```

Open:

```text
http://localhost:3001
```

The app scans `./images` by default. Every folder under the image root that directly contains images becomes selectable in the viewer.

It supports layouts like:

```text
images/
  Case_A/
    #VelMag/
      #VelMag00000.png
    #SCp/
      #SCp00000.png
  Case_B/
    #VelMag/
      #VelMag00000.png
```

In that layout you can directly select `Case_A/#VelMag`, `Case_B/#VelMag`, `Case_A/#SCp`, etc.

```text
images/
  Case_A/
    image-001.png
    image-002.png
  Case_B/
    different-name-a.png
    different-name-b.png
```

## Server Deployment

Copy this project folder to the server, then use the installer scripts in `scripts/`.

Windows:

```powershell
install-windows.bat -Port 3001 -ImageRoot "D:\CFD\images" -AccessMode ssh
start-windows.bat -Port 3001 -ImageRoot "D:\CFD\images" -AccessMode ssh -SshUser zalan -SshHost cfd-server.example.com
```

Linux:

```bash
chmod +x scripts/*.sh
CFD_IMAGE_ROOT="/srv/cfd/images" ACCESS_MODE=ssh PORT=3001 ./scripts/install-linux.sh
CFD_IMAGE_ROOT="/srv/cfd/images" ACCESS_MODE=ssh PORT=3001 SSH_USER=zalan SSH_HOST=cfd-server.example.com ./scripts/start-linux.sh
```

If `CFD_IMAGE_ROOT` is not set, the app uses the local `images` folder next to the code.

Access modes:

- `local`: same machine only.
- `ssh`: safe SSH tunnel access.
- `vpn`: bind to the private network; VPN/Twingate setup is external.

See `DEPLOYMENT.md` for the full server setup notes and user commands.

## Viewer Workflow

- Use **Open image root** for quick browser-side testing by selecting a local root folder.
- Use **Add folder** and each folder selector to compare any folders found under that root.
- Images are matched by exact shared filename across the selected folders.
- Use **Image** to choose the visible shared image.
- Use left/right arrow keys to move backward/forward through the image sequence.
- Use **Animation preview** to select first/last frames and play the sequence across all visible folders.
- Timing can be controlled by FPS, per-frame milliseconds, or total animation seconds.
- Edit labels above each image. Defaults come from folder names.
- Use **Download view** to export the visible comparison as a PNG.
