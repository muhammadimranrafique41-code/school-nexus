import { db } from "../db.js";
import { and, desc, eq, count } from "drizzle-orm";
import { todos, type TodoStatus, type TodoPriority } from "../../shared/schema.js";
import { z } from "zod";

const parseDateSafe = (val: unknown): Date | undefined => {
  if (val === "" || val === null || val === undefined) return undefined;
  if (typeof val !== "string") return undefined;
  const d = new Date(val);
  return isNaN(d.getTime()) ? undefined : d;
};

const reminderAtSchema = z.preprocess(
  parseDateSafe,
  z.date().optional(),
);

export const CreateTodoSchema = z.object({
  content: z.string().min(1, "Content is required").max(500, "Max 500 characters"),
  reminderAt: reminderAtSchema,
});

export const UpdateTodoSchema = z.object({
  content: z.string().min(1).max(500).optional(),
  status: z.enum(["pending", "completed"]).optional(),
  reminderAt: reminderAtSchema,
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: "At least one field must be provided" },
);

export type CreateTodoInput = z.infer<typeof CreateTodoSchema>;
export type UpdateTodoInput = z.infer<typeof UpdateTodoSchema>;

export async function getMyTodos(
  userId: number,
  options: { page: number; limit: number; status?: string },
) {
  const { page, limit, status } = options;
  const offset = (page - 1) * limit;

  const whereConditions = [eq(todos.assignedTo, userId)];
  if (status) {
    whereConditions.push(eq(todos.status, status as TodoStatus));
  }

  const [rows, [{ total }]] = await Promise.all([
    db.select().from(todos)
      .where(and(...whereConditions))
      .orderBy(desc(todos.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(todos).where(and(...whereConditions)),
  ]);

  return {
    data: rows,
    total: Number(total),
    page,
    totalPages: Math.ceil(Number(total) / limit),
  };
}

export async function createTodo(userId: number, input: CreateTodoInput) {
  const [todo] = await db.insert(todos).values({
    title: input.content,
    description: null,
    assignedTo: userId,
    assignedBy: userId,
    classId: null,
    dueDate: input.reminderAt ?? null,
    status: "pending" as TodoStatus,
    priority: "medium" as TodoPriority,
  }).returning();
  return todo;
}

export async function updateTodo(userId: number, todoId: number, input: UpdateTodoInput) {
  type TodoUpdate = Partial<typeof todos.$inferInsert>;
  const updateData: TodoUpdate = { updatedAt: new Date() };
  if (input.content !== undefined) updateData.title = input.content;
  if (input.status !== undefined) {
    updateData.status = input.status as TodoStatus;
    if (input.status === "completed") {
      updateData.completedAt = new Date();
    } else {
      updateData.completedAt = null;
    }
  }
  if (input.reminderAt !== undefined) {
    updateData.dueDate = input.reminderAt ?? null;
  }

  const [updated] = await db
    .update(todos)
    .set(updateData)
    .where(and(eq(todos.id, todoId), eq(todos.assignedTo, userId)))
    .returning();

  return updated ?? null;
}

export async function deleteTodo(userId: number, todoId: number) {
  await db
    .delete(todos)
    .where(and(eq(todos.id, todoId), eq(todos.assignedTo, userId)));
}
