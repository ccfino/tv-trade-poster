# Fonts

Download the **Poppins** font family from Google Fonts and place the TTF files here:

  https://fonts.google.com/specimen/Poppins  →  Download family → extract

Required files:
  - Poppins-Regular.ttf
  - Poppins-Bold.ttf
  - Poppins-SemiBold.ttf
  - Poppins-Light.ttf
  - Poppins-Italic.ttf

If these files are absent, node-canvas will fall back to the system sans-serif font,
which still works but looks less polished.

Quick one-liner to download via curl (Linux / macOS with curl installed):

```bash
cd assets/fonts
curl -L "https://fonts.gstatic.com/s/poppins/v21/pxiEyp8kv8JHgFVrJJfecnFHGPc.woff2" -o Poppins-Regular.woff2
# … or just use the Google Fonts zip download above for TTF files
```
