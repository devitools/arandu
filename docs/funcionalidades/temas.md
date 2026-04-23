# Sistema de Temas

O Arandu usa um sistema de design monocromático com variáveis CSS HSL, permitindo alternância suave entre os temas.

## Modos de tema

### Sistema
Detecta automaticamente a preferência do sistema operacional via `prefers-color-scheme`. Se o sistema mudar, o Arandu acompanha.

### Claro
Fundo branco/cinza claro, texto escuro. Ideal para ambientes com luz.

### Escuro
Fundo cinza escuro/preto, texto claro. Reduz fadiga visual em ambientes com pouca luz.

## Variáveis CSS

O tema é implementado com variáveis CSS no nível do `<html>`:

```css
:root {
  --bg: hsl(0, 0%, 100%);
  --text: hsl(0, 0%, 13%);
  --border: hsl(0, 0%, 87%);
  --code-bg: hsl(0, 0%, 95%);
}

[data-theme="dark"] {
  --bg: hsl(0, 0%, 10%);
  --text: hsl(0, 0%, 93%);
  --border: hsl(0, 0%, 25%);
  --code-bg: hsl(0, 0%, 16%);
}
```

## Sincronização multi-janela

O tema selecionado é armazenado em `localStorage` e sincronizado entre todas as janelas abertas via evento `storage`. A janela de configurações e a janela do Whisper acompanham o tema da janela principal.

## Realce de sintaxe

O realce de código também alterna entre temas claro e escuro:

- **Claro**: GitHub Light
- **Escuro**: GitHub Dark
