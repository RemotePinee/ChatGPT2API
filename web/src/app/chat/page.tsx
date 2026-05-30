"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, MessageSquarePlus, Plus, RefreshCw, Send, StopCircle, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";

import "highlight.js/styles/github-dark.css";

import { Button } from "@/components/ui/button";
import { streamChat, type ChatPersistedMessage, type ChatStreamMessage } from "@/lib/api";
import { useAuthGuard } from "@/lib/use-auth-guard";
import { cn } from "@/lib/utils";
import { useChatConversationsStore } from "@/store/chat-conversations";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: "idle" | "streaming" | "error";
  error?: string;
};

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// 第一句用户输入截前 24 个字做标题，做不到的退回到“新对话”。
function deriveTitle(messages: ChatPersistedMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  const text = (firstUser?.content || "").trim().replace(/\s+/g, " ");
  if (!text) return "新对话";
  return text.length > 24 ? `${text.slice(0, 24)}…` : text;
}

function toPersistedMessages(messages: ChatMessage[]): ChatPersistedMessage[] {
  return messages
    .filter((m) => m.status !== "error" && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content }));
}

function fromPersistedMessages(messages: ChatPersistedMessage[]): ChatMessage[] {
  return messages.map((m) => ({
    id: createId(),
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content,
    status: "idle" as const,
  }));
}

function formatTime(value: number): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .format(date);
}

