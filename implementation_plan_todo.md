# Implementation Plan: To-Do Feature — School-Nexus Dashboard

---

## 1. UI Mockup Analysis

Two mockups define the complete feature surface:

### Mockup 1 — To-dos Widget (Dashboard Card)

| Element | Details |
|---------|---------|
| **Header** | "To-dos" title + `+ Add New` button (top-right) |
| **Todo row** | Content text · clock icon · status badge · three-dot context menu |
| **Status badges** | `Completed` (green) · `Pending` (yellow/amber) |
| **Footer** | `See More` button — paginated overflow |

### Mockup 2 — Create Todo Modal

| Element | Details |
|---------|---------|
| **Title** | "Create Todo" |
| **Content field** | Plain text input (required) |
| **Reminder field** | Date/time picker — optional |
| **Actions** | `Cancel` (outline) · `Create` (primary solid) |

**Key constraints derived from the UI:**

- A todo has exactly **two statuses**: `pending` and `completed` — no intermediate states.
- The **reminder is optional** — the system must handle todos with and without reminder dates.
- The widget is **paginated** (`See More`) — the dashboard card shows a limited preview (3 items); a full list view exists elsewhere.
- The **three-dot menu** implies per-item actions: Edit, Mark Complete/Pending, Delete.
- The **clock icon** beside each todo title suggests reminder date display.

---

## 2. Frontend Integration

### 2.1 Component Placement

The To-dos widget lives on the **main Admin Dashboard** as a resizable card, alongside other summary widgets.  
A full list page is accessible via `See More` → `/dashboard/todos`.

```
Dashboard Layout
 ├── <StatsRow />
 ├── <RecentActivityCard />
 ├── <TodosWidget />          ← Dashboard preview (3 items + See More)
 └── ...

/dashboard/todos              ← Full todos page (paginated table + filters)
```

---

### 2.2 Component Tree

```
<TodosWidget>                        // Dashboard card (preview mode)
 ├── <TodosWidgetHeader>             // "To-dos" title + "+ Add New" button
 ├── <TodoList preview={true}>       // Renders first 3 todos
 │    └── <TodoItem> × n
 │         ├── <TodoContent>         // text + clock icon + reminder date
 │         ├── <StatusBadge>         // "Completed" | "Pending"
 │         └── <TodoContextMenu>     // three-dot dropdown
 ├── <CreateTodoModal>               // Controlled by isOpen state
 └── <Button "See More">            // Navigates to /dashboard/todos

<TodosPage>                          // Full page at /dashboard/todos
 ├── <PageHeader>                    // Title + "+ Add New" button
 ├── <TodoFilterBar>                 // Filter by status: All | Pending | Completed
 ├── <TodoTable>                     // Full paginated list
 │    └── <TodoItem> × n
 └── <CreateTodoModal>               // Shared modal component
```

---

### 2.3 TodoItem Row Design

```tsx
// components/todos/TodoItem.tsx
interface TodoItemProps {
  todo: Todo;
  onStatusChange: (id: number, status: TodoStatus) => void;
  onDelete:       (id: number) => void;
  onEdit:         (todo: Todo) => void;
}

export function TodoItem({ todo, onStatusChange, onDelete, onEdit }: TodoItemProps) {
  return (
    <div className="flex items-center justify-between py-3 px-2 border-b border-white/5">
      {/* Left: content + reminder clock */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="truncate text-sm text-white/90">{todo.content}</span>
        {todo.reminderAt && (
          <span className="flex items-center gap-1 text-xs text-white/40 shrink-0">
            <Clock className="h-3 w-3" />
            {formatReminderDate(todo.reminderAt)}
          </span>
        )}
      </div>

      {/* Right: badge + context menu */}
      <div className="flex items-center gap-3 shrink-0">
        <StatusBadge status={todo.status} />
        <TodoContextMenu
          todo={todo}
          onEdit={onEdit}
          onDelete={onDelete}
          onStatusChange={onStatusChange}
        />
      </div>
    </div>
  );
}
```

---

### 2.4 Status Badge

```tsx
// components/todos/StatusBadge.tsx
const badgeStyles: Record<TodoStatus, string> = {
  completed: 'bg-green-500/20 text-green-400 border border-green-500/30',
  pending:   'bg-amber-500/20  text-amber-400  border border-amber-500/30',
};

export function StatusBadge({ status }: { status: TodoStatus }) {
  return (
    <span className={`px-2.5 py-0.5 rounded text-xs font-semibold capitalize ${badgeStyles[status]}`}>
      {status}
    </span>
  );
}
```

