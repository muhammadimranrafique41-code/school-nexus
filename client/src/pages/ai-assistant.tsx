import { AiAssistantChat } from "@/components/ai-assistant-chat";
import { Layout } from "@/components/layout";

export default function AiAssistantPage() {
  return (
    <Layout>
      <div className="p-4 md:p-6">
        <AiAssistantChat />
      </div>
    </Layout>
  );
}
