import { useState } from "react";
import SetupScreen, { type Language, type Topic } from "@/components/SetupScreen";
import ChatScreen from "@/components/ChatScreen";

const Index = () => {
  const [session, setSession] = useState<{ language: Language; topic: Topic } | null>(null);

  if (session) {
    return (
      <ChatScreen
        language={session.language}
        topic={session.topic}
        onEnd={() => setSession(null)}
      />
    );
  }

  return <SetupScreen onStart={(language, topic) => setSession({ language, topic })} />;
};

export default Index;
