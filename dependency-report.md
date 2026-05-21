# Dependency Report — School Management System

## Package Manager: npm (no pnpm-lock.yaml found)

## Total Dependencies: 838 packages (including transitive)

## Production Dependencies: 86
## Dev Dependencies: 32
## Optional Dependencies: 1

---

## Unused Dependencies (Safe to Remove)

| Package | Type | Reason |
|---------|------|--------|
| `bootstrap` | production | Not imported anywhere; project uses shadcn/ui + Tailwind |
| `chart.js` | production | Not imported anywhere; project uses recharts |
| `react-chartjs-2` | production | Not imported anywhere; project uses recharts |
| `framer-motion` | production | Not imported anywhere |
| `next-themes` | production | Next.js library; Vite+React project |
| `passport` | production | Not imported anywhere; auth uses express-session directly |
| `passport-local` | production | Not imported anywhere |
| `react-icons` | production | Not imported anywhere; project uses lucide-react |
| `tw-animate-css` | production | Not imported anywhere |
| `ws` | production | Not imported anywhere; project uses socket.io |
| `@jridgewell/trace-mapping` | production | Not imported anywhere |
| `@tailwindcss/vite` | dev | Tailwind v4 plugin; project uses Tailwind v3 |
| `@types/passport` | dev | Not used |
| `@types/passport-local` | dev | Not used |
| `@types/ws` | dev | Not used |

## Potentially Unused (Verify Before Removal)

| Package | Type | Notes |
|---------|------|-------|
| `memorystore` | production | Listed in build.ts allowlist; may be needed for sessions |
| `zod-validation-error` | production | Listed in build.ts allowlist |

## Outdated Packages (Minor/Patch Updates Available)

Currently 103 packages have newer versions available. Most are patch/minor updates.
Major updates available for: `@hookform/resolvers` (3.x → 5.x)

---

## Dependency Health

- **Prune result:** Up to date, no extraneous packages
- **Vulnerabilities:** 20 (1 low, 8 moderate, 11 high) — mostly from transitive dependencies
- **Overrides:** `drizzle-kit` → `@esbuild-kit/esm-loader` → `tsx`

---

## Recommendations

1. **Remove unused packages** listed above to reduce install size and audit surface
2. **Consider removing** `memorystore` and `zod-validation-error` if not directly used
3. **Update packages** with breaking changes carefully; avoid major version bumps
4. **Consolidate animation libraries:** Keep either framer-motion or CSS animations
5. **Consolidate icon libraries:** Keep either lucide-react or react-icons
