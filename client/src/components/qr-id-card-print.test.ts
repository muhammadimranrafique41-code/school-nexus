import assert from "node:assert/strict";
import test from "node:test";

import { buildIdCardPortraitProxyUrl } from "./qr-id-card-portrait";
import { buildStudentIdCardPrintHtml, normalizeStudentPortraitUrl, type StudentIdCardData } from "./qr-student-id-card";
import { buildTeacherIdCardPrintHtml, normalizeTeacherPortraitUrl, type TeacherIdCardData } from "./qr-teacher-id-card";

const studentCard: StudentIdCardData = {
  schoolName: "School Nexus Academy",
  shortName: "SNA",
  motto: "Discipline, excellence, and integrity.",
  studentName: "Amina Yusuf",
  className: "JSS 2 Gold",
  fatherName: "Ibrahim Yusuf",
  publicId: "SNX-STU-2026-0001",
  qrUrl: "data:image/png;base64,student-qr",
  portraitUrl: null,
  isActive: true,
  academicYear: "2025/2026",
  currentTerm: "Second Term",
  authenticityLine: "This student ID is issued by School Nexus Academy.",
};

const teacherCard: TeacherIdCardData = {
  schoolName: "School Nexus Academy",
  shortName: "SNA",
  motto: "Discipline, excellence, and integrity.",
  teacherName: "Grace Okafor",
  designation: "Faculty Member",
  department: "Academic Affairs",
  subject: "General Studies",
  employeeId: "SNX-TCH-2026-0008",
  publicId: "SNX-TQR-2026-0008",
  qrUrl: "data:image/png;base64,teacher-qr",
  portraitUrl: null,
  isActive: true,
  academicYear: "2025/2026",
  currentTerm: "Second Term",
  authenticityLine: "This teacher ID is issued by School Nexus Academy.",
};

test("student print builder outputs a standard single-page print layout", () => {
  const html = buildStudentIdCardPrintHtml({
    ...studentCard,
    portraitUrl: "https://cdn.school.edu/photos/amina.pnghttps://cdn.school.edu/photos/amina-backup.jpeg",
  });

  assert.equal(html.includes("@page { margin: 12mm; }"), true);
  assert.equal(html.includes("size: 54mm 86mm"), false);
  assert.equal(html.includes("max-width: 148mm;"), true);
  assert.equal(html.includes("page-break-inside: avoid;"), true);
  assert.equal(html.includes("Secure Attendance Credential"), true);
  assert.equal(html.includes("Balanced quiet space is preserved for dependable scan performance."), true);
  assert.equal(html.includes('src="https://cdn.school.edu/photos/amina.png"'), true);
  assert.equal(html.includes('referrerpolicy="no-referrer"'), true);
  assert.equal(html.includes(studentCard.publicId), true);
  assert.equal(html.includes("await image.decode();"), true);
  assert.equal(html.includes("requestAnimationFrame(() => requestAnimationFrame(resolve))"), true);
  assert.equal(html.includes("setTimeout(() => window.print(), 120);"), true);
});

test("student portrait normalization keeps the first usable URL and rejects invalid input", () => {
  assert.equal(
    normalizeStudentPortraitUrl(" https://cdn.school.edu/photos/amina.pnghttps://cdn.school.edu/photos/amina-backup.jpeg "),
    "https://cdn.school.edu/photos/amina.png",
  );
  assert.equal(normalizeStudentPortraitUrl("not-a-url"), null);
});

test("teacher print builder keeps teacher-specific content inside the upgraded print layout", () => {
  const html = buildTeacherIdCardPrintHtml({
    ...teacherCard,
    portraitUrl: "https://cdn.school.edu/photos/grace.pnghttps://cdn.school.edu/photos/grace-backup.jpeg",
  });

  assert.equal(html.includes("@page { margin: 12mm; }"), true);
  assert.equal(html.includes("size: 54mm 86mm"), false);
  assert.equal(html.includes("max-width: 148mm;"), true);
  assert.equal(html.includes("Secure Staff Attendance Credential"), true);
  assert.equal(html.includes(teacherCard.designation), true);
  assert.equal(html.includes(teacherCard.department), true);
  assert.equal(html.includes(teacherCard.subject), true);
  assert.equal(html.includes(teacherCard.employeeId), true);
  assert.equal(html.includes("one clean printable page"), true);
  assert.equal(html.includes('src="https://cdn.school.edu/photos/grace.png"'), true);
  assert.equal(html.includes('referrerpolicy="no-referrer"'), true);
  assert.equal(html.includes("await image.decode();"), true);
  assert.equal(html.includes("requestAnimationFrame(() => requestAnimationFrame(resolve))"), true);
  assert.equal(html.includes("setTimeout(() => window.print(), 120);"), true);
});

test("teacher portrait normalization keeps the first usable URL and rejects invalid input", () => {
  assert.equal(
    normalizeTeacherPortraitUrl(" https://cdn.school.edu/photos/grace.pnghttps://cdn.school.edu/photos/grace-backup.jpeg "),
    "https://cdn.school.edu/photos/grace.png",
  );
  assert.equal(normalizeTeacherPortraitUrl("not-a-url"), null);
});

test("portrait proxy builder rewrites external portrait URLs to a same-origin QR proxy route", () => {
  assert.equal(
    buildIdCardPortraitProxyUrl("https://cdn.school.edu/photos/grace.png", "https://app.school.edu"),
    "https://app.school.edu/api/qr-attendance/portrait-proxy?url=https%3A%2F%2Fcdn.school.edu%2Fphotos%2Fgrace.png",
  );
  assert.equal(
    buildIdCardPortraitProxyUrl("https://app.school.edu/uploads/grace.png", "https://app.school.edu"),
    "https://app.school.edu/uploads/grace.png",
  );
  assert.equal(
    buildIdCardPortraitProxyUrl("https://cdn.school.edu/photos/grace.pnghttps://cdn.school.edu/photos/backup.png", "https://app.school.edu"),
    "https://app.school.edu/api/qr-attendance/portrait-proxy?url=https%3A%2F%2Fcdn.school.edu%2Fphotos%2Fgrace.png",
  );
});