import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import type { IEditor } from "@lobehub/editor";
import { ChatInput, ChatInputActionBar, Editor, SendButton } from "@lobehub/editor/react";
import {
  AlertCircle,
  AtSign,
  Globe2,
  ImageIcon,
  Loader2,
  Maximize2,
  Minimize2,
  Paperclip,
  Sparkles,
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
import type { HermesModel, HermesSession } from "@/lib/hermes/types";
import { cn } from "@/lib/utils";

const DEFAULT_MODEL_VALUE = "__hermes_default_model__";

interface ChatComposerProps {
  activeSession: HermesSession | null;
  apiReady: boolean;
  input: string;
  isStreaming: boolean;
  modelError: unknown;
  models: HermesModel[];
  modelsLoading: boolean;
  selectedModel: string;
  onInputChange: (value: string) => void;
  onSelectedModelChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
}

export function ChatComposer({
  activeSession,
  apiReady,
  input,
  isStreaming,
  modelError,
  models,
  modelsLoading,
  selectedModel,
  onInputChange,
  onSelectedModelChange,
  onSend,
  onStop,
}: ChatComposerProps) {
  const editor = Editor.useEditor();
  const editorRef = useRef<IEditor | null>(null);
  const lastSyncedInput = useRef(input);
  const [expanded, setExpanded] = useState(false);
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
    <div
      className={cn(
        "w-full",
        expanded &&
          "fixed inset-0 z-50 flex items-end bg-card/95 px-5 pb-6 pt-[calc(var(--hermes-titlebar-height)+24px)] backdrop-blur-sm",
      )}
    >
      <div className={cn("mx-auto w-full max-w-[1040px]", expanded && "max-w-[1180px]")}>
        <div className="w-full">
          <ChatInput
            className="hermes-chat-input-shell"
            classNames={{
              body: "hermes-chat-composer-body",
              footer: "hermes-chat-composer-footer",
            }}
            defaultHeight={expanded ? 220 : 88}
            footer={
              <ChatInputActionBar
                className="hermes-chat-action-bar"
                left={
                  <div className="flex min-w-0 items-center gap-1.5">
                    <ToolButton label="附件" icon={<Paperclip className="h-3.5 w-3.5" />} />
                    <ToolButton label="提及" icon={<AtSign className="h-3.5 w-3.5" />} />
                    <ToolButton label="指令" text="/" />
                    <ToolButton label="图片" icon={<ImageIcon className="h-3.5 w-3.5" />} />
                  </div>
                }
                right={
                  <div className="ml-auto flex min-w-0 items-center justify-end gap-1.5">
                    <ModelSelect
                      models={models}
                      modelsLoading={modelsLoading}
                      selectedModel={selectedModel}
                      onSelectedModelChange={onSelectedModelChange}
                    />
                    <ToolButton label="网络" icon={<Globe2 className="h-3.5 w-3.5" />} />
                    <ToolButton
                      disabled={false}
                      label={expanded ? "收起输入框" : "展开输入框"}
                      icon={
                        expanded ? (
                          <Minimize2 className="h-3.5 w-3.5" />
                        ) : (
                          <Maximize2 className="h-3.5 w-3.5" />
                        )
                      }
                      pressed={expanded}
                      onClick={() => setExpanded((current) => !current)}
                    />
                    <SendButton
                      disabled={!apiReady || (!isStreaming && !input.trim())}
                      generating={isStreaming}
                      shape="round"
                      size={32}
                      onSend={onSend}
                      onStop={onStop}
                    />
                  </div>
                }
              />
            }
            fullscreen={expanded}
            maxHeight={expanded ? 420 : 220}
            minHeight={expanded ? 320 : 88}
            resize={false}
            showResizeHandle={false}
          >
            <Editor
              autoFocus
              className="hermes-chat-editor min-h-[64px] text-[14px] leading-6"
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
    <div className="inline-flex h-7 min-w-0 items-center gap-1.5 rounded-full px-2 text-[12px] text-muted-foreground">
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
          className="h-7 w-[148px] justify-start border-0 bg-transparent px-0 py-0 text-[12px] text-muted-foreground shadow-none focus-visible:ring-0"
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
  onClick,
  pressed,
  text,
}: {
  disabled?: boolean;
  icon?: ReactNode;
  label: string;
  onClick?: () => void;
  pressed?: boolean;
  text?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      title={disabled ? `${label}稍后支持` : label}
      className={cn(
        "h-7 w-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground",
        pressed && "bg-muted text-foreground",
      )}
    >
      {icon ?? <span className="text-[13px] font-medium">{text}</span>}
    </Button>
  );
}
