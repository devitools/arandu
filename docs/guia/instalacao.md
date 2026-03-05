# Instalação

Arandu está disponível para macOS, Linux e Windows.

## macOS

### Homebrew (recomendado)

```bash
brew install --cask devitools/arandu/arandu
```

Isso instala o aplicativo e configura a CLI automaticamente.

### Download manual

1. Acesse a [página de releases](https://github.com/devitools/arandu/releases/latest)
2. Baixe o arquivo correto para seu Mac:
   - **Apple Silicon (M1/M2/M3)**: `arandu_VERSION_aarch64.dmg`
   - **Intel**: `arandu_VERSION_x86_64.dmg`
3. Abra o `.dmg` e arraste o Arandu para a pasta Aplicativos

### CLI de linha de comando

Na primeira abertura, o Arandu oferece instalar a CLI automaticamente. Você também pode instalar via menu **Arandu → Instalar Ferramenta de Linha de Comando…**.

## Linux

### Download manual

1. Acesse a [página de releases](https://github.com/devitools/arandu/releases/latest)
2. Baixe o arquivo para Linux x86_64:
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

1. Acesse a [página de releases](https://github.com/devitools/arandu/releases/latest)
2. Baixe `arandu_VERSION_x64-setup.exe`
3. Execute o instalador

## Verificando a instalação

Após instalar, abra um terminal e execute:

```bash
arandu --version
```

Se a CLI não estiver no PATH, abra o Arandu e use o menu **Arandu → Instalar Ferramenta de Linha de Comando…**.
