## Packages
date-fns | Formatting dates for attendance and fees
recharts | Beautiful dashboard analytics and charts
@hookform/resolvers | Form validation with zod
react-hook-form | Form state management

## Notes
Tailwind Config - extend fontFamily:
fontFamily: {
  sans: ["var(--font-sans)"],
  display: ["var(--font-display)"],
}
API uses /api/me for auth state. Unauthenticated users should be redirected to /login.
Role-based routing ensures users only access their specific dashboards.
