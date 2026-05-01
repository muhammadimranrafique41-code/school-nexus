import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Bot, Database, Loader2, Send, Sparkles, UserRound } from "lucide-react";
import { api } from "@shared/routes";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type AiChatResponse = {
  answer: string;
  sources: string[];
  scopedTo: {
    role: "admin" | "teacher";
    classNames: string[];
  };
  generatedAt: string;
};

const starterPrompts = [
  "Which classes have the lowest attendance?",
  "Summarize fee collection and overdue balances.",
  "What homework is still pending?",
  "Show class sizes and homeroom teachers.",
];

export function AiAssistantChat() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Ask me about attendance, classes, fee collection, vouchers, wallet balances, or homework. I will only use records you are allowed to access.",
    },
  ]);
  const [lastResponse, setLastResponse] = useState<AiChatResponse | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      const history = messages
        .filter((item) => item.content.trim())
        .slice(-10)
        .map((item) => ({ role: item.role, content: item.content }));
      const response = await apiRequest(api.ai.chat.method, api.ai.chat.path, { message, history });
      return (await response.json()) as AiChatResponse;
    },
    onSuccess: (data) => {
      setLastResponse(data);
      setMessages((current) => [...current, { role: "assistant", content: data.answer }]);
    },
    onError: (error) => {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: error instanceof Error ? error.message : "I could not answer that request right now.",
        },
      ]);
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, chatMutation.isPending]);

  const scopeLabel = useMemo(() => {
    if (!lastResponse) return "Live school records";
    if (lastResponse.scopedTo.role === "admin") return "Admin scope: all classes";
    return lastResponse.scopedTo.classNames.length
      ? `Teacher scope: ${lastResponse.scopedTo.classNames.join(", ")}`
      : "Teacher scope: no assigned classes found";
  }, [lastResponse]);

  const sendMessage = (message: string) => {
    const trimmed = message.trim();
    if (!trimmed || chatMutation.isPending) return;
    setInput("");
    setMessages((current) => [...current, { role: "user", content: trimmed }]);
    chatMutation.mutate(trimmed);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    sendMessage(input);
  };

  return (
    <div className="flex min-h-[calc(100vh-8.5rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-white px-4 py-4 md:px-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-blue-500 text-white shadow-md shadow-indigo-100">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-indigo-500">Schooliee Intelligence</p>
              <h1 className="text-xl font-bold tracking-tight text-slate-950">AI School Assistant</h1>
            </div>
          </div>
          <Badge variant="outline" className="w-fit border-indigo-100 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700">
            <Database className="mr-1.5 h-3.5 w-3.5" />
            {scopeLabel}
          </Badge>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_18rem]">
        <div className="flex min-h-0 flex-col">
          <ScrollArea className="min-h-0 flex-1 px-4 py-5 md:px-5">
            <div className="mx-auto flex max-w-4xl flex-col gap-4">
              {messages.map((message, index) => {
                const isUser = message.role === "user";
                return (
                  <div key={`${message.role}-${index}`} className={cn("flex gap-3", isUser && "justify-end")}>
                    {!isUser && (
                      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                        <Bot className="h-4 w-4" />
                      </div>
                    )}
                    <div
                      className={cn(
                        "max-w-[min(42rem,85%)] whitespace-pre-wrap rounded-xl border px-4 py-3 text-sm leading-6 shadow-sm",
                        isUser
                          ? "border-indigo-500 bg-indigo-600 text-white"
                          : "border-slate-200 bg-slate-50 text-slate-800",
                      )}
                    >
                      {message.content}
                    </div>
                    {isUser && (
                      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                        <UserRound className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                );
              })}

              {chatMutation.isPending && (
                <div className="flex gap-3">
                  <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Checking live school records
                  </div>
                </div>
              )}
              <div ref={scrollRef} />
            </div>
          </ScrollArea>

          <div className="border-t border-slate-100 bg-white p-4 md:p-5">
            <form onSubmit={handleSubmit} className="mx-auto flex max-w-4xl flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                {starterPrompts.map((prompt) => (
                  <Button
                    key={prompt}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => sendMessage(prompt)}
                    disabled={chatMutation.isPending}
                    className="h-8 rounded-lg border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
                  >
                    {prompt}
                  </Button>
                ))}
              </div>
              <div className="flex items-end gap-2">
                <Textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Ask about attendance, fees, classes, vouchers, or homework..."
                  className="min-h-12 resize-none rounded-xl border-slate-200 bg-slate-50 text-sm focus-visible:ring-indigo-500"
                  disabled={chatMutation.isPending}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      sendMessage(input);
                    }
                  }}
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={!input.trim() || chatMutation.isPending}
                  className="h-12 w-12 shrink-0 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700"
                  title="Send"
                >
                  {chatMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </form>
          </div>
        </div>

        <aside className="border-t border-slate-100 bg-slate-50/70 p-4 lg:border-l lg:border-t-0">
          <div className="space-y-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Grounding</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Answers are calculated from scoped Drizzle queries before the model writes a response.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(lastResponse?.sources ?? ["attendance", "classes", "users", "families", "finance_vouchers", "homework_assignments"]).map((source) => (
                <Badge key={source} variant="secondary" className="rounded-md bg-white text-[10px] font-semibold text-slate-500">
                  {source}
                </Badge>
              ))}
            </div>
            {lastResponse?.generatedAt && (
              <p className="text-xs text-slate-400">Last checked {new Date(lastResponse.generatedAt).toLocaleString()}</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
