import puppeteer from "puppeteer";
import { getStudentMarksheetData, type StudentMarksheetData } from "./examService.js";

export type SchoolInfo = {
  name: string;
  address: string;
  phone: string;
};

const escapeHtml = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const defaultSchoolInfo: SchoolInfo = {
  name: "School Nexus",
  address: "",
  phone: "",
};

function renderMarksheet(data: StudentMarksheetData, schoolInfo: SchoolInfo): string {
  const status = data.result.isPassed ? `PASSED - ${data.result.division}` : "FAIL";
  const attendance = data.attendance;
  return `
    <section class="marksheet">
      <header class="letterhead">
        <div class="logo-box">LOGO</div>
        <div>
          <h1>${escapeHtml(schoolInfo.name).toUpperCase()}</h1>
          <p>${escapeHtml(schoolInfo.address)}</p>
          <p>${escapeHtml(schoolInfo.phone)}</p>
          <h2>${escapeHtml(data.examSession.title)} - Marksheet</h2>
        </div>
      </header>

      <table class="info">
        <tbody>
          <tr><th>Name</th><td>${escapeHtml(data.student.name)}</td><th>Father's Name</th><td>${escapeHtml(data.student.fatherName)}</td></tr>
          <tr><th>Roll No.</th><td>${escapeHtml(data.student.rollNo)}</td><th>Admission No.</th><td>${escapeHtml(data.student.admissionNo)}</td></tr>
          <tr><th>Class</th><td>${escapeHtml(data.student.className)}</td><th>Section</th><td>${escapeHtml(data.student.section)}</td></tr>
        </tbody>
      </table>

      <table class="subjects">
        <thead>
          <tr>
            <th>Sr</th><th>Subject</th><th>Max Theory</th><th>Max Practical</th><th>Max Total</th>
            <th>Theory Obtained</th><th>Practical Obtained</th><th>Total Obtained</th><th>Grade</th><th>Remarks</th>
          </tr>
        </thead>
        <tbody>
          ${data.subjects
            .map(
              (subject) => `
                <tr>
                  <td>${subject.sr}</td>
                  <td>${escapeHtml(subject.subjectName)}</td>
                  <td>${subject.maxTheory}</td>
                  <td>${subject.maxPractical}</td>
                  <td>${subject.maxTotal}</td>
                  <td>${subject.isAbsent ? "ABSENT" : subject.theoryObtained ?? ""}</td>
                  <td>${subject.isAbsent ? "ABSENT" : subject.practicalObtained ?? ""}</td>
                  <td>${subject.isAbsent ? "ABSENT" : subject.totalObtained ?? ""}</td>
                  <td>${subject.grade ?? ""}</td>
                  <td>${escapeHtml(subject.remarks ?? "")}</td>
                </tr>`
            )
            .join("")}
        </tbody>
        <tfoot>
          <tr><td colspan="4">Grand Total</td><td>${data.result.totalMaxMarks}</td><td colspan="2"></td><td>${data.result.totalObtained}</td><td>${data.result.grade}</td><td></td></tr>
        </tfoot>
      </table>

      <div class="result-grid">
        <div><strong>Total</strong><span>${data.result.totalObtained}/${data.result.totalMaxMarks}</span></div>
        <div><strong>Percentage</strong><span>${data.result.percentage}%</span></div>
        <div><strong>Grade + GPA</strong><span>${data.result.grade} (${data.result.gpaPoints})</span></div>
        <div><strong>Position</strong><span>${data.result.positionInClass || "-"}</span></div>
      </div>
      <div class="status">${escapeHtml(status)}</div>
      <table class="attendance">
        <tbody>
          <tr>
            <th>Total Days</th><td>${attendance?.totalDays ?? "-"}</td>
            <th>Present</th><td>${attendance?.presentDays ?? "-"}</td>
            <th>Absent</th><td>${attendance?.absentDays ?? "-"}</td>
            <th>Percentage</th><td>${attendance ? `${attendance.percentage}%` : "-"}</td>
          </tr>
        </tbody>
      </table>
      <footer class="signatures">
        <div>Class Teacher</div>
        <div class="stamp">Official School Stamp</div>
        <div>Principal</div>
      </footer>
    </section>`;
}

