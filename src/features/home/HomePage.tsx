import type { FormEvent } from "react";
import { useCallback, useState } from "react";
import type { IEditor as LobeEditor } from "@lobehub/editor";
import { ReactCodeblockPlugin, ReactLinkPlugin, ReactListPlugin } from "@lobehub/editor";
import { ChatInput, Editor, useEditor } from "@lobehub/editor/react";
import { Loader2, SendHorizontal, Sparkles } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import type { PendingChatNavigationState } from "@/features/chat/chat-route";
import { chatPathForSession } from "@/features/chat/chat-route";
import { ComposerResizeHandle, useComposerResize } from "@/features/chat/components/ComposerResizeHandle";
import { useAshApi } from "@/lib/hermes/queries";

const newChatEditorPlugins = [ReactListPlugin, ReactLinkPlugin, ReactCodeblockPlugin];

const starterPrompts = [
  "整理一下今天最重要的三个工作项",
  "帮我把这个想法拆成可执行计划",
  "检查当前 Ash 配置还缺什么",
] as const;

export function HomePage() {
  const navigate = useNavigate();
  const { apiReady, status, tauriRuntime } = useAshApi();
  const editor = useEditor();
  const composerResize = useComposerResize({ defaultHeight: 126, maxHeight: 360, minHeight: 126 });
  const [draft, setDraft] = useState("");
  const [editorReady, setEditorReady] = useState(false);
  const runtimeReady = !tauriRuntime || Boolean(status.data?.dashboardRunning && status.data.sessionTokenConfigured);
  const submittingDisabled = !apiReady || !runtimeReady;
  const canSubmit = Boolean(draft.trim() && !submittingDisabled);

  const updateDraftFromEditor = useCallback((nextEditor: LobeEditor) => {
    setDraft(readEditorMarkdown(nextEditor));
  }, []);

  const readComposerDraft = useCallback(() => {
    if (!editorReady) {
      return draft;
    }

    return readEditorMarkdown(editor) || draft;
  }, [draft, editor, editorReady]);

  const submitPrompt = useCallback((prompt: string) => {
    const pendingPrompt = prompt.trim();
    if (!pendingPrompt) {
      return;
    }

    const state = { pendingPrompt } satisfies PendingChatNavigationState;
    navigate(chatPathForSession(null), { state });
  }, [navigate]);

  function handleSubmit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (submittingDisabled) {
      return;
    }

    submitPrompt(readComposerDraft());
  }

  function handlePressEnter({ event }: { event: KeyboardEvent }) {
    if (event.shiftKey) {
      return false;
    }

    handleSubmit();
    return true;
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto bg-card">
      <main className="mx-auto flex min-h-full w-full max-w-[900px] flex-col justify-center px-6 py-10">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-5 flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background text-foreground shadow-sm">
            <Sparkles className="h-5 w-5" />
          </div>
          <h1 className="text-[24px] font-semibold tracking-normal text-foreground">新对话</h1>
          <p className="mx-auto mt-2 max-w-[480px] text-sm leading-6 text-muted-foreground">
            从一个问题、一个目标，或一段上下文开始。
          </p>
        </div>

        <form onSubmit={handleSubmit} className="relative mx-auto w-full max-w-[760px]">
          <ComposerResizeHandle
            onMouseDown={composerResize.handleMouseDown}
            onPointerDown={composerResize.handlePointerDown}
          />
          <ChatInput
            resize={false}
            minHeight={composerResize.height}
            maxHeight={360}
            onBodyClick={() => editor.focus()}
            className="!overflow-hidden !rounded-2xl !border !border-border/70 !bg-card !shadow-[0_18px_55px_rgba(15,23,42,0.10)] focus-within:!border-primary/35 focus-within:!ring-2 focus-within:!ring-primary/10 dark:!shadow-[0_18px_55px_rgba(0,0,0,0.32)]"
            classNames={{
              body: "!bg-card !px-0 !py-0",
              footer: "!bg-card !px-0",
              header: "!bg-card !px-0",
            }}
            styles={{
              body: {
                height: composerResize.height,
                overflow: "auto",
              },
              footer: {
                width: "100%",
              },
              header: {
                width: "100%",
              },
            }}
            footer={(
              <div className="flex items-center justify-between gap-3 px-3 pb-3 pt-1">
                <div className="min-w-0 truncate text-xs text-muted-foreground">
                  {submittingDisabled ? "本地服务就绪后可以开始聊天" : "给 Ash 发消息"}
                </div>
                <Button
                  type="submit"
                  size="icon"
                  aria-label="发送"
                  className="h-9 w-9"
                  disabled={!canSubmit}
                >
                  {status.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
                </Button>
              </div>
            )}
          >
            <Editor
              autoFormatMarkdown
              content={draft}
              debounceWait={0}
              editable={!submittingDisabled}
              editor={editor}
              enablePasteMarkdown
              markdownOption
              onChange={updateDraftFromEditor}
              onInit={() => setEditorReady(true)}
              onPressEnter={handlePressEnter}
              onTextChange={updateDraftFromEditor}
              pasteMarkdownAutoConvertThreshold={3}
              placeholder={submittingDisabled ? "本地服务就绪后可以开始聊天" : "给 Ash 发消息"}
              plugins={newChatEditorPlugins}
              style={{
                height: composerResize.height,
                minHeight: composerResize.height,
              }}
              type="text"
              variant="chat"
              className="ash-composer-editor ash-composer-editor-home h-full px-4 py-3 text-[15px] leading-6 text-foreground outline-none"
              theme={{
                fontSize: 15,
                lineHeight: 1.55,
                marginMultiple: 0.45,
              }}
            />
          </ChatInput>
        </form>

        <div className="mx-auto mt-4 grid w-full max-w-[760px] gap-2 sm:grid-cols-3">
          {starterPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              className="rounded-lg border border-border/70 bg-background/80 px-3 py-3 text-left text-[13px] leading-5 text-foreground shadow-sm transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={submittingDisabled}
              onClick={() => submitPrompt(prompt)}
            >
              {prompt}
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}

function readEditorMarkdown(editor: LobeEditor) {
  try {
    const content = editor.getDocument("markdown");
    return typeof content === "string" ? content : "";
  } catch (error) {
    console.error("Failed to read new chat editor content", error);
    return "";
  }
}
