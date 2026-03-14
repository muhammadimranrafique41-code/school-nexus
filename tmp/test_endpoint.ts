
import fetch from "node-fetch";

async function testEndpoint() {
  const url = "http://localhost:5000/api/v1/timetables/settings";
  console.log(`Testing endpoint: ${url}`);
  try {
    const res = await fetch(url);
    console.log(`Status: ${res.status}`);
    const text = await res.text();
    console.log(`Response: ${text.substring(0, 500)}`);
  } catch (err) {
    console.error("Fetch failed:", err.message);
  }
}

testEndpoint();
