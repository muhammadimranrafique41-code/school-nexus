export type ExamSubject = {
  id: number;
  examSessionId: number;
  subjectName: string;
  subjectCode: string | null;
  maxTheoryMarks: number;
  maxPracticalMarks: number;
  examDate: string;
  examTime: string | null;
  venue: string | null;
  sortOrder: number;
};

export type ExamSession = {
  id: number;
  academicSessionId: number;
  classId: number;
  examType: "MAT" | "HALF_YEARLY" | "ANNUAL";
  monthLabel: string | null;
  title: string;
  startDate: string;
  endDate: string;
  totalMarks: number;
  passingMarks: number;
  isResultDeclared: boolean;
  className: string;
  academicYear: string;
  subjects: ExamSubject[];
};

export type ExamStatistics = {
  examSessionId: number;
  totalStudents: number;
  appeared: number;
  absent: number;
  classAverage: number;
  highestMarks: number;
  lowestMarks: number;
  passCount: number;
  failCount: number;
  passRate: number;
  gradeDistribution: Record<string, number>;
  topThree: { rank: number; studentId: number; name: string; obtained: number; percentage: number; grade: string }[];
  subjectAverages: { subjectName: string; average: number; highest: number; lowest: number }[];
};

export type MarkEntryStudent = {
  studentId: number;
  name: string;
  rollNo: string;
  theoryMarks: number | null;
  practicalMarks: number | null;
  totalObtained: number | null;
  grade: string | null;
  isAbsent: boolean;
  remarks: string | null;
};

export type MATAggregate = {
  studentId: number;
  name: string;
  rollNo: string;
  monthlyScores: { month: string; obtained: number; maxMarks: number; percentage: number }[];
  bestNScores: number[];
  aggregateMarks: number;
};

export type ApiResponse<T> = { success: boolean; data: T };
