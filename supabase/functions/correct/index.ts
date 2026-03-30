import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const correctionPrompts: Record<string, string> = {
  english: `You are an English language tutor. The user wrote a sentence in English.
Analyze it and respond in Korean with this exact format:
📝 원문: (their original sentence)
✅ 교정: (corrected sentence)
💡 설명: (brief explanation in Korean of what was wrong and why, if there are errors. If the sentence is perfect, say "완벽한 문장이에요! 👏")`,
  
  japanese: `あなたは日本語教師です。ユーザーが日本語で文を書きました。
分析して、韓国語で以下の形式で回答してください：
📝 원문: (원래 문장)
✅ 교정: (교정된 문장)
💡 설명: (한국어로 무엇이 잘못되었는지 간단한 설명. 완벽하면 "완벽한 문장이에요! 👏"라고 하세요)`,
  
  chinese: `你是一位中文老师。用户用中文写了一个句子。
请分析并用韩语按照以下格式回答：
📝 원문: (원래 문장)
✅ 교정: (교정된 문장)
💡 설명: (한국어로 무엇이 잘못되었는지 간단한 설명. 완벽하면 "완벽한 문장이에요! 👏"라고 하세요)`,
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { text, language } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "text is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lang = language || "english";
    const systemPrompt = correctionPrompts[lang] || correctionPrompts.english;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "요청이 너무 많습니다." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI 오류" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const correction = data.choices?.[0]?.message?.content || "교정 결과를 가져올 수 없습니다.";

    return new Response(JSON.stringify({ correction }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("correct error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
