import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

let aiClient: GoogleGenAI | null = null;

// Lazy initialization of the Gemini SDK client as per guidelines
function getAiClient(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is required. Please check that you have added your API key in the Secrets panel.");
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        }
      }
    });
  }
  return aiClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Serve larger payload configurations since sampling data can contain larger lists
  app.use(express.json({ limit: "20mb" }));

  // API router to analyze parsed headers and sample CSV contents using Gemini AI
  app.post("/api/analyze", async (req, res) => {
    try {
      const { fileName, fileSize, headers, rowCount, sampleRows, samplingUsed } = req.body;

      if (!headers || !Array.isArray(headers) || headers.length === 0) {
        return res.status(400).json({ error: "Invalid CSV columns. Headers must be defined." });
      }

      // Check if API client can be built
      let ai;
      try {
        ai = getAiClient();
      } catch (err: any) {
        return res.status(403).json({ error: err.message || "Missing GEMINI_API_KEY secret." });
      }

      const prompt = `
You are an expert data profiling agent and data scientist.
Analyze the following CSV dataset metadata and statistical samples to understand its column structure, datatypes, column meanings, and overall nature.

DATASET METADATA:
- File Name: "${fileName}"
- Total Row Count: ${rowCount.toLocaleString()} rows
- Total Columns: ${headers.length} columns
- Column Names: ${headers.join(", ")}
- Sampling Method Used: ${samplingUsed ? "Yes (statistical sampling was applied for efficiency)" : "No (full row scan)"}

REPRESENTATIVE SAMPLES (each row contains values in the column order):
${JSON.stringify(sampleRows, null, 2)}

YOUR INSTRUCTIONS:
1. Provide a concise, well-written paragraph explaining the apparent content, purpose, and overall nature of this dataset based on headers and sample rows.
2. For each identified column name, infer its logical data type from the headers and sample cells (e.g., "ID", "Date", "Numeric", "Boolean", "Category", "Text", "Currency", "Timestamp").
3. Summarize or infer the logical meaning/purpose of each column. Answer simply and with human-friendly descriptions.
4. If a column's header is obscure or its sample data is totally empty or ambiguous, you may label the meaning as "Indeterminate" or "Unknown" and assign confidence level "Unknown" or "Low".

Return a strictly validated JSON object conforming to your schema configuration.
`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              overallSummary: {
                type: Type.STRING,
                description: "A summary explaining the apparent content, purpose, and key attributes of the dataset based on header names and samples. Limit to a concise paragraph.",
              },
              dataGenre: {
                type: Type.STRING,
                description: "A brief genre, domain, or category of this data, e.g., 'E-Commerce Transactions', 'Patient Records', 'IoT Device Telemetry'."
              },
              columns: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING, description: "The original column name" },
                    inferredType: { type: Type.STRING, description: "Logical data type, e.g., 'ID', 'Date', 'Numeric', 'Boolean', 'Category', 'Text', 'Currency', 'Timestamp'" },
                    meaning: { type: Type.STRING, description: "Explains what the column represents in plain English. Keep it informative but concise." },
                    confidence: { type: Type.STRING, description: "Confidence of the inference: High, Medium, Low, or Unknown" }
                  },
                  required: ["name", "inferredType", "meaning", "confidence"]
                },
                description: "Detailed analysis of each column structure."
              }
            },
            required: ["overallSummary", "dataGenre", "columns"]
          }
        }
      });

      const text = response.text;
      if (!text) {
        return res.status(500).json({ error: "Empty response text received from Gemini models." });
      }

      const parsedResult = JSON.parse(text.trim());
      return res.json({
        fileName,
        fileSize,
        rowCount,
        columnCount: headers.length,
        columns: parsedResult.columns,
        overallSummary: parsedResult.overallSummary,
        dataGenre: parsedResult.dataGenre,
        samplingUsed
      });

    } catch (error: any) {
      console.error("Gemini API Error:", error);
      const msg = error.message || "An expected or unexpected error occurred while processing dataset insights.";
      return res.status(500).json({ error: msg });
    }
  });

  // Vite integration middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening at http://0.0.0.0:${PORT}`);
  });
}

startServer();