function ChatPageContent() {
  const items = useChatConversationsStore((state) => state.items);
  const isLoadingList = useChatConversationsStore((state) => state.isLoading);
  const hasLoaded = useChatConversationsStore((state) => state.hasLoaded);
  const loadConversations = useChatConversationsStore((state) => state.load);
  const saveConversation = useChatConversationsStore((state) => state.save);
  const removeConversation = useChatConversationsStore((state) => state.remove);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string>("");
  const [activeId, setActiveId] = useState<string>("");
  const [pendingDelete, setPendingDelete] = useState<string>("");
  const [forceSwitchAccount, setForceSwitchAccount] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    void loadConversations().catch((error) => {
      const message = error instanceof Error ? error.message : "加载会话失败";
      toast.error(message);
    });
  }, [loadConversations]);

  // 新内容到达时贴底滚动；用户主动上滚后不强制拉回。
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
    setMessages((prev) => prev.map((m) => (m.status === "streaming" ? { ...m, status: "idle" } : m)));
  }, []);

  const resetSession = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
    setMessages([]);
    setConversationId("");
    setActiveId("");
    setInput("");
    setForceSwitchAccount(false);
  }, []);

  const handleNewChat = useCallback(() => {
    resetSession();
    textareaRef.current?.focus();
  }, [resetSession]);

  const handleSelect = useCallback(
    (id: string) => {
      if (id === activeId || isStreaming) return;
      const target = items.find((item) => item.id === id);
      if (!target) return;
      abortRef.current?.abort();
      abortRef.current = null;
      setIsStreaming(false);
      setMessages(fromPersistedMessages(target.messages));
      setConversationId(target.upstream_conversation_id || "");
      setActiveId(target.id);
      setInput("");
      setForceSwitchAccount(false);
    },
    [activeId, isStreaming, items],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (pendingDelete) return;
      setPendingDelete(id);
      try {
        await removeConversation(id);
        if (activeId === id) {
          resetSession();
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "删除失败";
        toast.error(message);
      } finally {
        setPendingDelete("");
      }
    },
    [activeId, pendingDelete, removeConversation, resetSession],
  );

  const handleSubmit = useCallback(async () => {
    const prompt = input.trim();
    if (!prompt || isStreaming) return;

    const userMessage: ChatMessage = { id: createId(), role: "user", content: prompt, status: "idle" };
    const assistantMessage: ChatMessage = { id: createId(), role: "assistant", content: "", status: "streaming" };
    const baseHistory = messages;
    setMessages([...baseHistory, userMessage, assistantMessage]);
    setInput("");
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const apiMessages: ChatStreamMessage[] = [
      ...baseHistory
        .filter((m) => m.status !== "error" && m.content.trim())
        .map((m) => ({ role: m.role, content: m.content }) as ChatStreamMessage),
      { role: "user", content: prompt },
    ];

    const switchAccount = forceSwitchAccount;
    if (switchAccount) {
      setForceSwitchAccount(false);
    }

    let streamCid = conversationId;
    let assistantContent = "";
    let streamFailed = false;

    try {
      for await (const event of streamChat(
        {
          model: "auto",
          messages: apiMessages,
          conversation_id: conversationId || undefined,
          force_switch_account: switchAccount || undefined,
        },
        controller.signal,
      )) {
        if (event.type === "conversation.id") {
          streamCid = event.conversation_id;
          setConversationId(event.conversation_id);
        } else if (event.type === "delta") {
          assistantContent += event.text;
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantMessage.id ? { ...m, content: m.content + event.text } : m)),
          );
        } else if (event.type === "error") {
          throw new Error(event.message);
        } else if (event.type === "done") {
          setMessages((prev) => prev.map((m) => (m.id === assistantMessage.id ? { ...m, status: "idle" } : m)));
        }
      }
    } catch (error) {
      streamFailed = true;
      if (controller.signal.aborted) {
        return;
      }
      const message = error instanceof Error ? error.message : "对话失败";
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantMessage.id ? { ...m, status: "error", error: message } : m)),
      );
      toast.error(message);
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setIsStreaming(false);
    }

    if (streamFailed || !assistantContent.trim()) {
      // 空回复（或失败）：把刚塞进去的 user + 空 assistant 占位回滚回 baseHistory。
      // 否则这条没产生回答的 user 消息会留在内存里，下一轮被当作历史回喂上游，
      // 一旦上游对这条 user 表现异常（例如自动触发工具不输出文本），下一轮也会空回复，
      // 整个会话彻底卡住。
      setMessages(baseHistory);
      return;
    }

    // done 之后一次性整条覆盖保存：包含完整历史 + upstream cid，给后端做 token 回填。
    const persisted: ChatPersistedMessage[] = [
      ...toPersistedMessages(baseHistory),
      { role: "user", content: prompt },
      { role: "assistant", content: assistantContent },
    ];
    try {
      const saved = await saveConversation({
        id: activeId || undefined,
        title: deriveTitle(persisted),
        messages: persisted,
        upstream_conversation_id: streamCid || undefined,
      });
      setActiveId(saved.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "会话保存失败";
      toast.error(message);
    }
  }, [activeId, conversationId, forceSwitchAccount, input, isStreaming, messages, saveConversation]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
        event.preventDefault();
        void handleSubmit();
      }
    },
    [handleSubmit],
  );

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 240)}px`;
  }, [input]);

  const sortedItems = useMemo(() => items, [items]);

  return (
    <section className="relative mx-auto flex h-[calc(100dvh-3.5rem)] min-h-0 w-full max-w-[1180px] gap-3 px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] sm:h-[calc(100dvh-4rem)] sm:px-4 sm:pb-6">
      <aside className="hidden w-[260px] shrink-0 flex-col gap-2 pt-3 md:flex">
        <Button
          variant="outline"
          className="h-9 cursor-pointer justify-start rounded-lg border-border bg-card/90 px-3 text-foreground"
          onClick={handleNewChat}
          disabled={isStreaming}
        >
          <MessageSquarePlus className="size-4" />
          <span className="text-[13px]">新建对话</span>
        </Button>
        <div className="hide-scrollbar min-h-0 flex-1 overflow-y-auto rounded-xl border border-border/50 bg-card/40 p-2">
          {isLoadingList && !hasLoaded ? (
            <div className="flex items-center justify-center py-10">
              <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : sortedItems.length === 0 ? (
            <div className="px-2 py-8 text-center text-[12px] text-muted-foreground">还没有历史会话</div>
          ) : (
            <ul className="flex flex-col gap-1">
              {sortedItems.map((item) => {
                const isActive = item.id === activeId;
                const isDeleting = pendingDelete === item.id;
                return (
                  <li key={item.id}>
                    <div
                      className={cn(
                        "group flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-[13px] transition-colors",
                        isActive
                          ? "bg-foreground text-background"
                          : "text-foreground hover:bg-secondary",
                      )}
                      onClick={() => handleSelect(item.id)}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{item.title || "新对话"}</div>
                        <div
                          className={cn(
                            "mt-0.5 truncate text-[10px]",
                            isActive ? "text-background/70" : "text-muted-foreground/70",
                          )}
                        >
                          {formatTime(item.updated_at)}
                        </div>
                      </div>
                      <button
                        type="button"
                        className={cn(
                          "rounded-md p-1 opacity-0 transition-opacity hover:bg-rose-100 hover:text-rose-600 group-hover:opacity-100",
                          isActive && "opacity-100",
                        )}
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleDelete(item.id);
                        }}
                        disabled={isDeleting}
                        aria-label="删除对话"
                      >
                        {isDeleting ? (
                          <LoaderCircle className="size-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="size-3.5" />
                        )}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:gap-3">
        <div className="flex shrink-0 items-center gap-2 pt-3 md:hidden">
          <Button
            variant="outline"
            className="h-9 cursor-pointer rounded-lg border-border bg-card/90 px-3 text-foreground"
            onClick={handleNewChat}
            disabled={messages.length === 0 && !isStreaming}
          >
            <Plus className="size-4" />
            <span className="text-[13px]">新建对话</span>
          </Button>
          {conversationId ? (
            <span className="ml-auto truncate font-data text-[10px] text-muted-foreground/70">
              cid: {conversationId.slice(0, 8)}
            </span>
          ) : null}
        </div>

        <div
          ref={viewportRef}
          className="hide-scrollbar mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-xl border border-border/50 bg-card/40 p-4 md:mt-3"
        >
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">
              开始一段对话，或者直接让它画一张图。
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn("flex w-full", message.role === "user" ? "justify-end" : "justify-start")}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-4 py-2.5 text-[14px] leading-6",
                      message.role === "user"
                        ? "bg-foreground text-background"
                        : "bg-secondary text-foreground",
                      message.status === "error" && "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-200",
                    )}
                  >
                    {message.role === "assistant" ? (
                      message.content ? (
                        <div className="prose prose-sm chat-md max-w-none break-words">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
                          >
                            {message.content}
                          </ReactMarkdown>
                        </div>
                      ) : message.status === "streaming" ? (
                        <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
                      ) : message.status === "error" ? (
                        <span>{message.error || "出错了"}</span>
                      ) : (
                        <span className="text-muted-foreground">（空回复）</span>
                      )
                    ) : (
                      <span className="whitespace-pre-wrap break-words">{message.content}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="shrink-0 rounded-xl border border-border/60 bg-background p-2 shadow-sm">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="发送消息，或描述你想画的图..."
            rows={1}
            className="hide-scrollbar w-full resize-none bg-transparent px-2 py-2 text-[14px] leading-6 text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
          />
          <div className="flex items-center justify-end gap-2 pt-1">
            {conversationId && !isStreaming ? (
              <Button
                variant="outline"
                size="icon"
                className={cn(
                  "size-9 cursor-pointer rounded-lg border-border",
                  forceSwitchAccount && "border-foreground bg-foreground text-background hover:bg-foreground/90 hover:text-background",
                )}
                onClick={() => setForceSwitchAccount((prev) => !prev)}
                title={forceSwitchAccount ? "下一条已切换到新账号（点击取消）" : "下一条切换到其他账号续聊"}
                aria-pressed={forceSwitchAccount}
              >
                <RefreshCw className="size-4" />
              </Button>
            ) : null}
            {isStreaming ? (
              <Button variant="outline" className="h-9 cursor-pointer rounded-lg px-3" onClick={handleStop}>
                <StopCircle className="size-4" />
                <span className="text-[13px]">停止</span>
              </Button>
            ) : (
              <Button
                className="h-9 cursor-pointer rounded-lg bg-foreground px-3 text-background hover:bg-foreground/90"
                onClick={() => void handleSubmit()}
                disabled={!input.trim()}
              >
                <Send className="size-4" />
                <span className="text-[13px]">发送</span>
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function ChatPage() {
  const { isCheckingAuth, session } = useAuthGuard();

  if (isCheckingAuth || !session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-stone-400" />
      </div>
    );
  }

  return <ChatPageContent />;
}
