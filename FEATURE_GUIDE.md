## Student and Teacher Core Features Guide

### Student section
- **My Attendance** shows a filterable attendance heatmap, attendance percentage gauge, monthly trend, export CSV, and a print-friendly report that can be saved as PDF from the browser print dialog.
- **My Timetable** shows the weekly schedule in matrix and day-wise views, with CSV export and print / Save as PDF support.
- **My Results** shows exam summaries, GPA / CGPA, grade distribution, performance trends, subject analytics, and printable result reports.

### Teacher section
- **Attendance** now supports class-based bulk marking, `Present / Absent / Late / Excused` statuses, session selection, remarks, duplicate-safe saves, and editing of historical records.

### Notes
- Existing routes remain available, including `/student/grades` as a compatibility alias for the new results page.
- To generate a PDF report, use the page **Print / Save PDF** action and choose **Save as PDF** in the browser print dialog.
- If you added the new timetable table or richer attendance / result fields to the schema, run `npm run db:push` before full runtime testing against a real database.