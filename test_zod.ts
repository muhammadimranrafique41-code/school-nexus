import { z } from "zod";

const parseDateSafe = (val: unknown): Date | undefined => {
  if (val === "" || val === null || val === undefined) return undefined;
  if (typeof val !== "string") return undefined;
  const d = new Date(val);
  return isNaN(d.getTime()) ? undefined : d;
};

const reminderAtSchema = z.preprocess(parseDateSafe, z.date().optional());

const tests = [
  { name: "null", value: null },
  { name: '"" (empty string)', value: "" },
  { name: '"2026-05-13T14:30" (valid)', value: "2026-05-13T14:30" },
  { name: "undefined", value: undefined },
];

for (const t of tests) {
  try {
    const result = reminderAtSchema.parse(t.value);
    console.log(`PASS: ${t.name} =>`, result);
  } catch (e: any) {
    console.log(`FAIL: ${t.name} =>`, e.message);
  }
}

// Full schema test
const CreateTodoSchema = z.object({
  content: z.string().min(1, "Content is required").max(500),
  reminderAt: reminderAtSchema,
});

const fullTests = [
  { name: "null reminder", value: { content: "test", reminderAt: null } },
  { name: '"" reminder', value: { content: "test", reminderAt: "" } },
  { name: "valid reminder", value: { content: "test", reminderAt: "2026-05-13T14:30" } },
  { name: "no reminder field", value: { content: "test" } },
];

for (const t of fullTests) {
  try {
    const result = CreateTodoSchema.parse(t.value);
    console.log(`PASS: ${t.name} =>`, JSON.stringify(result));
  } catch (e: any) {
    console.log(`FAIL: ${t.name} =>`, e.message);
  }
}