---

### 2.5 Three-Dot Context Menu

```tsx
// components/todos/TodoContextMenu.tsx
export function TodoContextMenu({ todo, onEdit, onDelete, onStatusChange }: ContextMenuProps) {
  const toggleLabel = todo.status === 'pending' ? 'Mark Completed' : 'Mark Pending';
  const toggleStatus: TodoStatus = todo.status === 'pending' ? 'completed' : 'pending';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onEdit(todo)}>
          <Pencil className="mr-2 h-4 w-4" /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onStatusChange(todo.id, toggleStatus)}>
          <CheckCircle className="mr-2 h-4 w-4" /> {toggleLabel}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => onDelete(todo.id)}
          className="text-red-400 focus:text-red-400"
        >
          <Trash2 className="mr-2 h-4 w-4" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

---

### 2.6 Create Todo Modal

```tsx
// components/todos/CreateTodoModal.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const createTodoSchema = z.object({
  content:    z.string().min(1, 'Content is required').max(500),
  reminderAt: z.string().optional(),  // ISO datetime string from date picker
});

type CreateTodoForm = z.infer<typeof createTodoSchema>;

export function CreateTodoModal({ isOpen, onClose }: ModalProps) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<CreateTodoForm>({
    resolver: zodResolver(createTodoSchema),
  });

  const createMutation = useCreateTodo();

  const onSubmit = (data: CreateTodoForm) => {
    createMutation.mutate(data, {
      onSuccess: () => { reset(); onClose(); },
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-[#1a1f2e] border-white/10 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Create Todo</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Content field */}
          <div>
            <Input
              {...register('content')}
              placeholder="Content"
              className="bg-[#252b3b] border-white/10 text-white placeholder:text-white/30"
            />
            {errors.content && (
              <p className="text-xs text-red-400 mt-1">{errors.content.message}</p>
            )}
          </div>

          {/* Reminder date picker */}
          <div className="relative">
            <Input
              {...register('reminderAt')}
              type="datetime-local"
              placeholder="Reminder (optional)"
              className="bg-[#252b3b] border-white/10 text-white/60 pr-10"
            />
            <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30 pointer-events-none" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit(onSubmit)} disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Creating...' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

---

### 2.7 React Query Hooks

```ts
// hooks/useTodos.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { todosApi } from '../lib/api/todos';

// Dashboard widget — first 3 items only
export function useTodosPreview() {
  return useQuery({
    queryKey: ['todos', 'preview'],
    queryFn:  () => todosApi.list({ limit: 3, page: 1 }),
  });
}

// Full list with filters
export function useTodos(filters: TodoFilters) {
  return useQuery({
    queryKey: ['todos', filters],
    queryFn:  () => todosApi.list(filters),
  });
}

export function useCreateTodo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: todosApi.create,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['todos'] }),
  });
}

export function useUpdateTodoStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: TodoStatus }) =>
      todosApi.updateStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['todos'] }),
  });
}

export function useDeleteTodo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: todosApi.delete,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['todos'] }),
  });
}
```

---

## 3. Backend API & Service Layer

### 3.1 Endpoints

```
GET    /api/todos              — list todos (paginated, filterable by status)
POST   /api/todos              — create a new todo
PATCH  /api/todos/:id          — update content or status
DELETE /api/todos/:id          — delete a todo
```

All endpoints require authentication (`requireAuth` middleware). Todos are **scoped per user** — each admin sees only their own todos.

---

### 3.2 Route Definitions

```ts
// server/routes/todos.routes.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import * as todosController from '../controllers/todos.controller';

const router = Router();

router.use(requireAuth);  // All todo routes require authentication

router.get('/',     todosController.list);
router.post('/',    todosController.create);
router.patch('/:id', todosController.update);
router.delete('/:id', todosController.remove);

export default router;
```

---

### 3.3 Controller Layer

```ts
// server/controllers/todos.controller.ts
import { Request, Response } from 'express';
import * as todosService from '../services/todos.service';

export async function list(req: Request, res: Response) {
  const { page = '1', limit = '10', status } = req.query;
  const userId = req.user!.id;

  const result = await todosService.getTodos(userId, {
    page:   parseInt(page as string),
    limit:  parseInt(limit as string),
    status: status as TodoStatus | undefined,
  });

  res.json(result);
}

export async function create(req: Request, res: Response) {
  const userId = req.user!.id;
  const todo   = await todosService.createTodo(userId, req.body);
  res.status(201).json(todo);
}

export async function update(req: Request, res: Response) {
  const userId = req.user!.id;
  const todo   = await todosService.updateTodo(userId, parseInt(req.params.id), req.body);
  if (!todo) return res.status(404).json({ message: 'Todo not found' });
  res.json(todo);
}

export async function remove(req: Request, res: Response) {
  const userId = req.user!.id;
  await todosService.deleteTodo(userId, parseInt(req.params.id));
  res.status(204).send();
}
```

---

### 3.4 Service Layer

```ts
// server/services/todos.service.ts
import { db }    from '../db';
import { todos } from '../db/schema/todos';
import { eq, and, desc, count } from 'drizzle-orm';

export async function getTodos(
  userId:  number,
  options: { page: number; limit: number; status?: TodoStatus },
) {
  const { page, limit, status } = options;
  const offset = (page - 1) * limit;

  const where = [
    eq(todos.userId, userId),
    ...(status ? [eq(todos.status, status)] : []),
  ];

  const [rows, [{ total }]] = await Promise.all([
    db.select().from(todos)
      .where(and(...where))
      .orderBy(desc(todos.createdAt))
      .limit(limit)
      .offset(offset),

    db.select({ total: count() }).from(todos).where(and(...where)),
  ]);

  return {
    data:       rows,
    total:      Number(total),
    page,
    totalPages: Math.ceil(Number(total) / limit),
  };
}

export async function createTodo(userId: number, input: CreateTodoInput) {
  const [todo] = await db.insert(todos).values({
    userId,
    content:    input.content,
    reminderAt: input.reminderAt ? new Date(input.reminderAt) : null,
    status:     'pending',
  }).returning();

  return todo;
}

export async function updateTodo(
  userId: number,
  todoId: number,
  input:  UpdateTodoInput,
) {
  const [updated] = await db
    .update(todos)
    .set({
      ...(input.content    !== undefined && { content:    input.content }),
      ...(input.status     !== undefined && { status:     input.status }),
      ...(input.reminderAt !== undefined && { reminderAt: input.reminderAt
                                                           ? new Date(input.reminderAt)
                                                           : null }),
      updatedAt: new Date(),
    })
    .where(and(eq(todos.id, todoId), eq(todos.userId, userId)))
    .returning();

  return updated ?? null;
}

export async function deleteTodo(userId: number, todoId: number) {
  await db
    .delete(todos)
    .where(and(eq(todos.id, todoId), eq(todos.userId, userId)));
}
```

> **Ownership guard**: Every query includes `eq(todos.userId, userId)` — users can never read or modify another user's todos.

---

## 4. Data Validation & Error Handling

### 4.1 Zod Request Schemas

```ts
// server/validators/todos.validators.ts
import { z } from 'zod';

export const CreateTodoSchema = z.object({
  content:    z.string().min(1, 'Content is required').max(500, 'Max 500 characters'),
  reminderAt: z.string().datetime({ message: 'Invalid date format' }).optional().nullable(),
});

export const UpdateTodoSchema = z.object({
  content:    z.string().min(1).max(500).optional(),
  status:     z.enum(['pending', 'completed']).optional(),
  reminderAt: z.string().datetime().optional().nullable(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided' },
);

export type CreateTodoInput = z.infer<typeof CreateTodoSchema>;
export type UpdateTodoInput = z.infer<typeof UpdateTodoSchema>;
```

### 4.2 Validation Middleware

```ts
// server/middleware/validate.ts
import { ZodSchema } from 'zod';
import { Request, Response, NextFunction } from 'express';

export const validate = (schema: ZodSchema) =>
  (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        message: 'Validation failed',
        errors:  result.error.flatten().fieldErrors,
      });
    }
    req.body = result.data;  // Replace with sanitized data
    next();
  };
```

Applied to routes:

```ts
router.post('/', validate(CreateTodoSchema), todosController.create);
router.patch('/:id', validate(UpdateTodoSchema), todosController.update);
```

### 4.3 Error Response Contract

```ts
// Validation failure (400)
{
  "message": "Validation failed",
  "errors": {
    "content": ["Content is required"],
    "reminderAt": ["Invalid date format"]
  }
}

// Not found (404)
{ "message": "Todo not found" }

// Unauthorized (401)
{ "message": "Authentication required" }
```

---

## 5. Database Schema (Drizzle ORM)

```ts
// server/db/schema/todos.ts
import { pgTable, serial, integer, text, varchar, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { users } from './users';

export const todoStatusEnum = pgEnum('todo_status', ['pending', 'completed']);

export const todos = pgTable('todos', {
  id:         serial('id').primaryKey(),
  userId:     integer('user_id').notNull()
              .references(() => users.id, { onDelete: 'cascade' }),
  content:    text('content').notNull(),
  status:     todoStatusEnum('status').notNull().default('pending'),
  reminderAt: timestamp('reminder_at'),                   // null = no reminder
  createdAt:  timestamp('created_at').defaultNow().notNull(),
  updatedAt:  timestamp('updated_at').defaultNow().notNull(),
});

// Indexes for common query patterns
export const todosIndexes = {
  byUserId:       index('todos_user_id_idx').on(todos.userId),
  byStatus:       index('todos_status_idx').on(todos.status),
  byReminderAt:   index('todos_reminder_at_idx').on(todos.reminderAt),
};
```

### Type Definitions

```ts
// types/todo.ts
export type TodoStatus = 'pending' | 'completed';

export interface Todo {
  id:         number;
  userId:     number;
  content:    string;
  status:     TodoStatus;
  reminderAt: string | null;  // ISO datetime string on client
  createdAt:  string;
  updatedAt:  string;
}

export interface TodoListResponse {
  data:       Todo[];
  total:      number;
  page:       number;
  totalPages: number;
}

export interface TodoFilters {
  page?:   number;
  limit?:  number;
  status?: TodoStatus;
}
```

---

## 6. Reminder Notification System (Optional Enhancement)

Since the UI exposes a reminder date picker, a background job should fire notifications when `reminderAt` arrives.

### Architecture

```
DB polling / cron job
 └── Every 1 minute: SELECT * FROM todos WHERE reminder_at <= NOW() AND reminded = false
     └── For each result:
         ├── Send in-app notification (WebSocket push or toast on next page load)
         ├── Send email (optional — nodemailer / resend)
         └── Set reminded = true  (add `reminded` boolean column)
```

```ts
// server/jobs/reminderJob.ts
import cron from 'node-cron';
import { db }    from '../db';
import { todos } from '../db/schema/todos';
import { and, eq, lte, isNull } from 'drizzle-orm';
import { sendReminderNotification } from '../services/notifications.service';

// Runs every minute
cron.schedule('* * * * *', async () => {
  const dueReminders = await db
    .select()
    .from(todos)
    .where(
      and(
        lte(todos.reminderAt, new Date()),
        eq(todos.reminded, false),
        eq(todos.status, 'pending'),   // Don't remind for completed todos
      ),
    );

  for (const todo of dueReminders) {
    await sendReminderNotification(todo.userId, todo);
    await db
      .update(todos)
      .set({ reminded: true })
      .where(eq(todos.id, todo.id));
  }
});
```

> Add a `reminded` boolean column (`default: false`) to the `todos` table to track fired reminders.

---

## 7. API Client (Frontend)

```ts
// lib/api/todos.ts
import { apiClient } from './client'; // your axios/fetch wrapper
import type { Todo, TodoListResponse, CreateTodoInput, UpdateTodoInput, TodoFilters } from '../../types/todo';

export const todosApi = {
  list: (filters: TodoFilters): Promise<TodoListResponse> =>
    apiClient.get('/todos', { params: filters }),

  create: (input: CreateTodoInput): Promise<Todo> =>
    apiClient.post('/todos', input),

  updateStatus: (id: number, status: TodoStatus): Promise<Todo> =>
    apiClient.patch(`/todos/${id}`, { status }),

  update: (id: number, input: UpdateTodoInput): Promise<Todo> =>
    apiClient.patch(`/todos/${id}`, input),

  delete: (id: number): Promise<void> =>
    apiClient.delete(`/todos/${id}`),
};
```

---

## 8. Implementation Roadmap

### Phase 1 — Database & Backend Foundation (Day 1)

- [ ] Add `todo_status` enum and `todos` table to Drizzle schema
- [ ] Add `reminded` boolean column if reminder notifications are in scope
- [ ] Generate and run DB migration (`drizzle-kit generate:pg && push:pg`)
- [ ] Define TypeScript interfaces: `Todo`, `TodoFilters`, `TodoListResponse`
- [ ] Implement Zod validators: `CreateTodoSchema`, `UpdateTodoSchema`

### Phase 2 — Service & Controller Layer (Day 2)

- [ ] Implement `todos.service.ts` (getTodos, createTodo, updateTodo, deleteTodo)
- [ ] Implement `todos.controller.ts` (list, create, update, remove)
- [ ] Wire routes at `/api/todos` with auth + validation middleware
- [ ] Manual API test with Postman/Thunder Client for all 4 endpoints

### Phase 3 — Frontend Hooks & API Client (Day 3)

- [ ] Implement `lib/api/todos.ts` API client wrapper
- [ ] Implement React Query hooks: `useTodos`, `useTodosPreview`, `useCreateTodo`, `useUpdateTodoStatus`, `useDeleteTodo`
- [ ] Add optimistic updates to status toggle for instant UI feedback

### Phase 4 — UI Components (Day 4–5)

- [ ] Build `<StatusBadge>` (green/amber variants)
- [ ] Build `<TodoContextMenu>` (Edit · Mark Complete/Pending · Delete)
- [ ] Build `<TodoItem>` row (content + clock icon + badge + menu)
- [ ] Build `<CreateTodoModal>` with form validation and date picker
- [ ] Build `<TodosWidget>` dashboard card (preview mode, 3 items + See More)
- [ ] Build `<TodosPage>` full list with filter bar and pagination

### Phase 5 — Integration & Polish (Day 6)

- [ ] Wire `+ Add New` button on widget header and page header to modal
- [ ] Wire `See More` to `/dashboard/todos` route
- [ ] Integrate `useCreateTodo` / `useDeleteTodo` / `useUpdateTodoStatus` into components
- [ ] Add loading skeletons for widget and full page
- [ ] Add empty state: *"No to-dos yet. Click + Add New to get started."*
- [ ] Add toast notifications for create / update / delete actions

### Phase 6 — Reminder Job (Optional, Day 7)

- [ ] Add `reminded` column to todos schema + migration
- [ ] Implement `reminderJob.ts` with `node-cron`
- [ ] Implement `sendReminderNotification` (in-app toast via WebSocket or SSE)
- [ ] Register job in `server/index.ts` on app startup
- [ ] Test: create todo with reminder 2 minutes in future → confirm notification fires

---

## 9. Folder Structure

```
school-nexus/
├── client/src/
│   ├── components/
│   │   └── todos/
│   │       ├── TodosWidget.tsx           // Dashboard card
│   │       ├── TodoItem.tsx              // Single row
│   │       ├── StatusBadge.tsx           // Completed | Pending badge
│   │       ├── TodoContextMenu.tsx       // Three-dot dropdown
│   │       └── CreateTodoModal.tsx       // Create/Edit modal
│   ├── pages/
│   │   └── TodosPage.tsx                 // Full list at /dashboard/todos
│   ├── hooks/
│   │   └── useTodos.ts                   // React Query hooks
│   └── lib/api/
│       └── todos.ts                      // API client functions
│
└── server/
    ├── routes/
    │   └── todos.routes.ts
    ├── controllers/
    │   └── todos.controller.ts
    ├── services/
    │   └── todos.service.ts
    ├── validators/
    │   └── todos.validators.ts
    ├── jobs/
    │   └── reminderJob.ts                // Optional cron job
    └── db/schema/
        └── todos.ts
```

---

## 10. Security Considerations

| Risk | Mitigation |
|------|-----------|
| IDOR — user reads another's todo | All queries include `WHERE user_id = :userId` |
| Unauthenticated access | `requireAuth` middleware on entire `/api/todos` router |
| XSS via todo content | Content rendered as text (not `innerHTML`); sanitized server-side |
| Unbounded list requests | `limit` capped at 100 in service layer |
| Reminder spam / DoS | `reminded` flag prevents repeated triggers; rate limit on POST |

---

*Generated for School-Nexus — Senior Full-Stack Implementation Plan v1.0*
