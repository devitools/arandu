# Whisper — Voz para Texto

O Arandu integra o [whisper.cpp](https://github.com/ggerganov/whisper.cpp) para transcrição de voz offline, diretamente no dispositivo.

## Por que isso importa

Trabalhar com agentes de IA requer digitação intensa. Formular prompts, descrever bugs, detalhar requisitos — tudo isso compete com o tempo que você passa realmente desenvolvendo.

A transcrição por voz muda essa dinâmica:

- **Velocidade**: Falar é 3x mais rápido que digitar
- **Contexto**: Mais fácil expressar nuances em linguagem natural
- **Ergonomia**: Reduz a carga sobre os pulsos
- **Privacidade**: Tudo processa localmente, sem enviar áudio para a nuvem

## Como funciona

O Arandu inclui o whisper.cpp compilado — um motor de transcrição em C++ que roda os modelos Whisper da OpenAI diretamente no seu hardware, sem precisar de internet ou chaves de API.

## Usando o Whisper

### Atalho global

Pressione **Alt+Space** (configurável) de qualquer lugar do sistema — mesmo com o Arandu em segundo plano. A janela flutuante de gravação aparece.

### Janela de gravação

1. A janela aparece no canto superior da tela (always-on-top)
2. Clique no microfone ou aguarde o início automático
3. Fale seu texto
4. Clique para parar — a transcrição é copiada para a área de transferência

### Dois modos de saída

| Modo | Comportamento |
|------|---------------|
| **Campo** | O texto é inserido diretamente no campo de texto ativo |
| **Área de transferência** | O texto é copiado — você cola onde quiser |

## Modelos disponíveis

| Modelo | Tamanho | Velocidade | Recomendação |
|--------|---------|-----------|--------------|
| tiny | ~75 MB | Muito rápida | Notas rápidas, comandos curtos |
| base | ~140 MB | Rápida | Uso geral — **recomendado para começar** |
| small | ~460 MB | Moderada | Conteúdo técnico, nomes de variáveis |
| medium | ~1.5 GB | Lenta | Máxima precisão, documentação complexa |

Os modelos são baixados automaticamente na primeira utilização (via **Configurações → Voz para Texto**).

## Privacidade

- Nenhum áudio é enviado para servidores externos
- Os modelos rodam inteiramente na CPU/GPU local
- Os arquivos de áudio são processados em memória e descartados

## Próximos passos

- [Configuração do Whisper](/funcionalidades/whisper-config) — modelos, dispositivos, atalhos
