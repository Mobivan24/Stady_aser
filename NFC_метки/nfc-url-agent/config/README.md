# Конфигурация

В репозитории хранятся только **шаблоны**:

- `settings.example.json`
- `allowed-tags.example.json`

Рабочие файлы `settings.json` и `allowed-tags.json` — локальные, содержат
реальные UID меток и личные URL и игнорируются Git (`.gitignore`).

## Первичная настройка после клонирования

```powershell
Copy-Item .\config\settings.example.json .\config\settings.json
Copy-Item .\config\allowed-tags.example.json .\config\allowed-tags.json
npm run validate-config
```

Далее — по разделу «Первичная настройка» в основном `README.md`.

## Правила

- Не вносите реальные UID, пароли, токены и личные адреса в `*.example.json`.
- Перед коммитом проверяйте `git status` и `git diff --cached`.
- Не используйте `git add -f` для рабочих конфигов.
