# Configurações

Acesse as configurações via **Arandu → Preferências…** ou `Cmd/Ctrl+,`.

## Aparência

### Tema
- **Sistema**: segue o tema do sistema operacional
- **Claro**: sempre claro
- **Escuro**: sempre escuro

## Voz para Texto

### Modelo Whisper
Baixe e selecione o modelo de transcrição:
- `tiny` (~75 MB)
- `base` (~140 MB) — recomendado
- `small` (~460 MB)
- `medium` (~1.5 GB)

### Dispositivo de Áudio
Selecione o microfone a ser usado para gravação.

### Atalho de Gravação
Atalho global para abrir a janela de gravação. Padrão: **Alt+Space**.

### Idioma
Idioma de transcrição. Padrão: detecção automática.

## Idioma da interface

- **Português (Brasil)**: interface em português
- **English**: interface em inglês

O idioma é sincronizado entre todas as janelas abertas e o menu da bandeja do sistema.

## Armazenamento de dados

| Dado | Local |
|------|-------|
| Configurações | `~/.config/com.devitools.arandu/` |
| Comentários e sessões | `~/.local/share/com.devitools.arandu/comments.db` |
| Planos | `~/.local/share/com.devitools.arandu/plans/` |
| Modelos Whisper | `~/.local/share/com.devitools.arandu/whisper-models/` |
| Histórico de arquivos | `~/.local/share/com.devitools.arandu/history.json` |

*Caminhos são para Linux. No macOS, use `~/Library/Application Support/com.devitools.arandu/`.*

## Reiniciando configurações

Para resetar todas as configurações para o padrão, remova o diretório de configuração e reinicie o Arandu.
