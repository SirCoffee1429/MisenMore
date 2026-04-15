import "jsr:@supabase/functions-js@^2.4.1/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

Deno.serve(async (req) => {
  try {
    // 1. Get the payload from Postmark
    const payload = await req.json();
    console.log("Received Postmark payload from:", payload.From);

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
      
      const reserveCloudUrl = allUrls.find(u => u.toLowerCase().includes('reservecloud'));
      
      if (!reserveCloudUrl) {
          console.log("No PDF attachment or ReserveCloud URL found in payload.");
          return new Response(JSON.stringify({ message: "No PDF or link found" }), { status: 200 });
      }

      console.log("Found ReserveCloud link:", reserveCloudUrl);
      
      // Fetch the page
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
          // Parse HTML for PDF link
          const htmlText = await pageRes.text();
          // Look for an href ending in .pdf or wrapping a document
          const pdfLinkMatch = htmlText.match(/href=["']([^"']+\.pdf[^"']*)["']/i);
          let pdfUrl = "";
          if (pdfLinkMatch) {
              pdfUrl = pdfLinkMatch[1];
          } else {
              // try to find any link containing download or report
              const fallbackMatch = htmlText.match(/href=["']([^"']*(download|report)[^"']*)["']/i);
              if (fallbackMatch) pdfUrl = fallbackMatch[1];
          }

          if (!pdfUrl) {
               throw new Error("Could not find a PDF link within the ReserveCloud HTML page.");
          }

          // Resolve relative URLs
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

    // 3. Ask Gemini to parse the PDF
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
    console.log(`Gemini parsed ${parsedData.length} banquets/events from the PDF`);

    if (parsedData.length === 0) {
        return new Response(JSON.stringify({ success: true, count: 0, message: "No banquets found" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    }

    // 4. Save to Supabase
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { error } = await supabase
      .from("upcoming_banquets")
      .insert(
        parsedData.map((item: Record<string, string | number>) => ({
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

    console.log(`Successfully saved ${parsedData.length} records to upcoming_banquets`);

    return new Response(JSON.stringify({ success: true, count: parsedData.length }), {
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
