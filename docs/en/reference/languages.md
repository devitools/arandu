# Languages

Arandu supports multiple interface languages.

## Available languages

| Language | Code | Status |
|----------|------|--------|
| Português (Brasil) | `pt-BR` | ✅ Default |
| English | `en` | ✅ Available |

## Changing the language

Go to **Settings → Language** and select the desired language. The change is applied immediately across all open windows and the system tray menu.

## Translation files

The translation files are located at:

```
apps/tauri/src/locales/
├── pt-BR.json   # Portuguese (Brazil)
└── en.json      # English
```

## Contributing translations

To add a new language or improve an existing translation:

1. Fork the repository at [github.com/devitools/arandu](https://github.com/devitools/arandu)
2. Copy `apps/tauri/src/locales/en.json` as a base
3. Create the file `apps/tauri/src/locales/{code}.json`
4. Translate all values (keep the keys)
5. Add the language in `apps/tauri/src/lib/i18n.ts`
6. Open a Pull Request

## Cross-window synchronization

The language is stored in `localStorage('arandu-language')` and synchronized across all open windows via the `storage` event. The system tray menu is also updated via the `update_tray_labels` Tauri command.

## Technical implementation

Arandu uses [i18next](https://www.i18next.com/) with the `react-i18next` plugin. The configuration is in `apps/tauri/src/lib/i18n.ts`.
