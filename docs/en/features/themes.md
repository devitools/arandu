# Theme System

Arandu uses a monochrome design system with HSL CSS variables, allowing smooth toggling between themes.

## Theme modes

### System
Automatically detects the operating system preference via `prefers-color-scheme`. If the system changes, Arandu follows.

### Light
White/light gray background, dark text. Ideal for bright environments.

### Dark
Dark gray/black background, light text. Reduces eye strain in low-light environments.

## CSS variables

The theme is implemented with CSS variables at the `<html>` level:

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

## Multi-window synchronization

The selected theme is stored in `localStorage` and synchronized across all open windows via the `storage` event. The settings window and Whisper window follow the main window's theme.

## Syntax highlighting

Code highlighting also toggles between light and dark themes:

- **Light**: GitHub Light
- **Dark**: GitHub Dark
