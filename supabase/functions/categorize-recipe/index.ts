import "@supabase/functions-js/edge-runtime.d.ts";

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_CATEGORIES = [
  "Salad",
  "Fry",
  "Sauces",
  "BBQ",
  "Grill",
  "Sautee",
  "Add-Ons",
  "Uncategorized"
];

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { text, categories } = await req.json();

    if (!text || typeof text !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing 'text' field" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Default to the old categories if none provided, for backward compatibility
    let allowedCategories = Array.isArray(categories) && categories.length > 0
      ? categories
      : ALLOWED_CATEGORIES;

    // RULE: Only allow "Add-Ons" if "Add" is in the file name
    const fileMatch = text.match(/File:\s*([^\n]+)/);
    const fileName = fileMatch ? fileMatch[1].toLowerCase() : "";
    if (!fileName.includes("add")) {
      allowedCategories = allowedCategories.filter((c: string) => c.toLowerCase() !== "add-ons");
    }

    const systemPrompt = `You are an expert culinary categorization assistant. 
You will be given raw text extracted from a restaurant recipe workbook (Excel file). 
Your ONLY job is to determine which of the following categories this recipe belongs to:
${allowedCategories.join(", ")}

Respond with a comma-separated list of applicable categories from the list above (up to a maximum of 3). Do not include any other text, punctuation, or explanation.
If you cannot determine the category, respond with "Uncategorized".

RECIPE TEXT TO CATEGORIZE:
${text.substring(0, 1500)} // Analyze up to first 1500 chars to avoid token limits
`;

    // Call Gemini
    const geminiRes = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: systemPrompt }],
          },
        ],
        generationConfig: {
          temperature: 0.1, // Low temp for more deterministic output
          maxOutputTokens: 1000,
        },
      }),
    });

    const geminiData = await geminiRes.json();
    console.log("Gemini API Response:", JSON.stringify(geminiData));

    if (!geminiRes.ok) {
      console.error("Gemini API Error:", geminiData);
      return new Response(JSON.stringify({ category: ["Uncategorized"], error: "Gemini API Error", details: geminiData }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawCategory = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "Uncategorized";

    // Because we asked for comma separated, split and clean.
    const rawCategories = rawCategory.split(',').map((c: string) => c.trim().replace(/[^a-zA-Z- ]/g, ""));

    const finalCategories: string[] = [];
    rawCategories.forEach((cat: string) => {
      const matchedCategory = allowedCategories.find((c: string) => c.toLowerCase() === cat.toLowerCase());
      if (matchedCategory && !finalCategories.includes(matchedCategory)) {
        finalCategories.push(matchedCategory);
      }
    });

    if (finalCategories.length === 0) {
      finalCategories.push("Uncategorized");
    }

    console.log(`Raw: "${rawCategory}", Final: ${JSON.stringify(finalCategories)}`);

    return new Response(JSON.stringify({ category: finalCategories }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
