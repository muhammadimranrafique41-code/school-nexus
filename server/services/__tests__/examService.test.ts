import {
  bulkUpsertMarks,
  createExamSession,
  getGradeFromPercentage,
  getStudentMarksheetData,
} from "../examService.js";

describe("examService", () => {
  describe("createExamSession", () => {
    it.todo("creates an exam session with subjects");
    it.todo("throws a duplicate guard error for an existing class/type/month session");
  });

  describe("bulkUpsertMarks", () => {
    it.todo("upserts valid marks for a subject");
    it.todo("throws a validation error when marks exceed subject maximum");
    it.todo("stores absent students without obtained marks");
  });

  describe("getGradeFromPercentage", () => {
    it.todo("returns all seven grade ranges and boundary values");
  });

  describe("getStudentMarksheetData", () => {
    it.todo("returns complete marksheet data");
    it.todo("returns null attendance when attendance has not been recorded");
  });

  void createExamSession;
  void bulkUpsertMarks;
  void getGradeFromPercentage;
  void getStudentMarksheetData;
});
