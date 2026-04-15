import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@^2";

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { workbook_id } = await req.json();

    if (!workbook_id) {
      return new Response(JSON.stringify({ error: "Missing workbook_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: chunks, error } = await supabase
      .from("workbook_chunks")
      .select("id, content")
      .eq("workbook_id", workbook_id)
      .is("embedding", null);

    if (error) throw new Error(error.message);
    if (!chunks || chunks.length === 0) {
      return new Response(JSON.stringify({ message: "No chunks to embed", embedded: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Embedding ${chunks.length} chunks for workbook ${workbook_id}`);

    let embeddedCount = 0;

    for (const chunk of chunks) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "models/gemini-embedding-001",
            content: { parts: [{ text: chunk.content }] },
            outputDimensionality: 768,
          }),
        }
      );

      if (!res.ok) {
        console.error(`Failed to embed chunk ${chunk.id}:`, await res.text());
        continue;
      }

      const data = await res.json();
      const vector = data.embedding?.values;

      if (vector) {
        await supabase
          .from("workbook_chunks")
          .update({ embedding: vector })
          .eq("id", chunk.id);
        embeddedCount++;
      } else {
        console.error(`No vector returned for chunk ${chunk.id}:`, JSON.stringify(data));
      }
    }

    console.log(`Done. Embedded ${embeddedCount} of ${chunks.length} chunks.`);

    return new Response(JSON.stringify({ success: true, embedded: embeddedCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err);
    console.error("embed-chunks error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});