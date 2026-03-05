# Idiomas

O Arandu suporta múltiplos idiomas na interface.

## Idiomas disponíveis

| Idioma | Código | Status |
|--------|--------|--------|
| Português (Brasil) | `pt-BR` | ✅ Padrão |
| English | `en` | ✅ Disponível |

## Alterando o idioma

Vá em **Configurações → Idioma** e selecione o idioma desejado. A mudança é aplicada imediatamente em todas as janelas abertas e no menu da bandeja do sistema.

## Arquivos de tradução

Os arquivos de tradução estão em:

```
apps/tauri/src/locales/
├── pt-BR.json   # Português (Brasil)
└── en.json      # English
```

## Contribuindo com traduções

Para adicionar um novo idioma ou melhorar uma tradução existente:

1. Fork o repositório em [github.com/devitools/arandu](https://github.com/devitools/arandu)
2. Copie `apps/tauri/src/locales/en.json` como base
3. Crie o arquivo `apps/tauri/src/locales/{codigo}.json`
4. Traduza todos os valores (mantenha as chaves)
5. Adicione o idioma em `apps/tauri/src/lib/i18n.ts`
6. Abra um Pull Request

## Sincronização entre janelas

O idioma é armazenado em `localStorage('arandu-language')` e sincronizado entre todas as janelas abertas via evento `storage`. O menu da bandeja do sistema também é atualizado via comando Tauri `update_tray_labels`.

## Implementação técnica

O Arandu usa [i18next](https://www.i18next.com/) com o plugin `react-i18next`. A configuração está em `apps/tauri/src/lib/i18n.ts`.
