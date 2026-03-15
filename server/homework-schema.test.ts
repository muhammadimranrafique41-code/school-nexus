import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CreateHomeworkSchema,
  UpdateHomeworkSchema,
  GradeSubmissionSchema,
  HomeworkListQuerySchema,
} from "../schemas/homework.schema.js";

const futureDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 3);
  return date.toISOString().slice(0, 10);
};

test("CreateHomeworkSchema rejects past due dates", () => {
  const result = CreateHomeworkSchema.safeParse({
    classId: 1,
    subject: "Mathematics",
    title: "Chapter 1",
    description: "Practice problems",
    dueDate: "2000-01-01",
    priority: "medium",
    files: [],
  });
  assert.equal(result.success, false);
});

test("CreateHomeworkSchema accepts valid payloads", () => {
  const result = CreateHomeworkSchema.safeParse({
    classId: 1,
    subject: "Mathematics",
    title: "Chapter 1",
    description: "Practice problems",
    dueDate: futureDate(),
    priority: "high",
    files: ["homework/sample.pdf"],
  });
  assert.equal(result.success, true);
});

test("UpdateHomeworkSchema allows partial updates", () => {
  const result = UpdateHomeworkSchema.safeParse({
    title: "Updated title",
  });
  assert.equal(result.success, true);
});

test("GradeSubmissionSchema enforces marks range", () => {
  const tooHigh = GradeSubmissionSchema.safeParse({ marks: 120, feedback: "Great work" });
  const tooLow = GradeSubmissionSchema.safeParse({ marks: -2, feedback: "Review" });
  assert.equal(tooHigh.success, false);
  assert.equal(tooLow.success, false);
});

test("HomeworkListQuerySchema provides defaults", () => {
  const result = HomeworkListQuerySchema.parse({});
  assert.equal(result.page, 1);
  assert.equal(result.limit, 20);
});
