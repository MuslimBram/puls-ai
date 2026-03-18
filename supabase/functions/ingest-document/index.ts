import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
// @ts-ignore - pdf-parse for Deno
import pdfParse from "npm:pdf-parse@1.1.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function chunkText(text: string, maxChunkSize = 1500): string[] {
  const paragraphs = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";
  for (const p of paragraphs) {
    if ((current + "\n\n" + p).length > maxChunkSize && current) {
      chunks.push(current.trim());
      current = p;
    } else {
      current = current ? current + "\n\n" + p : p;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Not authenticated");
    const userId = userData.user.id;

    const { file_path, file_name, content_text, business_id } = await req.json();
    
    if (!business_id) throw new Error("business_id is required");
    if (!content_text && !file_path) throw new Error("Either content_text or file_path is required");

    const { data: business, error: businessError } = await supabase
      .from("business_profiles")
      .select("id, user_id, workspace_id")
      .eq("id", business_id)
      .single();

    if (businessError || !business) throw new Error("Business not found");
    if (business.user_id !== userId) throw new Error("Forbidden");

    let textContent = content_text || "";
    let sourceName = file_name || "Uploaded Document";

    // If file_path provided, download from storage
    if (file_path && !content_text) {
      const { data: fileData, error: fileError } = await supabase.storage
        .from("knowledge-documents")
        .download(file_path);
      
      if (fileError) throw new Error(`Failed to download file: ${fileError.message}`);
      
      const ext = file_path.split(".").pop()?.toLowerCase() || "";
      
      if (ext === "pdf") {
        // Parse PDF using pdf-parse
        try {
          const arrayBuffer = await fileData.arrayBuffer();
          const buffer = new Uint8Array(arrayBuffer);
          const pdfData = await pdfParse(buffer);
          textContent = pdfData.text || "";
          console.log(`PDF parsed: ${pdfData.numpages} pages, ${textContent.length} chars`);
          
          if (!textContent || textContent.length < 20) {
            // Fallback: use AI to extract from raw text
            const rawText = await fileData.text();
            if (rawText.length > 50) {
              const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${LOVABLE_API_KEY}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  model: "google/gemini-2.5-flash-lite",
                  messages: [
                    { role: "system", content: "Extract all readable text content from this document data. Return only the extracted text." },
                    { role: "user", content: rawText.slice(0, 10000) },
                  ],
                }),
              });
              if (aiRes.ok) {
                const aiData = await aiRes.json();
                textContent = aiData.choices?.[0]?.message?.content || rawText;
              }
            }
          }
        } catch (pdfErr) {
          console.error("PDF parse error:", pdfErr);
          // Fallback to raw text extraction
          textContent = await fileData.text();
        }
      } else if (ext === "txt" || ext === "md" || ext === "csv") {
        textContent = await fileData.text();
      } else if (ext === "json") {
        const raw = await fileData.text();
        try {
          textContent = JSON.stringify(JSON.parse(raw), null, 2);
        } catch {
          textContent = raw;
        }
      } else {
        // For other formats, try text extraction
        textContent = await fileData.text();
      }
    }

    if (!textContent || textContent.length < 10) {
      throw new Error("Could not extract meaningful text from document. For PDFs, ensure the file contains selectable text (not scanned images).");
    }

    // Limit content size
    if (textContent.length > 100000) {
      textContent = textContent.slice(0, 100000);
    }

    // Create knowledge source
    const { data: source, error: srcErr } = await supabase.from("knowledge_sources").insert({
      user_id: userId,
      workspace_id: business.workspace_id,
      business_id,
      source_type: "document",
      source_name: sourceName,
      status: "scanning",
      metadata: { file_path, file_size: textContent.length },
    }).select().single();

    if (srcErr) throw srcErr;

    // Chunk the text
    const chunks = chunkText(textContent);
    let totalChunks = 0;
    const allTopics: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const wordCount = chunk.split(/\s+/).length;

      // Extract topics for substantial chunks (limit AI calls)
      let topicTags: string[] = [];
      if (wordCount > 20 && i < 10) {
        try {
          const tagRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash-lite",
              messages: [
                { role: "system", content: "Extract 2-5 topic tags from this content. Return only a JSON array of lowercase strings." },
                { role: "user", content: chunk.slice(0, 2000) },
              ],
              tools: [{
                type: "function",
                function: {
                  name: "extract_tags",
                  description: "Extract topic tags",
                  parameters: {
                    type: "object",
                    properties: { tags: { type: "array", items: { type: "string" } } },
                    required: ["tags"],
                    additionalProperties: false,
                  },
                },
              }],
              tool_choice: { type: "function", function: { name: "extract_tags" } },
            }),
          });
          if (tagRes.ok) {
            const tagData = await tagRes.json();
            const tc = tagData.choices?.[0]?.message?.tool_calls?.[0];
            if (tc?.function?.arguments) {
              topicTags = JSON.parse(tc.function.arguments).tags || [];
              allTopics.push(...topicTags);
            }
          }
        } catch (e) {
          console.error("Tag extraction failed:", e);
        }
      }

      await supabase.from("knowledge_chunks").insert({
        user_id: userId,
        source_id: source.id,
        content: chunk,
        summary: chunk.slice(0, 200),
        topic_tags: topicTags,
        content_type: "document",
        page_title: sourceName,
        chunk_index: i,
        word_count: wordCount,
      });
      totalChunks++;
    }

    const uniqueTopics = [...new Set(allTopics)];
    await supabase.from("knowledge_sources").update({
      status: "active",
      last_scanned_at: new Date().toISOString(),
      metadata: {
        file_path,
        file_size: textContent.length,
        total_chunks: totalChunks,
        topics: uniqueTopics.slice(0, 20),
      },
    }).eq("id", source.id);

    return new Response(JSON.stringify({
      success: true,
      source_id: source.id,
      chunks_created: totalChunks,
      topics: uniqueTopics,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("ingest-document error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
