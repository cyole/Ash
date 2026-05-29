import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import type { IEditor } from "@lobehub/editor";
import { ChatInput, ChatInputActionBar, Editor } from "@lobehub/editor/react";
import {
  AlertCircle,
  AtSign,
  Expand,
  Globe2,
  ImageIcon,
  Loader2,
  Paperclip,
  RotateCcw,
  Send,
  Sparkles,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ChatMessage } from "@/features/chat/types";
import type { HermesModel, HermesSession } from "@/lib/hermes/types";

const DEFAULT_MODEL_VALUE = "__hermes_default_model__";

interface ChatComposerProps {
  activeSession: HermesSession | null;
  apiReady: boolean;
  input: string;
  isStreaming: boolean;
  messages: ChatMessage[];
  modelError: unknown;
  models: HermesModel[];
  modelsLoading: boolean;
  selectedModel: string;
  onInputChange: (value: string) => void;
  onRetry: () => void;
  onSelectedModelChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
}

export function ChatComposer({
  activeSession,
  apiReady,
  input,
  isStreaming,
  messages,
  modelError,
  models,
  modelsLoading,
  selectedModel,
  onInputChange,
  onRetry,
  onSelectedModelChange,
  onSend,
  onStop,
}: ChatComposerProps) {
  const editor = Editor.useEditor();
  const editorRef = useRef<IEditor | null>(null);
  const lastSyncedInput = useRef(input);
  const hasMessages = messages.length > 0;
  const disabledReason = !apiReady
    ? "正在连接本地服务"
    : isStreaming
      ? "Hermes 正在回复"
      : "";
  const placeholder = activeSession
    ? "输入消息，按 Enter 发送，Shift Enter 换行。"
    : "描述你想让 Hermes 完成的事。";

  useEffect(() => {
    const instance = editorRef.current;
    if (!instance) {
      return;
    }

    if (!input && lastSyncedInput.current) {
      instance.cleanDocument();
      lastSyncedInput.current = "";
    }
  }, [input]);

  function handleEditorChange(instance: IEditor) {
    const content = String(instance.getDocument("markdown") ?? "");
    lastSyncedInput.current = content;
    onInputChange(content);
  }

  function handleEditorInit(instance: IEditor) {
    editorRef.current = instance;
    if (input) {
      requestAnimationFrame(() => {
        instance.setDocument("markdown", input);
      });
    }
  }

  function handleEditorEnter(event: KeyboardEvent) {
    if (event.shiftKey || event.isComposing) {
      return;
    }

    event.preventDefault();
    onSend();
    return true;
  }

  return (
    <div className="w-full">
      <div className="mx-auto w-full max-w-[860px]">
        <div className="rounded-xl border border-border bg-card shadow-[0_18px_45px_rgba(15,23,42,0.10)]">
          <ChatInput
            className="border-0 bg-transparent"
            defaultHeight={84}
            footer={
              <ChatInputActionBar
                className="px-2 pb-2 pt-1"
                left={
                  <div className="flex items-center gap-1.5">
                    <ToolButton label="附件" icon={<Paperclip className="h-3.5 w-3.5" />} />
                    <ToolButton label="提及" icon={<AtSign className="h-3.5 w-3.5" />} />
                    <ToolButton label="指令" text="/" />
                    <ToolButton label="图片" icon={<ImageIcon className="h-3.5 w-3.5" />} />
                  </div>
                }
                right={
                  <div className="flex items-center gap-1.5">
                    <ModelSelect
                      models={models}
                      modelsLoading={modelsLoading}
                      selectedModel={selectedModel}
                      onSelectedModelChange={onSelectedModelChange}
                    />
                    <ToolButton label="网络" icon={<Globe2 className="h-3.5 w-3.5" />} />
                    <ToolButton label="展开输入框" icon={<Expand className="h-3.5 w-3.5" />} />
                    {isStreaming ? (
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={onStop}
                        aria-label="停止"
                        className="h-8 w-8 rounded-full"
                      >
                        <Square className="h-3.5 w-3.5" />
                      </Button>
                    ) : (
                      <Button
                        size="icon"
                        onClick={onSend}
                        disabled={!apiReady || !input.trim()}
                        aria-label="发送"
                        className="h-8 w-8 rounded-full bg-[#1f1f1f] text-white hover:bg-black"
                      >
                        <Send className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                }
              />
            }
            maxHeight={220}
            minHeight={76}
            resize
            showResizeHandle={false}
          >
            <Editor
              autoFocus
              className="min-h-[48px] px-3 py-2 text-[14px] leading-6"
              content=""
              editable={!isStreaming && apiReady}
              editor={editor}
              enablePasteMarkdown
              markdownOption
              pasteAsPlainText={false}
              placeholder={<span className="text-muted-foreground">{disabledReason || placeholder}</span>}
              type="text"
              variant="chat"
              onChange={handleEditorChange}
              onInit={handleEditorInit}
              onPressEnter={({ event }) => handleEditorEnter(event)}
            />
          </ChatInput>

          {modelError ? (
            <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-muted/70 px-2 py-1.5 text-[12px] leading-5 text-muted-foreground">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>模型列表暂不可用。可以直接发送，Hermes 会使用默认模型。</span>
            </div>
          ) : null}
        </div>

        {hasMessages ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onRetry}
              disabled={isStreaming || !messages.some((message) => message.role === "user")}
              className="ml-auto"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              重试
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ModelSelect({
  models,
  modelsLoading,
  onSelectedModelChange,
  selectedModel,
}: {
  models: HermesModel[];
  modelsLoading: boolean;
  onSelectedModelChange: (value: string) => void;
  selectedModel: string;
}) {
  return (
    <div className="inline-flex h-7 items-center gap-1.5 rounded-full px-2 text-[12px] text-muted-foreground">
      {modelsLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
      <Select
        value={selectedModel || DEFAULT_MODEL_VALUE}
        onValueChange={(value) => {
          onSelectedModelChange(value === DEFAULT_MODEL_VALUE ? "" : value);
        }}
        disabled={modelsLoading}
      >
        <SelectTrigger
          size="sm"
          aria-label="选择模型"
          className="h-7 w-[160px] justify-start border-0 bg-transparent px-0 py-0 text-[12px] text-muted-foreground shadow-none focus-visible:ring-0"
        >
          <SelectValue placeholder="默认模型" />
        </SelectTrigger>
        <SelectContent align="end" className="max-w-[260px]">
          <SelectGroup>
            <SelectItem value={DEFAULT_MODEL_VALUE}>默认模型</SelectItem>
            {models.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                {model.id}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

function ToolButton({
  disabled = true,
  icon,
  label,
  text,
}: {
  disabled?: boolean;
  icon?: ReactNode;
  label: string;
  text?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      disabled={disabled}
      title={disabled ? `${label}稍后支持` : label}
      className="h-7 w-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {icon ?? <span className="text-[13px] font-medium">{text}</span>}
    </Button>
  );
}
