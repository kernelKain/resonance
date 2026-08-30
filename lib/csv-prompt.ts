import { MAX_ANALYZED_REVIEWS } from "@/lib/csv";

export const CSV_GENERATOR_PROMPT = `You are generating a reviews CSV for Resonance, a customer-emotion analysis tool.

Ask me for the product or website URL if I have not already given one. Then research that product (public reviews, Reddit, app-store comments, support threads) and produce a CSV file I can download.

CSV rules:
- UTF-8, comma-separated, header row required.
- Required column: review_text
- Optional columns: rating (integer 1-5), date (ISO 8601 or YYYY-MM-DD), author
- Exactly ${MAX_ANALYZED_REVIEWS} rows. Prefer short reviews: 1-2 sentences, at most 400 characters.
- Quote any field that contains commas, quotes, or newlines. Escape quotes as "".
- Do not wrap the file in a markdown table or a code fence. Offer a real .csv download.

Content rules:
- Mix ratings. Include 5-star raves, 3-4 star "it's fine" resignation, and 1-2 star complaints.
- Include polite-but-unhappy wording ("fine I guess", "it works", "not bad") and mixed signals ("I love it but I probably won't renew").
- Ground complaints in the actual product: reliability, pricing, onboarding, support, missing power-user features, community, roadmap.
- Invent plausible dates in the last 18 months and varied author names. Do not copy private personal data.
- review_text must be the customer's words, not a summary.

After the file is ready, tell me the filename and the column headers you used.`;

export async function copyCsvGeneratorPrompt(): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(CSV_GENERATOR_PROMPT);
    return true;
  } catch {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = CSV_GENERATOR_PROMPT;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand("copy");
      textarea.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
