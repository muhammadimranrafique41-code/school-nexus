const FAMILY_HEADERS = [
  "family_name",
  "guardian_name",
  "phone",
  "email",
  "address",
  "cnic",
];

const STUDENT_HEADERS = [
  "name",
  "email",
  "password",
  "class_name",
  "father_name",
  "roll_number",
  "date_of_birth",
  "gender",
  "phone",
  "address",
  "family_cnic",
];

export function downloadSampleCsv(type: "families" | "students") {
  const headers = type === "families" ? FAMILY_HEADERS : STUDENT_HEADERS;
  const exampleRow = headers.map((h) => {
    const examples: Record<string, string> = {
      family_name: "Smith Family",
      guardian_name: "John Smith",
      phone: "0300-1234567",
      email: "john@example.com",
      address: "123 Main Street, City",
      cnic: "12345-1234567-1",
      name: "Ali Khan",
      password: "temp123456",
      class_name: "Grade 5-A",
      father_name: "Mohammad Khan",
      roll_number: "SCH-2025-001",
      date_of_birth: "2012-05-15",
      gender: "male",
      family_cnic: "12345-1234567-1",
    };
    return examples[h] ?? "example";
  });
  const csv = [headers.join(","), exampleRow.join(",")].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `sample_${type}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
