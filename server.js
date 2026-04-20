import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

let currentKeyIndex = 0;

// Read comma-separated keys, fallback to single GROQ_API_KEY if needed.
const getApiKeys = () => {
  if (process.env.GROQ_API_KEYS) {
    return process.env.GROQ_API_KEYS.split(',').map(k => k.trim()).filter(k => k);
  } else if (process.env.GROQ_API_KEY) {
    return [process.env.GROQ_API_KEY.trim()];
  }
  return [];
};

app.post("/ask", async (req, res) => {
  const { prompt, systemPrompt } = req.body;
  const apiKeys = getApiKeys();

  if (apiKeys.length === 0) {
    return res.status(500).json({ error: "No Groq API keys configured on backend." });
  }

  let attempts = 0;
  let response = null;
  let lastError = null;

  while (attempts < apiKeys.length) {
    const activeKey = apiKeys[currentKeyIndex];
    console.log(`[API Call] Using key index: ${currentKeyIndex}`);
    
    try {
      response = await axios.post(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          model: "llama-3.1-8b-instant",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt }
          ]
        },
        {
          headers: {
            Authorization: `Bearer ${activeKey}`,
            "Content-Type": "application/json"
          }
        }
      );
      
      // Request successful, break the retry loop
      break; 
      
    } catch (err) {
      lastError = err;
      if (err.response && (err.response.status === 429 || err.response.status === 401)) {
        console.warn(`⚠️ Key index ${currentKeyIndex} hit an error (${err.response.status}). Rotating...`);
        // Move to the next key in the pool
        currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
        attempts++;
      } else {
        console.error("❌ Underlying API error:", err.message);
        break; // break immediately for non-rate-limit/auth errors
      }
    }
  }

  if (response) {
    return res.json({
      reply: response.data.choices[0].message.content
    });
  } else {
    // If we exhausted all keys or hit an immediate fail
    const errorMessage = lastError?.response?.data?.error?.message 
      || lastError?.message 
      || "Failed after rotating through all API keys.";
      
    return res.status(lastError?.response?.status || 500).json({ error: errorMessage });
  }
});

app.get("/", (req, res) => {
  res.send("🚀 A2Z AI Backend is running!");
});

app.listen(3000, () => {
  console.log("🚀 Server running on port 3000");
});