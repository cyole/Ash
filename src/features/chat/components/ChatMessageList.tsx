import { useEffect, useRef } from "react";
import { AnimatePresence, m } from "motion/react";
import { Bot, Loader2 } from "lucide-react";
import type { ChatMessage } from "@/features/chat/types";
import { MessageBubble } from "@/features/chat/components/MessageBubble";
import { PanelNotice } from "@/features/chat/components/PanelNotice";

interface ChatMessageListProps {
  loading: boolean;
  messages: ChatMessage[];
}

export function ChatMessageList({ loading, messages }: ChatMessageListProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const lastMessage = messages.at(-1);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({
        behavior: lastMessage?.streaming ? "auto" : "smooth",
        block: "end",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [lastMessage?.content, lastMessage?.streaming, messages.length]);

  if (loading && messages.length === 0) {
    return <PanelNotice icon={<Loader2 className="h-4 w-4 animate-spin" />} title="正在加载消息" />;
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
    <div className="mx-auto flex w-full max-w-[960px] flex-col gap-4 pb-4 pt-2">
      <AnimatePresence initial={false}>
        {messages.map((message) => (
          <m.div
            key={message.id}
            layout="position"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
          >
            <MessageBubble message={message} />
          </m.div>
        ))}
      </AnimatePresence>
      <div ref={bottomRef} />
    </div>
  );
}
