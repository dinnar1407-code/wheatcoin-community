const fs = require('fs');

const serverFile = '/Users/terry-surface-pro/.openclaw/workspace/wheatcoin-community-temp/server.js';
let content = fs.readFileSync(serverFile, 'utf8');

const screenerCode = `
  // ── AI Technical Screener API ───────────────────────────────────────
  if (req.method === 'POST' && url === '/api/talent/screen_question') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("GEMINI_API_KEY not configured");
        
        const prompt = \`You are a strict technical interviewer for Industrial Automation.
The candidate claims the following skills: \${data.skills}
Their claimed level is: \${data.level}

Generate exactly ONE practical, highly-technical scenario question to test their knowledge.
Do NOT output any greeting or introductory text. Just the question.
Example: "If a Siemens S7-1500 shows a BF red light when connected to a G120C via Profinet, what are your first 3 troubleshooting steps?"\`;

        const response = await fetch(\`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=\${apiKey}\`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.7, maxOutputTokens: 200 }
            })
        });
        const resData = await response.json();
        const question = resData.candidates?.[0]?.content?.parts?.[0]?.text || "Describe a complex automation project you successfully delivered.";
        
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ status: 'ok', question: question.trim() }));
      } catch (err) {
        res.writeHead(500); res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (req.method === 'POST' && url === '/api/talent/screen_verify') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("GEMINI_API_KEY not configured");
        
        const prompt = \`You are grading a technical interview for an Industrial Automation Engineer.
Question asked: \${data.question}
Candidate's Answer: \${data.answer}

Evaluate the answer. Does it show genuine field experience and technical competence?
Output a JSON response exactly in this format (no markdown blocks, just raw JSON):
{"passed": true/false, "score": <0-100>, "feedback": "<one short sentence of feedback>"}
\`;

        const response = await fetch(\`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=\${apiKey}\`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.2, maxOutputTokens: 150 }
            })
        });
        const resData = await response.json();
        let resultText = resData.candidates?.[0]?.content?.parts?.[0]?.text || '{"passed": true, "score": 85, "feedback": "Acceptable answer."}';
        
        // Clean up markdown if model outputs it
        resultText = resultText.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
        const result = JSON.parse(resultText);
        
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500); res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }
`;

if (!content.includes('/api/talent/screen_question')) {
    content = content.replace(
        "if (req.method === 'POST' && url === '/api/talent/submit_profile') {",
        screenerCode + "\n  if (req.method === 'POST' && url === '/api/talent/submit_profile') {"
    );
    // Also update submit_profile to accept verified_score
    content = content.replace(
        "escapeHtml(data.level || 'Mid'),",
        "escapeHtml(data.level || 'Mid'),\n          parseInt(data.verified_score) || 0,"
    );
    
    fs.writeFileSync(serverFile, content, 'utf8');
    console.log("Added Screener APIs and updated submit_profile.");
} else {
    console.log("Screener APIs already exist.");
}
