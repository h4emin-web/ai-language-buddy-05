import { useState, useRef, useEffect, useCallback } from "react";
import { Send, CheckCircle, Loader2, Clock, ArrowLeft, Phone } from "lucide-react";
import { streamChat, correctText, type Msg } from "@/lib/streamChat";
import type { Language, Topic } from "./SetupScreen";
import ReactMarkdown from "react-markdown";

interface ChatScreenProps {
  language: Language;
  topic: Topic;
  onEnd: () => void;
}

const languageNames: Record<Language, string> = {
  english: "영어",
  japanese: "일본어",
  chinese: "중국어",
};

const topicNames: Record<string, string> = {
  daily: "일상 생활",
  travel: "여행",
  food: "음식 & 요리",
  movies: "영화 & 드라마",
  work: "직장 & 커리어",
  free: "프리토킹",
};

const ChatScreen = ({ language, topic, onEnd }: ChatScreenProps) => {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [corrections, setCorrections] = useState<Record<number, string>>({});
  const [correctingIdx, setCorrectingIdx] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const startTimeRef = useRef(Date.now());
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Timer
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Auto scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Start conversation with AI greeting
  useEffect(() => {
    const startConversation = async () => {
      setIsLoading(true);
      let assistantSoFar = "";
      try {
        await streamChat({
          messages: [],
          language,
          topic,
          onDelta: (chunk) => {
            assistantSoFar += chunk;
            setMessages([{ role: "assistant", content: assistantSoFar }]);
          },
          onDone: () => setIsLoading(false),
        });
      } catch (e) {
        console.error(e);
        setIsLoading(false);
        setMessages([{ role: "assistant", content: "안녕하세요! 대화를 시작해볼까요?" }]);
      }
    };
    startConversation();
  }, [language, topic]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Msg = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    let assistantSoFar = "";
    const upsertAssistant = (nextChunk: string) => {
      assistantSoFar += nextChunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    try {
      await streamChat({
        messages: newMessages,
        language,
        topic,
        onDelta: (chunk) => upsertAssistant(chunk),
        onDone: () => setIsLoading(false),
      });
    } catch (e) {
      console.error(e);
      setIsLoading(false);
    }

    inputRef.current?.focus();
  }, [input, isLoading, messages, language, topic]);

  const handleCorrect = useCallback(async (idx: number, text: string) => {
    if (corrections[idx] || correctingIdx === idx) return;
    setCorrectingIdx(idx);
    try {
      const result = await correctText(text, language);
      setCorrections((prev) => ({ ...prev, [idx]: result }));
    } catch (e) {
      console.error(e);
    } finally {
      setCorrectingIdx(null);
    }
  }, [corrections, correctingIdx, language]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col h-screen max-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={onEnd}
            className="w-9 h-9 rounded-full bg-secondary hover:bg-destructive hover:text-destructive-foreground flex items-center justify-center transition-all"
            title="대화 종료"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="font-semibold text-sm">AI 대화 파트너</span>
            </div>
            <span className="text-xs text-muted-foreground">
              {languageNames[language]} · {topicNames[topic]}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary text-sm font-mono">
          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
          {formatTime(elapsed)}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((msg, idx) => (
          <div key={idx}>
            <div
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "gradient-primary text-primary-foreground rounded-br-md"
                    : "bg-card border border-border shadow-card rounded-bl-md"
                }`}
              >
                {msg.role === "assistant" ? (
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  msg.content
                )}
              </div>
            </div>

            {/* Correct button for user messages */}
            {msg.role === "user" && (
              <div className="flex justify-end mt-1.5">
                {corrections[idx] ? (
                  <div className="max-w-[85%] p-3 rounded-xl bg-accent/10 border border-accent/20 text-xs leading-relaxed whitespace-pre-wrap">
                    {corrections[idx]}
                  </div>
                ) : (
                  <button
                    onClick={() => handleCorrect(idx, msg.content)}
                    disabled={correctingIdx === idx}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded-lg hover:bg-primary/5"
                  >
                    {correctingIdx === idx ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <CheckCircle className="w-3 h-3" />
                    )}
                    교정하기
                  </button>
                )}
              </div>
            )}
          </div>
        ))}

        {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="flex justify-start">
            <div className="bg-card border border-border shadow-card px-4 py-3 rounded-2xl rounded-bl-md">
              <div className="flex gap-1.5">
                <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" />
                <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" />
                <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-border bg-card/80 backdrop-blur-sm">
        <div className="flex gap-2 max-w-2xl mx-auto">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            placeholder="메시지를 입력하세요..."
            className="flex-1 px-4 py-3 rounded-xl bg-secondary border border-border focus:border-primary focus:ring-2 focus:ring-ring/20 outline-none text-sm transition-all"
            disabled={isLoading}
          />
          <button
            onClick={send}
            disabled={!input.trim() || isLoading}
            className="w-12 h-12 rounded-xl gradient-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 transition-opacity hover:opacity-90"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatScreen;
