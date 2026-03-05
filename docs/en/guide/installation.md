# Installation

Arandu is available for macOS, Linux, and Windows.

## macOS

### Homebrew (recommended)

```bash
brew install --cask devitools/arandu/arandu
```

This installs the application and configures the CLI automatically.

### Manual download

1. Go to the [releases page](https://github.com/devitools/arandu/releases/latest)
2. Download the correct file for your Mac:
   - **Apple Silicon (M1/M2/M3)**: `arandu_VERSION_aarch64.dmg`
   - **Intel**: `arandu_VERSION_x86_64.dmg`
3. Open the `.dmg` and drag Arandu to the Applications folder

### Command line tool

On first launch, Arandu offers to install the CLI automatically. You can also install it via the **Arandu → Install Command Line Tool…** menu.

## Linux

### Manual download

1. Go to the [releases page](https://github.com/devitools/arandu/releases/latest)
2. Download the file for Linux x86_64:
   - **AppImage** (universal): `arandu_VERSION_amd64.AppImage`
   - **Debian/Ubuntu**: `arandu_VERSION_amd64.deb`

#### AppImage

```bash
chmod +x arandu_VERSION_amd64.AppImage
./arandu_VERSION_amd64.AppImage
```

#### .deb (Debian/Ubuntu)

```bash
sudo dpkg -i arandu_VERSION_amd64.deb
```

## Windows

1. Go to the [releases page](https://github.com/devitools/arandu/releases/latest)
2. Download `arandu_VERSION_x64-setup.exe`
3. Run the installer

## Verifying the installation

After installing, open a terminal and run:

```bash
arandu --version
```

If the CLI is not in the PATH, open Arandu and use the **Arandu → Install Command Line Tool…** menu.
