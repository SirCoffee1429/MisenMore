import "jsr:@supabase/functions-js@^2.4.1/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// TODO(Phase 8): multi-tenant Postmark routing. Today every inbound
// Postmark sales email is stamped to this single test org. Before the
// first real org is provisioned, replace this with a From-address →
// org_id lookup (e.g. a `postmark_inbound_map` table, or per-org
// Postmark inbound addresses). Tracked against Phase 6 option (c).
const TEST_ORG_ID = Deno.env.get("TEST_ORG_ID") || "cbc0aaeb-b1b3-489e-849d-0d0e1fe09b9e";

Deno.serve(async (req) => {
  try {
    // 1. Get the payload from Postmark
    const payload = await req.json();
    console.log("Received Postmark payload from:", payload.From);

    const attachment = payload.Attachments?.find((a: { ContentType: string; Name: string; Content: string }) =>
      a.ContentType === "application/pdf" || a.Name.toLowerCase().endsWith(".pdf")
    );

    if (!attachment) {
      console.log("No PDF attachment found in payload");
      return new Response(JSON.stringify({ message: "No PDF found" }), { status: 200 });
    }

    // 2. Extract PDF content (Base64)
    const pdfBase64 = attachment.Content;
    console.log(`Found PDF: ${attachment.Name}, size: ${attachment.Content.length} chars base64`);

    // 3. Ask Gemini to parse the PDF
    const prompt = `
      You are an expert at parsing restaurant sales reports.
      Attached is a PDF. You must first determine if this is an "Item Sales Report" or something else entirely (like a "Banquet Event Order").
      
      Look closely at the document title and headers. If it says "Banquet Event Order" or "BEO", or if it describes a private event with guest counts and event times, it is NOT a sales report.
      
      Return ONLY a JSON object with exactly three keys:
      1. "is_valid_sales_report": (boolean) true if this is an Item Sales Report, false if it is a Banquet Event Order or something else.
      2. "report_date": The date of this report in YYYY-MM-DD format. Look in the header, title, footer, or anywhere on the page for a date. If you cannot find any date, use null.
      3. "items": An array of objects, each with these keys:
         - "item_name" (string): the name of the item
         - "units_sold" (number): the number of units sold
         - "unit_price" (number): the individual price of the item. If not present, default to 0. Number only.
         - "total_net_sales" (number): the total net sales amount for that item. This is typically the "Amount" or "Net Sales" or "Sales" column. If not present, default to 0. Number only.
         - "discounts" (number): the total discount amount for that item. Look for a "Discounts" or "Disc" column. If not present, default to 0. Number only. Should be positive (absolute value).
         - "net_sales" (number): the net sales after discounts. Look for "Net Sales" column. If not present and you have total_net_sales and discounts, calculate as total_net_sales - discounts. Number only.
         - "tax" (number): the tax amount for that item. Look for a "Tax" column. If not present, default to 0. Number only.
         - "category" (string): the category (e.g., Appetizers, BBQ, Desserts)

      Rules for items:
      - Ignore "Item Category Totals" and "Totals" lines
      - Ignore items with 0 units sold
      - Strip out '$' signs and commas from prices and revenues to return clean numbers.
      - Sort items by units_sold descending
      - If "is_valid_sales_report" is false, you can leave "items" as an empty array.

      Example response shape:
      {
        "is_valid_sales_report": true,
        "report_date": "2026-03-27",
        "items": [
          {"item_name": "Brisket", "units_sold": 42, "unit_price": 14.50, "total_net_sales": 609.00, "discounts": 12.50, "net_sales": 596.50, "tax": 47.72, "category": "BBQ"}
        ]
      }
    `;

    console.log("Sending PDF to Gemini for parsing...");
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
      console.error("Gemini API Error:", errorText);
      throw new Error(`Gemini API Error: ${errorText}`);
    }

    const geminiData = await geminiRes.json();
    const rawOutput = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsedData = JSON.parse(rawOutput);

    if (parsedData.is_valid_sales_report === false) {
      console.warn("PDF is not an Item Sales Report (likely a BEO). Rejecting.");
      return new Response(JSON.stringify({ message: "Ignored non-sales report" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    // Extract date from Gemini response, fall back to today (UTC) if not found
    const reportDate: string = parsedData.report_date
      || new Date().toISOString().split("T")[0];
    const items: {
      item_name: string;
      units_sold: number;
      unit_price: number;
      total_net_sales: number;
      discounts: number;
      net_sales: number;
      tax: number;
      category: string;
    }[] = parsedData.items || [];

    console.log(`Gemini parsed ${items.length} items from the PDF, report date: ${reportDate}`);

    if (items.length === 0) {
      console.warn("Gemini returned 0 items — check PDF or prompt");
      return new Response(JSON.stringify({ message: "0 items found" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    // 4. Save to Supabase — every row scoped to TEST_ORG_ID pending
    //    the Phase 8 Postmark multi-tenancy work.
    const orgId = TEST_ORG_ID;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Delete existing rows for this org + date + source so a resent email
    // doesn't double-insert. Scoping by org_id is critical — otherwise a
    // future multi-tenant deployment would clobber another org's rows
    // that share the same date + From address.
    const { error: deleteError } = await supabase
      .from("sales_data")
      .delete()
      .eq("org_id", orgId)
      .eq("report_date", reportDate)
      .eq("metadata->>source", payload.From);

    if (deleteError) {
       console.error("Supabase delete error:", deleteError);
       // we proceed anyway just in case it's a minor RLS issue, but with service role it shouldn't be
    }

    const { error } = await supabase
      .from("sales_data")
      .insert(
        items.map((item) => ({
          org_id: orgId,
          report_date: reportDate,
          item_name: item.item_name,
          units_sold: Number(item.units_sold) || 0,
          unit_price: Number(item.unit_price) || 0,
          total_net_sales: Number(item.total_net_sales) || 0,
          discounts: Number(item.discounts) || 0,
          net_sales: Number(item.net_sales) || 0,
          tax: Number(item.tax) || 0,
          category: item.category,
          metadata: { source: payload.From },
        }))
      );

    if (error) {
      console.error("Supabase insert error:", error);
      throw error;
    }

    console.log(`Successfully saved ${items.length} items to sales_data for ${reportDate}`);

    return new Response(JSON.stringify({ success: true, count: items.length, report_date: reportDate }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err: unknown) {
    console.error("Error processing sales data:", err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
