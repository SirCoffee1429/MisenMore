import "jsr:@supabase/functions-js@^2.4.1/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Get the payload (expecting { pdfBase64, org_id } or multipart/form-data)
    let pdfBase64 = "";
    let orgId = "";
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
        const payload = await req.json();
        pdfBase64 = payload.pdfBase64;
        orgId = payload.org_id || "";
    } else {
        // Handle multipart fallback if needed
        const formData = await req.formData();
        const file = formData.get("file") as File;
        orgId = String(formData.get("org_id") || "");
        if (file) {
           const arrayBuffer = await file.arrayBuffer();
           const bytes = new Uint8Array(arrayBuffer);
           // Chunked base64 encoding to avoid stack overflow on large files
           let binary = "";
           const chunkSize = 8192;
           for (let i = 0; i < bytes.length; i += chunkSize) {
             const chunk = bytes.subarray(i, i + chunkSize);
             binary += String.fromCharCode(...chunk);
           }
           pdfBase64 = btoa(binary);
        }
    }

    if (!pdfBase64) {
      return new Response(JSON.stringify({ error: "No PDF content found" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (!orgId) {
      return new Response(JSON.stringify({ error: "Missing org_id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    console.log(`Starting BEO parsing via Gemini...`);

    // 2. Ask Gemini to parse the PDF for BEO details
    const prompt = `
      You are an expert at parsing Banquet Event Orders (BEOs).
      This PDF may contain ONE or MULTIPLE BEOs/events. Extract ALL of them.
      
      For EACH event found, extract:
      - Event Name (the title or name of the banquet/event)
      - Event Date (in YYYY-MM-DD format)
      - Start Time (e.g. "5:00 PM")
      - Guest Count (integer — look for "Guaranteed", "Expected", "# of Guests", or similar fields)
      - Food Items: ALL food, catering dishes, and beverages listed, with quantities

      IMPORTANT RULES:
      - ALWAYS return a JSON array, even if there is only one event. Example: [{ ... }]
      - Each element must have these keys: "event_name", "event_date", "start_time", "guest_count", "food_items"
      - "food_items" is an array of objects with keys "item" (string) and "quantity" (string or number)
      - If you cannot find a value, use null for strings and 0 for guest_count
      - Do NOT wrap in markdown code fences, return ONLY the JSON array
    `;

    const geminiRes = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: "application/pdf",
                  data: pdfBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          response_mime_type: "application/json",
        },
      }),
    });

    if (!geminiRes.ok) {
      const errorText = await geminiRes.text();
      console.error(`Gemini API error: ${errorText}`);
      throw new Error(`Gemini API Error: ${errorText}`);
    }

    const geminiData = await geminiRes.json();
    const rawOutput = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    
    // Log the raw output for debugging
    console.log(`Raw Gemini output: ${rawOutput}`);

    if (!rawOutput) {
      throw new Error("Gemini returned empty output");
    }

    let parsed = JSON.parse(rawOutput);

    // Normalize to always be an array
    if (!Array.isArray(parsed)) {
      parsed = [parsed];
    }

    console.log(`Parsed ${parsed.length} event(s) from BEO PDF`);

    // 3. Save each event to Supabase
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const insertedIds: string[] = [];

    for (const event of parsed) {
      const eventName = event.event_name || null;
      const eventDate = event.event_date || null;
      const guestCount = event.guest_count || 0;

      // Log a warning if we're getting empty data
      if (!eventName || !eventDate) {
        console.warn(`Warning: event missing data — name: ${eventName}, date: ${eventDate}, guests: ${guestCount}`);
      }

      console.log(`Inserting BEO: "${eventName}" on ${eventDate} for ${guestCount} guests with ${(event.food_items || []).length} food items`);

      const { data: record, error } = await supabase
        .from("banquet_event_orders")
        .insert({
            org_id: orgId,
            event_name: eventName || "Unknown Event",
            event_date: eventDate || new Date().toISOString().split("T")[0],
            start_time: event.start_time || "",
            guest_count: guestCount,
            food_items: event.food_items || [],
        })
        .select('id')
        .single();

      if (error) {
        console.error(`Error inserting event "${eventName}":`, error);
        throw error;
      }

      insertedIds.push(record.id);
    }

    console.log(`Successfully inserted ${insertedIds.length} BEO(s)`);

    return new Response(JSON.stringify({ success: true, count: insertedIds.length, ids: insertedIds }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Error processing BEO:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
