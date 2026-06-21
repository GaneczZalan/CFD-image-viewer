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

The app scans `./images` by default.

It supports two common layouts:

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
install-windows.bat -Port 3001 -ImageRoot "D:\CFD\images"
start-windows.bat -Port 3001 -ImageRoot "D:\CFD\images"
```

Linux:

```bash
chmod +x scripts/*.sh
CFD_IMAGE_ROOT="/srv/cfd/images" PORT=3001 ./scripts/install-linux.sh
CFD_IMAGE_ROOT="/srv/cfd/images" PORT=3001 ./scripts/start-linux.sh
```

If `CFD_IMAGE_ROOT` is not set, the app uses the local `images` folder next to the code.

See `DEPLOYMENT.md` for the full server setup notes.

## Viewer Workflow

- Use **Open main folder** for quick browser-side testing by selecting a local root folder that contains simulation subfolders.
- Use **Subfolders** to choose only shared subfolders, or all available subfolders.
- Use **Image subfolder** to choose result groups such as `#VelMag`, `#SCp`, `Monitor_Pictures`, or `Root`.
- Use **Image match** to choose between exact shared filenames and folder-order/index matching.
- Use **Image** or **Image position** to choose the visible image.
- Use left/right arrow keys to move backward/forward through the image sequence.
- Use **Animation preview** to select first/last frames and play the sequence across all visible folders.
- Timing can be controlled by FPS, per-frame milliseconds, or total animation seconds.
- Use **Add folder** to compare up to four simulation folders.
- Edit labels above each image. Defaults come from folder names.
- Use **Download view** to export the visible comparison as a PNG.