function renderDocument(markSheets: string[], bulk: boolean): string {
  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        @page { size: A4 portrait; margin: 8mm; }
        * { box-sizing: border-box; }
        body { margin: 0; color: #000; font-family: Arial, "Noto Nastaliq Urdu", sans-serif; background: #fff; }
        .page { page-break-after: always; min-height: ${bulk ? "281mm" : "281mm"}; display: flex; flex-direction: column; gap: 4mm; }
        .page:last-child { page-break-after: auto; }
        .marksheet { border: 1.5pt solid #000; padding: 4mm; height: ${bulk ? "136mm" : "281mm"}; overflow: hidden; }
        .cut-line { border-top: 1pt dashed #000; height: 0; margin: 1mm 0; }
        .letterhead { display: grid; grid-template-columns: 18mm 1fr; gap: 4mm; align-items: center; text-align: center; border-bottom: 1pt solid #000; padding-bottom: 2mm; }
        .logo-box { width: 16mm; height: 16mm; border: 1pt solid #000; display: flex; align-items: center; justify-content: center; font-size: 8pt; }
        h1 { margin: 0; font-size: ${bulk ? "13pt" : "18pt"}; font-weight: 700; letter-spacing: 0; }
        h2 { margin: 1mm 0 0; font-size: ${bulk ? "9pt" : "12pt"}; }
        p { margin: 0.5mm 0; font-size: ${bulk ? "7pt" : "9pt"}; }
        table { width: 100%; border-collapse: collapse; margin-top: 2mm; }
        th, td { border: 1pt solid #000; padding: ${bulk ? "0.8mm" : "1.4mm"}; font-size: ${bulk ? "6.8pt" : "9pt"}; vertical-align: middle; }
        th { font-weight: 700; text-align: left; }
        .subjects th, .subjects td { text-align: center; }
        .subjects td:nth-child(2), .subjects th:nth-child(2) { text-align: left; }
        tfoot td { font-weight: 700; }
        .result-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; margin-top: 2mm; border: 1pt solid #000; }
        .result-grid div { border-right: 1pt solid #000; padding: ${bulk ? "1mm" : "2mm"}; text-align: center; }
        .result-grid div:last-child { border-right: 0; }
        .result-grid strong, .result-grid span { display: block; font-size: ${bulk ? "7pt" : "9pt"}; }
        .status { margin-top: 2mm; border: 1.5pt solid #000; padding: ${bulk ? "1mm" : "2mm"}; text-align: center; font-weight: 700; font-size: ${bulk ? "9pt" : "12pt"}; }
        .signatures { display: grid; grid-template-columns: 1fr 36mm 1fr; gap: 8mm; align-items: end; margin-top: ${bulk ? "2mm" : "8mm"}; font-size: ${bulk ? "7pt" : "9pt"}; text-align: center; }
        .signatures > div:not(.stamp) { border-top: 1pt solid #000; padding-top: 1mm; }
        .stamp { height: ${bulk ? "14mm" : "22mm"}; border: 1pt solid #000; display: flex; align-items: center; justify-content: center; }
      </style>
    </head>
    <body>
      ${bulk ? renderBulkPages(markSheets) : `<div class="page">${markSheets.join("")}</div>`}
    </body>
  </html>`;
}

function renderBulkPages(markSheets: string[]): string {
  const pages: string[] = [];
  for (let index = 0; index < markSheets.length; index += 2) {
    pages.push(`<div class="page">${markSheets[index]}<div class="cut-line"></div>${markSheets[index + 1] ?? ""}</div>`);
  }
  return pages.join("");
}

async function renderPdf(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const output = await page.pdf({ format: "A4", printBackground: false, margin: { top: "8mm", right: "8mm", bottom: "8mm", left: "8mm" } });
    return Buffer.from(output);
  } finally {
    await browser.close();
  }
}

export async function generateSingleMarksheetPDF(examSessionId: number, studentId: number, schoolInfo: Partial<SchoolInfo> = {}): Promise<Buffer> {
  const data = await getStudentMarksheetData(examSessionId, studentId);
  const info = { ...defaultSchoolInfo, ...schoolInfo };
  return renderPdf(renderDocument([renderMarksheet(data, info)], false));
}

export async function generateBulkMarksheetPDF(examSessionId: number, studentIds: number[], schoolInfo: Partial<SchoolInfo> = {}): Promise<Buffer> {
  const info = { ...defaultSchoolInfo, ...schoolInfo };
  const data = await Promise.all(studentIds.map((studentId) => getStudentMarksheetData(examSessionId, studentId)));
  return renderPdf(renderDocument(data.map((item) => renderMarksheet(item, info)), true));
}
