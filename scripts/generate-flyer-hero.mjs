import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const envPath = "C:/Users/Arfa/Desktop/.env";
const outputPath = path.resolve("client/public/flyer-assets/hero.png");
const prompt = [
  "Use case: ads-marketing.",
  "Asset type: portrait accent image for a premium martial arts school print flyer.",
  "Primary request: a clean silhouette of a martial artist delivering a taekwondo high kick, premium, dynamic, dramatic but tasteful.",
  "Composition: portrait, subject on the right side with generous calm negative space on the left, enough breathing room around the full figure.",
  "Lighting and mood: high contrast, controlled studio drama, athletic confidence.",
  "Color palette: deep navy with restrained subtle gold highlights and a nearly black navy backdrop.",
  "Constraints: no text, no lettering, no logos, no watermark, no crowd, no border."
].join(" ");

function apiKeyFromEnv(raw) {
  const match = raw.match(/^OPENAI_API_KEY\s*=\s*[\"']?([^\"'\r\n]+)[\"']?\s*$/m);
  if (!match) throw new Error("OPENAI_API_KEY was not found in the local .env file.");
  return match[1].trim();
}

async function generate(model, apiKey) {
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      prompt,
      size: "1024x1536",
      quality: "high",
      output_format: "png"
    })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || `Image API returned ${response.status}`);
  const encoded = payload?.data?.[0]?.b64_json;
  if (!encoded) throw new Error("Image API response did not include PNG data.");
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, Buffer.from(encoded, "base64"));
  return model;
}

const apiKey = apiKeyFromEnv(await readFile(envPath, "utf8"));
let modelUsed;
try {
  modelUsed = await generate("gpt-image-2", apiKey);
} catch (firstError) {
  console.warn(`gpt-image-2 failed: ${firstError.message}. Retrying with gpt-image-1.`);
  modelUsed = await generate("gpt-image-1", apiKey);
}
console.log(`Saved ${outputPath} with ${modelUsed}.`);
