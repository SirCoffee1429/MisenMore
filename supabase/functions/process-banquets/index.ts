import "jsr:@supabase/functions-js@^2.4.1/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// Resolve the inbound routing key from a Postmark payload. Postmark
// parses `local+key@domain` and exposes the suffix as MailboxHash on
// each ToFull entry; we prefer that and fall back to a manual parse of
// the To header so this still works if the parser is ever bypassed.
function extractInboundKey(payload: {
  ToFull?: Array<{ MailboxHash?: string; Email?: string }>;
  To?: string;
}): string | null {
  const fromHash = payload.ToFull?.find((t) => t.MailboxHash)?.MailboxHash;
  if (fromHash) return fromHash.trim().toLowerCase();

  const to = payload.To || "";
  const match = to.match(/\+([^@]+)@/);
  return match ? match[1].trim().toLowerCase() : null;
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    console.log("Received Postmark payload from:", payload.From, "to:", payload.To);

    // Resolve the org from the inbound routing key BEFORE any expensive
    // work — if we can't route it, fail fast.
    const inboundKey = extractInboundKey(payload);
    if (!inboundKey) {
      console.warn("No MailboxHash / +key found on inbound address; cannot route to an org.");
      return new Response(JSON.stringify({ error: "Missing inbound routing key" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: orgRow, error: orgErr } = await supabase
      .from("organizations")
      .select("id")
      .eq("inbound_email_key", inboundKey)
      .maybeSingle();

    if (orgErr) {
      console.error("Org lookup failed:", orgErr);
      throw orgErr;
    }
    if (!orgRow) {
      console.warn(`Inbound key '${inboundKey}' did not match any org.`);
      return new Response(JSON.stringify({ error: "Unknown inbound key" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    const orgId: string = orgRow.id;

    const attachment = payload.Attachments?.find((a: { ContentType: string; Name: string; Content: string }) =>
      a.ContentType === "application/pdf" || a.Name.toLowerCase().endsWith(".pdf")
    );

    let pdfBase64 = "";

    if (attachment) {
      console.log(`Found explicit PDF attachment: ${attachment.Name}, size: ${attachment.Content.length} chars base64`);
      pdfBase64 = attachment.Content;
    } else {
      console.log("No PDF attachment found. Searching for ReserveCloud links in email body...");
      const textBody = payload.TextBody || "";
      const htmlBody = payload.HtmlBody || "";

      const urlRegex = /https?:\/\/[^\s"'<>]+/ig;
      const textUrls = textBody.match(urlRegex) || [];
      const htmlUrls = htmlBody.match(urlRegex) || [];
      const allUrls = [...textUrls, ...htmlUrls];

      const reserveCloudUrl = allUrls.find((u: string) => u.toLowerCase().includes('reservecloud'));

      if (!reserveCloudUrl) {
          console.log("No PDF attachment or ReserveCloud URL found in payload.");
          return new Response(JSON.stringify({ message: "No PDF or link found" }), { status: 200 });
      }

      console.log("Found ReserveCloud link:", reserveCloudUrl);

      const pageRes = await fetch(reserveCloudUrl);
      if (!pageRes.ok) throw new Error("Failed to fetch ReserveCloud page: " + pageRes.statusText);

      const contentType = pageRes.headers.get("content-type") || "";
      if (contentType.includes("application/pdf")) {
          const arrayBuffer = await pageRes.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          let binaryStr = '';
          for (let i = 0; i < bytes.byteLength; i++) binaryStr += String.fromCharCode(bytes[i]);
          pdfBase64 = btoa(binaryStr);
      } else {
          const htmlText = await pageRes.text();
          const pdfLinkMatch = htmlText.match(/href=["']([^"']+\.pdf[^"']*)["']/i);
          let pdfUrl = "";
          if (pdfLinkMatch) {
              pdfUrl = pdfLinkMatch[1];
          } else {
              const fallbackMatch = htmlText.match(/href=["']([^"']*(download|report)[^"']*)["']/i);
              if (fallbackMatch) pdfUrl = fallbackMatch[1];
          }

          if (!pdfUrl) {
               throw new Error("Could not find a PDF link within the ReserveCloud HTML page.");
          }

          if (pdfUrl.startsWith("/")) {
              const urlObj = new URL(reserveCloudUrl);
              pdfUrl = urlObj.origin + pdfUrl;
          }

          console.log("Found inner PDF link:", pdfUrl);
          const pdfRes = await fetch(pdfUrl);
          if (!pdfRes.ok) throw new Error("Failed to fetch inner PDF: " + pdfRes.statusText);

          const arrayBuffer = await pdfRes.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          let binaryStr = '';
          for (let i = 0; i < bytes.byteLength; i++) {
              binaryStr += String.fromCharCode(bytes[i]);
          }
          pdfBase64 = btoa(binaryStr);
      }
    }

    const prompt = `
      You are an expert at parsing restaurant and country club Banquet/Event reports.
      Attached is a PDF of "Upcoming in Banquets".
      Please extract all upcoming events.
      Return ONLY a JSON array of objects with these exact keys:
      "event_date" (the date of the event in YYYY-MM-DD format),
      "event_name" (the name or title of the event/banquet),
      "start_time" (the start time, e.g. "5:00 PM", or empty string if not found),
      "location" (the room, block, or venue location),
      "guest_count" (number of attendees as an integer),
      "event_type" (the type of event or category, e.g. "Dinner", "Meeting", "Wedding").

      Ignore header lines, footers, or unassociated text. If a field is missing on a record, return an empty string or 0 for counts.
      Order the output chronologically by event_date, then start_time.
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
    console.log(`Gemini parsed ${parsedData.length} banquets/events for org ${orgId}`);

    if (parsedData.length === 0) {
        return new Response(JSON.stringify({ success: true, count: 0, message: "No banquets found" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    }

    const { error } = await supabase
      .from("upcoming_banquets")
      .insert(
        parsedData.map((item: Record<string, string | number>) => ({
          org_id: orgId,
          event_date: item.event_date || new Date().toISOString().split("T")[0],
          event_name: item.event_name || 'Unknown Event',
          start_time: item.start_time || null,
          location: item.location || '',
          guest_count: item.guest_count ? parseInt(String(item.guest_count), 10) : 0,
          event_type: item.event_type || 'Event',
        }))
      );

    if (error) {
      console.error("Supabase insert error:", error);
      throw error;
    }

    console.log(`Successfully saved ${parsedData.length} records to upcoming_banquets for org ${orgId}`);

    return new Response(JSON.stringify({ success: true, count: parsedData.length, org_id: orgId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err: unknown) {
    console.error("Error processing banquets data:", err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
