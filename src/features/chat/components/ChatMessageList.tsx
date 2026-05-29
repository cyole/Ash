import { useEffect, useRef } from "react";
import { AnimatePresence, m } from "motion/react";
import { AlertCircle, Bot, Loader2 } from "lucide-react";
import { LobeRuntimeProvider } from "@/features/chat/components/LobeRuntimeProvider";
import type { ChatMessage } from "@/features/chat/types";
import { MessageBubble } from "@/features/chat/components/MessageBubble";
import { PanelNotice } from "@/features/chat/components/PanelNotice";
import { useHermesSettings } from "@/features/settings/settings-store";
import { errorMessage } from "@/lib/errors";

interface ChatMessageListProps {
  error: unknown;
  loading: boolean;
  messages: ChatMessage[];
  onCopyMessage: (message: ChatMessage) => void;
  onRetryMessage: (messageId: string) => void;
}

export function ChatMessageList({
  error,
  loading,
  messages,
  onCopyMessage,
  onRetryMessage,
}: ChatMessageListProps) {
  const { settings } = useHermesSettings();
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const previousMessageCountRef = useRef(0);
  const lastMessage = messages.at(-1);
  const motion = messageMotion(settings.chatTransitionMode, settings.animationMode);

  useEffect(() => {
    const messageCountChanged = previousMessageCountRef.current !== messages.length;
    previousMessageCountRef.current = messages.length;

    if (!messageCountChanged && lastMessage?.streaming && !settings.autoScrollOnStreaming) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({
        behavior: lastMessage?.streaming || settings.animationMode === "disabled" ? "auto" : "smooth",
        block: "end",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [
    lastMessage?.content,
    lastMessage?.streaming,
    messages.length,
    settings.animationMode,
    settings.autoScrollOnStreaming,
  ]);

  if (loading && messages.length === 0) {
    return <PanelNotice icon={<Loader2 className="h-4 w-4 animate-spin" />} title="正在加载消息" />;
  }

  if (error && messages.length === 0) {
    return (
      <PanelNotice
        icon={<AlertCircle className="h-4 w-4" />}
        title="消息暂不可用"
        description={`${errorMessage(error)}。刷新会话，或稍后重试。`}
      />
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <PanelNotice
          icon={<Bot className="h-4 w-4" />}
          title="给 Hermes 一个任务"
          description="可以直接提问，也可以描述要它在本地完成的操作。"
        />
      </div>
    );
  }

  return (
    <LobeRuntimeProvider>
      <div className="mx-auto flex w-full max-w-[960px] flex-col gap-4 pb-4 pt-2">
        <AnimatePresence initial={false}>
          {messages.map((message) => (
            <m.div
              key={message.id}
              layout={motion.layout}
              initial={motion.initial}
              animate={motion.animate}
              exit={motion.exit}
              transition={motion.transition}
            >
              <MessageBubble
                message={message}
                onCopy={() => onCopyMessage(message)}
                onRetry={() => onRetryMessage(message.id)}
              />
            </m.div>
          ))}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>
    </LobeRuntimeProvider>
  );
}

function messageMotion(
  transitionMode: "fadeIn" | "none" | "smooth",
  animationMode: "agile" | "disabled" | "elegant",
) {
  if (animationMode === "disabled" || transitionMode === "none") {
    return {
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 1, y: 0 },
      initial: false as const,
      layout: false as const,
      transition: { duration: 0 },
    };
  }

  const duration = animationMode === "elegant" ? 0.26 : 0.16;
  const y = transitionMode === "smooth" ? 12 : 0;

  return {
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: transitionMode === "smooth" ? -8 : 0 },
    initial: { opacity: 0, y },
    layout: transitionMode === "smooth" ? ("position" as const) : false,
    transition: { duration, ease: [0.2, 0, 0, 1] as const },
  };
}
