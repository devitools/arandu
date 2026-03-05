# Configuração do Whisper

Acesse **Configurações → Voz para Texto** para configurar o Whisper.

## Modelos

### Download

Os modelos não vêm pré-instalados. Na primeira vez, acesse **Configurações → Voz para Texto → Baixar modelo** e escolha o tamanho:

| Modelo | Tamanho | Uso de RAM | Indicado para |
|--------|---------|-----------|----------------|
| tiny | ~75 MB | ~200 MB | Uso rápido, hardware limitado |
| base | ~140 MB | ~300 MB | Uso geral (recomendado) |
| small | ~460 MB | ~600 MB | Conteúdo técnico |
| medium | ~1.5 GB | ~2 GB | Máxima precisão |

### Troca de modelo

Você pode baixar vários modelos e alternar entre eles a qualquer momento. O modelo ativo fica em destaque nas configurações.

## Dispositivo de áudio

Por padrão, o Arandu usa o microfone padrão do sistema. Para usar outro dispositivo:

1. Vá em **Configurações → Voz para Texto → Dispositivo de áudio**
2. Selecione o dispositivo desejado na lista
3. Faça um teste clicando em **Testar**

## Atalho de gravação

O atalho padrão é **Alt+Space**. Para personalizar:

1. Vá em **Configurações → Voz para Texto → Atalho de Gravação**
2. Clique no campo e pressione a combinação desejada
3. Salve

::: warning Conflitos de atalho
Verifique se o atalho escolhido não conflita com outros aplicativos do sistema.
:::

## Idioma de transcrição

O Whisper detecta automaticamente o idioma falado. Para forçar um idioma específico, configure em **Configurações → Voz para Texto → Idioma**.

## Armazenamento dos modelos

Os modelos são armazenados em:

- **macOS**: `~/Library/Application Support/com.devitools.arandu/whisper-models/`
- **Linux**: `~/.local/share/com.devitools.arandu/whisper-models/`
- **Windows**: `%APPDATA%\com.devitools.arandu\whisper-models\`
