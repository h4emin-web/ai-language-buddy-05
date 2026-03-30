import { useState } from "react";
import SetupScreen, { type Language, type Topic } from "@/components/SetupScreen";
import ChatScreen from "@/components/ChatScreen";

interface Session {
  language: Language;
  topic: Topic;
  apiKey: string;
}

const Index = () => {
  const [session, setSession] = useState<Session | null>(null);

  if (session) {
    return (
      <ChatScreen
        language={session.language}
        topic={session.topic}
        apiKey={session.apiKey}
        onEnd={() => setSession(null)}
      />
    );
  }

  return (
    <SetupScreen
      onStart={(language, topic, apiKey) => setSession({ language, topic, apiKey })}
    />
  );
};

export default Index;
