import fs from "fs";
import { fetch } from "undici"; // Node 18+ has global fetch, but just in case

async function run() {
  console.log("Opening session...");
  const sessionRes = await fetch("http://127.0.0.1:43123/api/session", { method: "POST" });
  const sessionData = await sessionRes.json();
  console.log("Session:", sessionData);
  
  if (!sessionData.sessionId) {
      console.log("No session ID, cannot run turn");
      return;
  }
  
  console.log("Running turn...");
  const turnRes = await fetch("http://127.0.0.1:43123/api/turn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: sessionData.sessionId,
      message: "HITL_SMOKE. Pause for approval. Do not read a CSV."
    })
  });
  
  console.log("Turn status:", turnRes.status);
  const text = await turnRes.text();
  console.log("Turn body:", text.substring(0, 500) + (text.length > 500 ? "..." : ""));
}

run().catch(console.error);
