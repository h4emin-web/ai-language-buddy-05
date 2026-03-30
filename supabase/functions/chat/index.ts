import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const languageSystemPrompts: Record<string, string> = {
  english: `You are a friendly English conversation partner for language learners. 
Rules:
- Speak ONLY in English
- Keep your responses conversational and natural, like a phone call
- Ask follow-up questions to keep the conversation going
- If the user seems stuck, gently guide them with easier questions
- Keep responses concise (2-3 sentences max)
- Be encouraging and patient`,
  
  japanese: `あなたは日本語学習者のための親しみやすい会話パートナーです。
ルール:
- 日本語のみで話してください
- 電話のような自然な会話を心がけてください
- 会話が続くようにフォローアップの質問をしてください
- ユーザーが困っているようなら、やさしい質問で導いてください
- 簡潔に答えてください（2〜3文程度）
- 励ましながら、忍耐強く対応してください`,
  
  chinese: `你是一位友好的中文会话伙伴，帮助语言学习者练习中文。
规则：
- 只说中文
- 保持对话自然，像打电话一样
- 多问后续问题，保持对话持续
- 如果用户卡住了，用更简单的问题引导他们
- 回答简洁（最多2-3句话）
- 要鼓励和耐心`,
};

const topicPrompts: Record<string, Record<string, string>> = {
  english: {
    daily: "Start by asking about their day or daily routine.",
    travel: "Start by asking about their travel experiences or dream destinations.",
    food: "Start by asking about their favorite food or cooking experiences.",
    movies: "Start by asking about movies or TV shows they've watched recently.",
    work: "Start by asking about their job or career goals.",
    free: "Start with a friendly greeting and let the conversation flow naturally.",
  },
  japanese: {
    daily: "まず、今日の出来事や日常について聞いてください。",
    travel: "まず、旅行の経験や行きたい場所について聞いてください。",
    food: "まず、好きな食べ物や料理の経験について聞いてください。",
    movies: "まず、最近見た映画やドラマについて聞いてください。",
    work: "まず、仕事やキャリアの目標について聞いてください。",
    free: "フレンドリーな挨拶から始めて、自然に会話を進めてください。",
  },
  chinese: {
    daily: "先问问他们今天过得怎么样或者日常生活。",
    travel: "先问问他们的旅行经历或者想去的地方。",
    food: "先问问他们喜欢的食物或者做饭的经历。",
    movies: "先问问他们最近看了什么电影或电视剧。",
    work: "先问问他们的工作或职业目标。",
    free: "用友好的问候开始，让对话自然进行。",
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, language, topic } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const lang = language || "english";
    const topicKey = topic || "free";
    
    const systemPrompt = `${languageSystemPrompts[lang] || languageSystemPrompts.english}\n\n${topicPrompts[lang]?.[topicKey] || topicPrompts[lang]?.free || ""}`;

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
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "크레딧이 부족합니다." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI 오류가 발생했습니다." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
