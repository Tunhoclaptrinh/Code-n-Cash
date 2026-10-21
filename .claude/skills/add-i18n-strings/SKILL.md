---
name: add-i18n-strings
description: Add or change user-facing text in the frontend app with i18next (Vietnamese and English). Use whenever a component needs a label, message, status name or any other visible text.
---

# i18next conventions

## Where text lives

- `src/locales/vi/<namespace>.json` and `src/locales/en/<namespace>.json`, always both, always the same keys.
- One namespace per feature (`contracts`, `signing`, `milestones`, `disputes`, `audit`) plus `common` for the shell,
  roles and shared words. Files are registered automatically by `src/i18n/index.ts`.

## Key rules

- Nested, camelCase, grouped by screen and region: `contractList.table.columns.supplier`.
- Enums map to `status.<ENUM>` or `<thing>.<ENUM>` keys (`status.AWAITING_SIGNATURE`). Data stores the English constant.
- Interpolate with `{{name}}`; use i18next plurals (`key_one`, `key_other`) for counts, never `count + ' items'`.
- Rich text with links or bold uses `<Trans>` with indexed tags, not concatenated fragments.
- No keys that contain the sentence itself (`"clickHere"` is fine, `"pleaseClickHereToContinue"` is not).
- Vietnamese is the reference copy (taken from the design); English is a natural translation, not a literal one.

## Usage

```tsx
const { t } = useTranslation('contracts');
<h1>{t('contractList.title')}</h1>
<span>{t('contractList.subtitle', { count, organization })}</span>
<Badge>{t(`status.${contract.status}`)}</Badge>
```

Numbers, money and dates go through `src/shared/lib/format.ts`, never `toLocaleString` inline.

## Checklist

- [ ] Key exists in both languages with identical structure.
- [ ] No hard-coded visible text, including `aria-label`, `placeholder`, `title` and `alt`.
- [ ] `pnpm typecheck && pnpm build` pass.
