import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, MicOff, CheckCircle, Loader2, Clock, ArrowLeft, Phone, Volume2 } from "lucide-react";
import { streamChat, correctText, type Msg } from "@/lib/streamChat";
import type { Language, Topic } from "./SetupScreen";
import ReactMarkdown from "react-markdown";

interface ChatScreenProps {
  language: Language;
  topic: Topic;
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

const ChatScreen = ({ language, topic, onEnd }: ChatScreenProps) => {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [corrections, setCorrections] = useState<Record<number, string>>({});
  const [correctingIdx, setCorrectingIdx] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [interimText, setInterimText] = useState("");
  const startTimeRef = useRef(Date.now());
  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const synthRef = useRef(window.speechSynthesis);
  const messagesRef = useRef<Msg[]>([]);

  // Keep messagesRef in sync
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

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
  }, [messages, interimText]);

  // TTS: speak text
  const speak = useCallback((text: string) => {
    return new Promise<void>((resolve) => {
      synthRef.current.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = speechLangMap[language];
      utterance.rate = 0.9;
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => {
        setIsSpeaking(false);
        resolve();
      };
      utterance.onerror = () => {
        setIsSpeaking(false);
        resolve();
      };
      synthRef.current.speak(utterance);
    });
  }, [language]);

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
          onDone: () => {
            setIsLoading(false);
            // Speak the greeting
            if (assistantSoFar) speak(assistantSoFar);
          },
        });
      } catch (e) {
        console.error(e);
        setIsLoading(false);
        const fallback = "안녕하세요! 대화를 시작해볼까요?";
        setMessages([{ role: "assistant", content: fallback }]);
        speak(fallback);
      }
    };
    startConversation();

    return () => {
      synthRef.current.cancel();
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, [language, topic, speak]);

  // Send user message and get AI response
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: Msg = { role: "user", content: text.trim() };
    const newMessages = [...messagesRef.current, userMsg];
    setMessages(newMessages);
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
        onDone: () => {
          setIsLoading(false);
          if (assistantSoFar) speak(assistantSoFar);
        },
      });
    } catch (e) {
      console.error(e);
      setIsLoading(false);
    }
  }, [isLoading, language, topic, speak]);

  // STT: toggle listening
  const toggleListening = useCallback(() => {
    if (isLoading || isSpeaking) return;

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("이 브라우저는 음성 인식을 지원하지 않습니다. Chrome을 사용해주세요.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = speechLangMap[language];
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setInterimText("");
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }
      if (final) {
        setInterimText("");
        sendMessage(final);
      } else {
        setInterimText(interim);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimText("");
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
      setInterimText("");
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [isListening, isLoading, isSpeaking, language, sendMessage]);

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
            onClick={() => {
              synthRef.current.cancel();
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

        {/* Interim (realtime) speech text */}
        {interimText && (
          <div className="flex justify-end">
            <div className="max-w-[80%] px-4 py-3 rounded-2xl rounded-br-md text-sm leading-relaxed bg-primary/20 text-foreground/70 border border-primary/20">
              <div className="flex items-center gap-2">
                <Mic className="w-3 h-3 animate-pulse shrink-0" />
                {interimText}
              </div>
            </div>
          </div>
        )}

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

        {/* Speaking indicator */}
        {isSpeaking && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 text-xs text-muted-foreground px-2">
              <Volume2 className="w-3.5 h-3.5 animate-pulse text-accent" />
              AI가 말하고 있어요...
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
            disabled={isLoading || isSpeaking}
            className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 ${
              isListening
                ? "bg-destructive text-destructive-foreground shadow-lg scale-110 animate-pulse"
                : "gradient-primary text-primary-foreground shadow-elevated hover:scale-105"
            } disabled:opacity-40 disabled:scale-100`}
          >
            {isListening ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
          </button>
          <span className="text-xs text-muted-foreground">
            {isListening
              ? "듣고 있어요... 탭하여 중지"
              : isSpeaking
                ? "AI가 말하고 있어요"
                : isLoading
                  ? "AI가 생각하고 있어요..."
                  : "탭하여 말하기"}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ChatScreen;
