## School Settings Guide

This admin-only workspace centralizes school identity, academic defaults, branding, finance formatting, document copy, and notification behavior.

### Access
- Open `School Settings` from the admin sidebar footer.
- Non-admin roles cannot access `/admin/settings`.

### Categories
- **School Information**: school name, code, principal, contact details, motto, address.
- **Academic Configuration**: academic year, term, levels, grading scale, periods, passing score.
- **Financial Settings**: currency, locale, timezone, date format, prefixes, late-fee defaults.
- **Branding & Appearance**: header copy, login copy, logo, favicon, brand tokens.
- **System Preferences**: public branding, maintenance mode, parent portal, auto-promotion, watermarking.
- **Document Templates**: invoice/report-card/certificate headers, footer notes, signature labels.
- **Notification Settings**: reminder toggles, sender details, SMTP/SMS credentials.

### Save, Import, Export, Restore
- **Save** writes a new version and audit entries for changed fields.
- **Export** downloads the current version as JSON for backup.
- **Import** accepts a prior export and creates a new active version.
- **Restore** promotes a historical version into a new active version without deleting history.

### Audit and Version History
- Every update, import, and restore is versioned.
- The right-side rail shows recent version history and the latest audit activity.
- Add a change summary before saving for clearer operational history.

### Sensitive Values
- `SMTP password` and `SMS API key` are encrypted at rest on the server.
- These values are never exposed in the public settings payload.

### Where Settings Appear
- Sidebar branding and admin setup completion.
- Authenticated header, page title, favicon, and maintenance banner.
- Login screen branding and welcome copy.
- Shared currency/date formatting.
- Printable invoices, attendance reports, report cards, and certificates via shared print helpers.

### Initial Setup Checklist
- Complete school identity details.
- Confirm academic year and term.
- Review currency, locale, and timezone.
- Add document copy and footer text.
- Configure notification sender details if messaging is used.

### Operational Notes
- Seed data creates a starter configuration if none exists.
- Migration script: `migrations/0001_school_settings.sql`.
- Apply database migrations before using the feature in a fresh environment.