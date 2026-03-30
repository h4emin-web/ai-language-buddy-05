import { useState } from "react";
import { Globe, MessageCircle, Sparkles, KeyRound, ExternalLink } from "lucide-react";

export type Language = "english" | "japanese" | "chinese";
export type Topic = "daily" | "travel" | "food" | "movies" | "work" | "free";

interface SetupScreenProps {
  onStart: (language: Language, topic: Topic, apiKey: string) => void;
}

const languages: { id: Language; label: string; flag: string; sub: string }[] = [
  { id: "english", label: "English", flag: "🇺🇸", sub: "영어" },
  { id: "japanese", label: "日本語", flag: "🇯🇵", sub: "일본어" },
  { id: "chinese", label: "中文", flag: "🇨🇳", sub: "중국어" },
];

const topics: { id: Topic; label: string; emoji: string }[] = [
  { id: "daily", label: "일상 생활", emoji: "☀️" },
  { id: "travel", label: "여행", emoji: "✈️" },
  { id: "food", label: "음식 & 요리", emoji: "🍳" },
  { id: "movies", label: "영화 & 드라마", emoji: "🎬" },
  { id: "work", label: "직장 & 커리어", emoji: "💼" },
  { id: "free", label: "프리토킹", emoji: "💬" },
];

const API_KEY_STORAGE = "alb_gemini_key";
// If VITE_GEMINI_API_KEY env var is set (Vercel), use it directly
const ENV_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;

function getEffectiveKey() {
  return ENV_API_KEY || localStorage.getItem(API_KEY_STORAGE) || "";
}

const SetupScreen = ({ onStart }: SetupScreenProps) => {
  const savedKey = getEffectiveKey();
  const [step, setStep] = useState<"apikey" | "language" | "topic">(
    savedKey ? "language" : "apikey"
  );
  const [apiKeyInput, setApiKeyInput] = useState(savedKey);
  const [apiKeyError, setApiKeyError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<Language | null>(null);

  const handleVerifyKey = async () => {
    const key = apiKeyInput.trim();
    if (!key) return;
    setApiKeyError("");
    setIsVerifying(true);
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(key)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Hi" }] }] }),
        }
      );
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error?.message || `HTTP ${resp.status}`);
      }
      localStorage.setItem(API_KEY_STORAGE, key);
      setStep("language");
    } catch (e) {
      setApiKeyError(e instanceof Error ? e.message : "API 키가 유효하지 않습니다");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleLanguageSelect = (lang: Language) => {
    setSelectedLanguage(lang);
    setStep("topic");
  };

  const handleTopicSelect = (topic: Topic) => {
    if (selectedLanguage) {
      onStart(selectedLanguage, topic, apiKeyInput.trim() || localStorage.getItem(API_KEY_STORAGE) || "");
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      {/* Header */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-2 gradient-primary text-primary-foreground px-4 py-2 rounded-full text-sm font-medium mb-6">
          <Sparkles className="w-4 h-4" />
          AI Language Practice
        </div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">
          AI 전화 외국어
        </h1>
        <p className="text-muted-foreground text-lg">
          AI와 실시간 대화하며 외국어 실력을 키워보세요
        </p>
      </div>

      {/* Step: API Key */}
      {step === "apikey" && (
        <div className="w-full max-w-md space-y-4">
          <div className="flex items-center gap-2 mb-6">
            <KeyRound className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-semibold">Gemini API 키 입력</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Google AI Studio에서 무료로 발급받은 API 키를 입력하세요.
            키는 이 기기에만 저장됩니다.
          </p>
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline mb-4"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Google AI Studio에서 무료 발급받기
          </a>
          <input
            type="password"
            placeholder="AIza... (Gemini API Key)"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === "Enter" && !isVerifying && handleVerifyKey()}
            className="w-full px-4 py-3 rounded-xl border border-border bg-card focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm"
            autoFocus
          />
          {apiKeyError && (
            <p className="text-sm text-destructive mt-1">{apiKeyError}</p>
          )}
          <button
            onClick={handleVerifyKey}
            disabled={!apiKeyInput.trim() || isVerifying}
            className="w-full py-3 rounded-xl gradient-primary text-primary-foreground font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            {isVerifying ? "확인 중..." : "시작하기"}
          </button>
        </div>
      )}

      {/* Step: Language */}
      {step === "language" && (
        <div className="w-full max-w-md space-y-4">
          <div className="flex items-center gap-2 mb-6">
            <Globe className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-semibold">언어를 선택하세요</h2>
          </div>
          <div className="grid gap-3">
            {languages.map((lang) => (
              <button
                key={lang.id}
                onClick={() => handleLanguageSelect(lang.id)}
                className="flex items-center gap-4 w-full p-5 rounded-2xl bg-card shadow-card border border-border hover:shadow-elevated hover:border-primary/30 transition-all duration-300 group text-left"
              >
                <span className="text-4xl">{lang.flag}</span>
                <div className="flex-1">
                  <div className="font-semibold text-lg group-hover:text-primary transition-colors">
                    {lang.label}
                  </div>
                  <div className="text-muted-foreground text-sm">{lang.sub}</div>
                </div>
                <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                  →
                </div>
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              localStorage.removeItem(API_KEY_STORAGE);
              setApiKeyInput("");
              setApiKeyError("");
              setStep("apikey");
            }}
            className="block mx-auto text-xs text-muted-foreground hover:text-foreground transition-colors mt-4 underline underline-offset-2"
          >
            API 키 변경
          </button>
        </div>
      )}

      {/* Step: Topic */}
      {step === "topic" && (
        <div className="w-full max-w-md space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() => setStep("language")}
              className="text-muted-foreground hover:text-foreground transition-colors text-sm"
            >
              ← 뒤로
            </button>
          </div>
          <div className="flex items-center gap-2 mb-6">
            <MessageCircle className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-semibold">주제를 선택하세요</h2>
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
            {languages.find((l) => l.id === selectedLanguage)?.flag}{" "}
            {languages.find((l) => l.id === selectedLanguage)?.sub}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {topics.map((topic) => (
              <button
                key={topic.id}
                onClick={() => handleTopicSelect(topic.id)}
                className={`flex flex-col items-center gap-2 p-5 rounded-2xl bg-card shadow-card border border-border hover:shadow-elevated hover:border-primary/30 transition-all duration-300 group ${
                  topic.id === "free"
                    ? "col-span-2 gradient-primary text-primary-foreground border-0 hover:opacity-90"
                    : ""
                }`}
              >
                <span className="text-3xl">{topic.emoji}</span>
                <span
                  className={`font-medium text-sm ${
                    topic.id === "free" ? "" : "group-hover:text-primary"
                  } transition-colors`}
                >
                  {topic.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SetupScreen;
