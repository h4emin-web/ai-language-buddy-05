import { useState } from "react";
import { Globe, MessageCircle, Sparkles } from "lucide-react";

export type Language = "english" | "japanese" | "chinese";
export type Topic = "daily" | "travel" | "food" | "movies" | "work" | "free";

interface SetupScreenProps {
  onStart: (language: Language, topic: Topic) => void;
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

const SetupScreen = ({ onStart }: SetupScreenProps) => {
  const [step, setStep] = useState<"language" | "topic">("language");
  const [selectedLanguage, setSelectedLanguage] = useState<Language | null>(null);

  const handleLanguageSelect = (lang: Language) => {
    setSelectedLanguage(lang);
    setStep("topic");
  };

  const handleTopicSelect = (topic: Topic) => {
    if (selectedLanguage) onStart(selectedLanguage, topic);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
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
                  <div className="font-semibold text-lg group-hover:text-primary transition-colors">{lang.label}</div>
                  <div className="text-muted-foreground text-sm">{lang.sub}</div>
                </div>
                <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                  →
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

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
                <span className={`font-medium text-sm ${topic.id === "free" ? "" : "group-hover:text-primary"} transition-colors`}>
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
