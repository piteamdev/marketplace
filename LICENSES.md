# Licencje treści katalogu

## Wpisy zmigrowane z OpenBot (2026-11-17, decyzja użytkownika)

Prawie cała zawartość katalogu (41/41 skilli łącznie z seedem to treści własne/zaadaptowane; 27 agentów i 253 aplikacje) pochodzi z katalogu marketplace **OpenBot** (`tmp/openbot`, checkout referencyjny) i jest przeniesiona na zlecenie właściciela tego repo.

- **Skille i agenci autorów OpenBot oraz definicje aplikacji plugin-catalog**: treść pochodna od OpenBot, którego kod i treści są licencjonowane jako **PolyForm Noncommercial 1.0.0** (zob. `tmp/openbot/LICENSE`). Użycie komercyjne tych treści wymaga licencji/praw od OpenBot.
- **Wpisy upstream (anthropic/openai)**: skill `eggbot-getting-started` itp. — pochodne Apache 2.0 z atrybucją upstream (openbot przechowuje commit pochodzenia; zob. `production-catalog/catalog.json → sources`).
- Nagłówki `name` w SKILL.md zostały znormalizowane do slugów (wymóg walidatora); treść instrukcji bez zmian merytorycznych.

## Wpisy własne (seed)

- `skills/code-review`, `agents/code-reviewer`, `apps/context7` — treści własne PiTeam, licencja repo (MIT).

## Skrypt migracji

`scripts/migrate-from-openbot.mjs` — idempotentny; źródło: `OPENBOT_SRC` (domyślnie `/home/artur/projects/piteam/tmp/openbot/marketplace`). Ponowne uruchomienie odświeża treści z openbota (uwaga: podbicie wersji/changelogu po re-migracji wymaga ręcznego przeglądu).
