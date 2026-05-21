# Final Project Structure — School Management System

```
School-Nexus/
├── client/                          # Frontend (Vite + React + TypeScript)
│   ├── index.html                   # Entry HTML
│   ├── public/
│   │   └── favicon.png              # Favicon
│   ├── requirements.md              # Client requirements
│   └── src/
│       ├── App.tsx                  # Root app with routing
│       ├── main.tsx                 # Entry point
│       ├── index.css                # Global styles
│       ├── components/
│       │   ├── ui/                  # 47 shadcn/ui primitives
│       │   ├── attendance/          # Attendance components
│       │   ├── dashboard/           # Dashboard components
│       │   ├── family/              # Family management components
│       │   ├── finance/             # Finance components (FeeTable, PayFeeDialog, etc.)
│       │   ├── homework/            # Homework components
│       │   ├── import/              # Bulk import components
│       │   ├── layout/              # Layout components (Header, SideNav)
│       │   ├── my-school/           # My School components
│       │   ├── pulse/               # Pulse timeline components
│       │   ├── student/             # Student components
│       │   ├── super-admin/         # Super admin components
│       │   ├── todos/               # Todo components
│       │   ├── ai-assistant-chat.tsx
│       │   ├── app-sidebar.tsx
│       │   ├── ClassTeachersTab.tsx
│       │   ├── daily-diary-card.tsx
│       │   ├── layout.tsx
│       │   ├── protected-route.tsx
│       │   ├── qr-id-card-portrait.tsx
│       │   ├── qr-student-id-card.tsx
│       │   ├── qr-teacher-id-card.tsx
│       │   └── user-form.tsx
│       ├── features/
│       │   ├── examination/         # Examination management feature
│       │   └── ledger/              # Ledger management feature
│       ├── hooks/                   # 34 custom React hooks
│       ├── lib/
│       │   ├── api/                 # API client modules
│       │   ├── import/              # Import utilities
│       │   ├── validators/          # Client-side validators
│       │   ├── finance.ts
│       │   ├── qr.ts
│       │   ├── qr-attendance-offline.ts
│       │   ├── queryClient.ts
│       │   ├── timetable-colors.ts
│       │   ├── timetable-settings-bus.tsx
│       │   ├── utils.ts
│       │   └── voucher-progress.ts
│       ├── mocks/                   # MSW mock service workers
│       ├── pages/
│       │   ├── admin/               # 28 admin pages
│       │   ├── my-school/           # My School pages
│       │   ├── staff/               # Staff pages
│       │   ├── student/             # 9 student pages
│       │   ├── super-admin/         # 6 super admin pages
│       │   ├── teacher/             # 7 teacher pages
│       │   ├── login.tsx
│       │   ├── DashboardPage.tsx
│       │   ├── AttendancePage.tsx
│       │   ├── FinancePage.tsx
│       │   ├── HomeworkPage.tsx
│       │   ├── TodosPage.tsx
│       │   ├── ai-assistant.tsx
│       │   ├── payroll-page.tsx
│       │   └── not-found.tsx
│       ├── store/
│       │   ├── api/                 # RTK Query API slice
│       │   ├── slices/              # Redux slices (5)
│       │   └── index.ts             # Store configuration
│       └── types/                   # TypeScript type declarations
├── server/                          # Backend (Node.js + Express + TypeScript)
│   ├── app.ts                       # Express app setup
│   ├── index.ts                     # Server entry point
│   ├── routes.ts                    # All API routes (~6200 lines)
│   ├── db.ts                        # Database connection
│   ├── session.ts                   # Session configuration
│   ├── socket.ts                    # Socket.io setup
│   ├── storage.ts                   # Storage layer (interface + implementation)
│   ├── storage.js                   # Legacy storage
│   ├── s3.ts                        # AWS S3 integration
│   ├── static.ts                    # Static file serving
│   ├── vite.ts                      # Vite integration
│   ├── errors.ts                    # Error classes
│   ├── settings-service.ts          # Settings service
│   ├── generate-pulse.ts            # Daily pulse generator
│   ├── db/
│   │   └── seeds/                   # Database seeds
│   ├── instructions/                # Instructions
│   ├── lib/
│   │   └── settings-loader.ts       # Settings loader
│   ├── middleware/
│   │   ├── activityLogger.ts        # Activity audit logging
│   │   ├── authMiddleware.ts        # Authentication middleware
│   │   ├── impersonationMiddleware.ts
│   │   ├── rateLimiter.ts           # Rate limiting
│   │   ├── rbac.ts                  # Role-based access
│   │   ├── requireRole.ts           # Role requirement
│   │   └── serviceSuspensionMiddleware.ts
│   ├── migrations/                  # SQL migration files (5)
│   ├── routes/
│   │   └── superAdminRouter.ts      # Super admin routes
│   ├── services/                    # 30+ service files
│   └── validators/
│       └── examValidators.ts        # Exam validation schemas
├── shared/                          # Shared code (frontend + backend)
│   ├── discount-interface.ts
│   ├── discount-service.ts
│   ├── fee-calculator.ts
│   ├── fee-templates.ts
│   ├── finance.ts
│   ├── routes.ts                    # API route definitions (~2900 lines)
│   ├── schema.ts                    # Database schema (~3600 lines)
│   └── settings.ts                  # Settings types/schemas
├── migrations/                      # 26 SQL migration files
├── script/
│   ├── build.ts                     # Production build script
│   └── run-tests.ts                 # Test runner
├── lib/
│   └── validators/
│       └── classes.ts              # Class validators (note: duplicate with client/)
├── schemas/
│   └── homework.schema.ts           # Homework Zod schemas
├── tests/
│   └── e2e/
│       └── navigation.spec.ts       # E2E test
├── config files:
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── postcss.config.js
│   ├── drizzle.config.ts
│   ├── playwright.config.ts
│   ├── vercel.json
│   └── components.json
└── root files:
    ├── package.json
    ├── package-lock.json
    ├── .env / .env.*                 # Environment files (gitignored)
    ├── .gitignore
    ├── opencode.json
    └── *.md                          # Documentation & plan files
```

## Report Files Generated
- `cleanup-report.md` — Comprehensive cleanup actions summary
- `unused-files-report.md` — Detailed unused files analysis
- `dependency-report.md` — Dependency audit details
- `optimization-report.md` — Optimization actions summary
- `final-project-structure.md` — This file
