import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, MicOff, CheckCircle, Loader2, Clock, Phone, Volume2 } from "lucide-react";
import { streamChat, correctText, autoTranslateKorean, type Msg } from "@/lib/streamChat";
import { speakWithGemini, stopSpeaking } from "@/lib/tts";
import type { Language, Topic } from "./SetupScreen";
import ReactMarkdown from "react-markdown";

interface ChatScreenProps {
  language: Language;
  topic: Topic;
  apiKey: string;
  onEnd: () => void;
}

const languageNames: Record<Language, string> = {
  english: "🇺🇸 영어",
  japanese: "🇯🇵 일본어",
  chinese: "🇨🇳 중국어",
};

const topicNames: Record<string, string> = {
  daily: "일상 생활",
  travel: "여행",
  food: "음식 & 요리",
  movies: "영화 & 드라마",
  work: "직장 & 커리어",
  free: "프리토킹",
};

const speechLangMap: Record<Language, string> = {
  english: "en-US",
  japanese: "ja-JP",
  chinese: "zh-CN",
};

// Declare SpeechRecognition types (not in all TS envs)
type SpeechRecognitionInstance = InstanceType<typeof window.SpeechRecognition>;

const ChatScreen = ({ language, topic, apiKey, onEnd }: ChatScreenProps) => {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isTTSLoading, setIsTTSLoading] = useState(false);
  const [corrections, setCorrections] = useState<Record<number, string>>({});
  const [correctingIdx, setCorrectingIdx] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [koreanNotes, setKoreanNotes] = useState<Record<number, string>>({});
  const [isTranslating, setIsTranslating] = useState(false);

  const startTimeRef = useRef(Date.now());
  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const messagesRef = useRef<Msg[]>([]);
  const accumulatedRef = useRef(""); // manual-stop STT accumulator

  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Timer
  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Auto scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, liveTranscript]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSpeaking();
      recognitionRef.current?.abort();
    };
  }, []);

  // Gemini TTS
  const speak = useCallback(async (text: string) => {
    // Strip ruby/pinyin readings like 学校(がっこう) → 学校, 你好(nǐ hǎo) → 你好
    const ttsText = text.replace(/\([\u3040-\u30FFa-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü\s·]+\)/gi, '');
    setIsTTSLoading(true);
    try {
      await speakWithGemini(
        ttsText,
        apiKey,
        () => { setIsTTSLoading(false); setIsSpeaking(true); },
        () => setIsSpeaking(false),
      );
    } catch (e) {
      console.error("TTS error:", e);
      setIsTTSLoading(false);
      setIsSpeaking(false);
    }
  }, [apiKey]);

  // Start conversation with AI greeting
  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      setIsLoading(true);
      let assistantSoFar = "";
      try {
        await streamChat({
          messages: [],
          language,
          topic,
          apiKey,
          onDelta: (chunk) => {
            if (cancelled) return;
            assistantSoFar += chunk;
            setMessages([{ role: "assistant", content: assistantSoFar }]);
          },
          onDone: () => {
            if (cancelled) return;
            setIsLoading(false);
            if (assistantSoFar) speak(assistantSoFar);
          },
        });
      } catch (e) {
        if (cancelled) return;
        console.error(e);
        setIsLoading(false);
        const fallback = "안녕하세요! 대화를 시작해볼까요?";
        setMessages([{ role: "assistant", content: fallback }]);
        speak(fallback);
      }
    };
    start();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Send user message → AI response
  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const userMsg: Msg = { role: "user", content: trimmed };
    const newMessages = [...messagesRef.current, userMsg];
    setMessages(newMessages);
    setIsLoading(true);

    let assistantSoFar = "";
    try {
      await streamChat({
        messages: newMessages,
        language,
        topic,
        apiKey,
        onDelta: (chunk) => {
          assistantSoFar += chunk;
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant") {
              return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
            }
            return [...prev, { role: "assistant", content: assistantSoFar }];
          });
        },
        onDone: () => {
          setIsLoading(false);
          if (assistantSoFar) speak(assistantSoFar);
        },
      });
    } catch (e) {
      console.error(e);
      setIsLoading(false);
    }
  }, [isLoading, language, topic, apiKey, speak]);

  // Korean 감지 → 번역 → AI 전송
  const handleUserInput = useCallback(async (rawText: string) => {
    const hasKoreanChars = /[가-힣]/.test(rawText);
    if (!hasKoreanChars) {
      sendMessage(rawText);
      return;
    }
    setIsTranslating(true);
    try {
      const result = await autoTranslateKorean(rawText, language, apiKey);
      if (result.hasKorean) {
        const noteIdx = messagesRef.current.length; // 곧 추가될 user 메시지 index
        setKoreanNotes((prev) => ({ ...prev, [noteIdx]: result.explanation }));
        sendMessage(result.translated);
      } else {
        sendMessage(rawText);
      }
    } catch {
      sendMessage(rawText);
    } finally {
      setIsTranslating(false);
    }
  }, [language, apiKey, sendMessage]);

  // STT — click to start, click again to stop & send
  const toggleListening = useCallback(() => {
    if (isLoading || isSpeaking || isTTSLoading) return;

    if (isListening) {
      // User clicked stop → send accumulated transcript
      recognitionRef.current?.stop();
      return;
    }

    type SRConstructor = new () => SpeechRecognitionInstance;
    const SR: SRConstructor | undefined =
      (window as unknown as Record<string, SRConstructor>).SpeechRecognition
      || (window as unknown as Record<string, SRConstructor>).webkitSpeechRecognition;
    if (!SR) {
      alert("이 브라우저는 음성 인식을 지원하지 않습니다. Chrome을 사용해주세요.");
      return;
    }

    accumulatedRef.current = "";
    stopSpeaking();

    const r = new SR() as SpeechRecognitionInstance;
    r.lang = speechLangMap[language];
    r.interimResults = true;
    r.continuous = true;        // keep recording until user stops manually
    r.maxAlternatives = 1;

    r.onstart = () => {
      setIsListening(true);
      setLiveTranscript("");
    };

    r.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          accumulatedRef.current += t;
        } else {
          interim = t;
        }
      }
      setLiveTranscript(accumulatedRef.current + interim);
    };

    r.onend = () => {
      setIsListening(false);
      setLiveTranscript("");
      const finalText = accumulatedRef.current.trim();
      accumulatedRef.current = "";
      if (finalText) handleUserInput(finalText);
    };

    r.onerror = (event: Event & { error: string }) => {
      if (event.error !== "no-speech") console.error("STT error:", event.error);
      setIsListening(false);
      setLiveTranscript("");
      accumulatedRef.current = "";
    };

    recognitionRef.current = r;
    r.start();
  }, [isListening, isLoading, isSpeaking, isTTSLoading, language, handleUserInput]);

  const handleCorrect = useCallback(async (idx: number, text: string) => {
    if (corrections[idx] || correctingIdx === idx) return;
    setCorrectingIdx(idx);
    try {
      const result = await correctText(text, language, apiKey);
      setCorrections((prev) => ({ ...prev, [idx]: result }));
    } catch (e) {
      console.error(e);
    } finally {
      setCorrectingIdx(null);
    }
  }, [corrections, correctingIdx, language, apiKey]);

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  const micDisabled = isLoading || isSpeaking || isTTSLoading || isTranslating;
  const statusText = isTranslating
    ? "한국어 번역 중..."
    : isTTSLoading
      ? "AI 음성 생성 중..."
      : isSpeaking
        ? "AI가 말하고 있어요"
        : isLoading
          ? "AI가 생각하고 있어요..."
          : isListening
            ? "듣고 있어요 — 다시 탭하여 전송"
            : "탭하여 말하기";

  return (
    <div className="flex flex-col h-screen max-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              stopSpeaking();
              recognitionRef.current?.abort();
              onEnd();
            }}
            className="w-9 h-9 rounded-full bg-secondary hover:bg-destructive hover:text-destructive-foreground flex items-center justify-center transition-all"
            title="대화 종료"
          >
            <Phone className="w-4 h-4 rotate-[135deg]" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
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
            <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
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
                  <div className="flex items-center gap-2">
                    <Mic className="w-3 h-3 opacity-60 shrink-0" />
                    {msg.content}
                  </div>
                )}
              </div>
            </div>

            {msg.role === "user" && koreanNotes[idx] && (
              <div className="flex justify-end mt-1">
                <div className="max-w-[85%] flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  <span className="shrink-0">🔄</span>
                  <span>{koreanNotes[idx]}</span>
                </div>
              </div>
            )}

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

        {/* Live transcript while recording */}
        {liveTranscript && (
          <div className="flex justify-end">
            <div className="max-w-[80%] px-4 py-3 rounded-2xl rounded-br-md text-sm leading-relaxed bg-primary/20 text-foreground/70 border border-primary/20">
              <div className="flex items-center gap-2">
                <Mic className="w-3 h-3 animate-pulse shrink-0" />
                {liveTranscript}
              </div>
            </div>
          </div>
        )}

        {/* AI thinking */}
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

        {/* Speaking indicators */}
        {(isSpeaking || isTTSLoading) && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 text-xs text-muted-foreground px-2">
              {isTTSLoading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
                : <Volume2 className="w-3.5 h-3.5 animate-pulse text-accent" />
              }
              {isTTSLoading ? "음성 생성 중..." : "AI가 말하고 있어요..."}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Mic Button */}
      <div className="px-4 py-6 border-t border-border bg-card/80 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={toggleListening}
            disabled={micDisabled}
            className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 ${
              isListening
                ? "bg-destructive text-destructive-foreground shadow-lg scale-110 animate-pulse"
                : "gradient-primary text-primary-foreground shadow-elevated hover:scale-105"
            } disabled:opacity-40 disabled:scale-100`}
          >
            {isListening ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
          </button>
          <span className="text-xs text-muted-foreground text-center">{statusText}</span>
        </div>
      </div>
    </div>
  );
};

export default ChatScreen;
