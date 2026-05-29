import type { ChangeEvent, ClipboardEvent, DragEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { IEditor } from "@lobehub/editor";
import { ChatInput, ChatInputActionBar, Editor, SendButton } from "@lobehub/editor/react";
import {
  AlertCircle,
  AtSign,
  FileText,
  Globe2,
  ImageIcon,
  Loader2,
  Maximize2,
  Minimize2,
  Paperclip,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChatAttachment } from "@/features/chat/types";
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
const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024;

interface BridgeCommand {
  name: string;
  args?: string;
  description: string;
  insertText?: string;
}

const BRIDGE_COMMANDS: readonly BridgeCommand[] = [
  { name: "usage", description: "查看本次会话用量" },
  { name: "status", description: "查看运行状态" },
  { name: "abort", description: "停止当前运行" },
  { name: "queue", args: "消息", description: "将消息加入队列" },
  { name: "plan", args: "目标", description: "生成执行计划" },
  { name: "goal", args: "目标", description: "创建长期目标" },
  { name: "goal", args: "status", insertText: "goal status", description: "查看目标状态" },
  { name: "goal", args: "pause", insertText: "goal pause", description: "暂停目标" },
  { name: "goal", args: "resume", insertText: "goal resume", description: "恢复目标" },
  { name: "goal", args: "done", insertText: "goal done", description: "完成目标" },
  { name: "goal", args: "clear", insertText: "goal clear", description: "清除目标" },
  { name: "subgoal", args: "目标", description: "添加子目标" },
  { name: "clear", description: "清理当前上下文" },
  { name: "clear", args: "--history", insertText: "clear --history", description: "清理历史" },
  { name: "title", args: "标题", description: "重命名会话" },
  { name: "compress", description: "压缩上下文" },
  { name: "steer", args: "指令", description: "给运行中的任务补充方向" },
  { name: "destroy", description: "销毁当前桥接会话" },
];

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
  onSend: (message: string, attachments?: ChatAttachment[]) => void;
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const lastSyncedInput = useRef(input);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const disabledReason = !apiReady
    ? "正在连接本地服务"
    : isStreaming
      ? "Hermes 正在回复"
      : "";
  const placeholder = activeSession
    ? "输入消息，按 Enter 发送，Shift Enter 换行。"
    : "描述你想让 Hermes 完成的事。";
  const slashOptions = useMemo(() => {
    const beforeCursor = input.trimStart();
    if (!beforeCursor.startsWith("/") || /\s/.test(beforeCursor.slice(1))) {
      return [];
    }

    const query = beforeCursor.slice(1).toLowerCase();
    return BRIDGE_COMMANDS.filter((command) =>
      command.name.includes(query) || command.insertText?.includes(query),
    ).slice(0, 8);
  }, [input]);
  const slashOpen = apiReady && !isStreaming && slashOptions.length > 0;
  const canSend = Boolean(apiReady && !isStreaming && (input.trim() || attachments.length > 0));

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
    if (slashOpen) {
      const firstCommand = slashOptions[0];
      if (firstCommand) {
        insertCommand(firstCommand);
      }
      return true;
    }

    handleSend();
    return true;
  }

  function handleSend() {
    const currentInput = currentEditorInput();
    if (!apiReady || isStreaming || (!currentInput.trim() && attachments.length === 0)) {
      return;
    }

    const nextAttachments = attachments;
    setAttachments([]);
    onSend(currentInput, nextAttachments.length > 0 ? nextAttachments : undefined);
  }

  function currentEditorInput() {
    const document = editorRef.current?.getDocument("markdown");
    return typeof document === "string" ? document : input;
  }

  function insertCommand(command: BridgeCommand) {
    const nextValue = `/${command.insertText ?? command.name} `;
    editorRef.current?.setDocument("markdown", nextValue);
    lastSyncedInput.current = nextValue;
    onInputChange(nextValue);
  }

  function handleAttachFiles(event: ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    const files = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
    if (files.length === 0) {
      return;
    }

    event.preventDefault();
    addFiles(files);
  }

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes("Files")) {
      return;
    }

    event.preventDefault();
    setDragging(true);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes("Files")) {
      return;
    }

    event.preventDefault();
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    const relatedTarget = event.relatedTarget;
    if (!(relatedTarget instanceof Node) || !event.currentTarget.contains(relatedTarget)) {
      setDragging(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes("Files")) {
      return;
    }

    event.preventDefault();
    setDragging(false);
    addFiles(Array.from(event.dataTransfer.files));
  }

  function addFiles(files: File[]) {
    if (files.length === 0) {
      return;
    }

    setAttachments((current) => {
      const known = new Set(current.map((attachment) => attachmentKey(attachment)));
      const next = [...current];

      for (const file of files) {
        const key = `${file.name}:${file.size}`;
        if (known.has(key) || file.size > MAX_ATTACHMENT_SIZE) {
          continue;
        }

        known.add(key);
        next.push(createAttachment(file));
      }

      return next;
    });
  }

  function removeAttachment(id: string) {
    setAttachments((current) => {
      const target = current.find((attachment) => attachment.id === id);
      if (target?.url?.startsWith("blob:")) {
        URL.revokeObjectURL(target.url);
      }

      return current.filter((attachment) => attachment.id !== id);
    });
  }

  return (
    <div
      className={cn(
        "w-full",
        expanded &&
          "fixed inset-0 z-50 flex items-end bg-card/95 px-5 pb-6 pt-[calc(var(--hermes-titlebar-height)+24px)] backdrop-blur-sm",
      )}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onPasteCapture={handlePaste}
    >
      <div className={cn("mx-auto w-full max-w-[1040px]", expanded && "max-w-[1180px]")}>
        <div className="relative w-full">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="sr-only"
            onChange={handleAttachFiles}
          />
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={handleAttachFiles}
          />
          <AttachmentPreview attachments={attachments} onRemove={removeAttachment} />
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
                    <ToolButton
                      disabled={!apiReady || isStreaming}
                      label="附件"
                      icon={<Paperclip className="h-3.5 w-3.5" />}
                      onClick={() => fileInputRef.current?.click()}
                    />
                    <ToolButton label="提及" icon={<AtSign className="h-3.5 w-3.5" />} />
                    <ToolButton
                      disabled={!apiReady || isStreaming}
                      label="指令"
                      text="/"
                      pressed={slashOpen}
                      onClick={() => {
                        const command = BRIDGE_COMMANDS[0];
                        if (command) {
                          insertCommand(command);
                        }
                      }}
                    />
                    <ToolButton
                      disabled={!apiReady || isStreaming}
                      label="图片"
                      icon={<ImageIcon className="h-3.5 w-3.5" />}
                      onClick={() => imageInputRef.current?.click()}
                    />
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
                      disabled={!canSend && !isStreaming}
                      generating={isStreaming}
                      shape="round"
                      size={32}
                      onSend={handleSend}
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

          {slashOpen ? (
            <div className="absolute bottom-[52px] left-3 z-20 w-[320px] overflow-hidden rounded-lg border border-border bg-popover shadow-[var(--hermes-shadow-popover)]">
              {slashOptions.map((command) => (
                <button
                  key={`${command.name}:${command.insertText ?? command.args ?? ""}`}
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    insertCommand(command);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted"
                >
                  <span className="shrink-0 font-mono text-[12px] text-foreground">
                    /{command.insertText ?? command.name}
                  </span>
                  {command.args && !command.insertText ? (
                    <span className="shrink-0 text-muted-foreground">{command.args}</span>
                  ) : null}
                  <span className="min-w-0 truncate text-muted-foreground">{command.description}</span>
                </button>
              ))}
            </div>
          ) : null}

          {dragging ? (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl border border-dashed border-primary bg-card/80 text-sm font-medium text-foreground backdrop-blur-sm">
              松开以上传附件
            </div>
          ) : null}

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

function AttachmentPreview({
  attachments,
  onRemove,
}: {
  attachments: ChatAttachment[];
  onRemove: (id: string) => void;
}) {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className="mb-2 flex max-h-28 flex-wrap gap-2 overflow-auto rounded-lg border border-border bg-muted/45 p-2">
      {attachments.map((attachment) => {
        const image = attachment.type.startsWith("image/") && attachment.url;

        return (
          <div
            key={attachment.id}
            className="group relative flex h-16 max-w-[220px] items-center gap-2 overflow-hidden rounded-md border border-border bg-card pr-7"
          >
            {image ? (
              <img src={attachment.url} alt="" className="h-16 w-16 shrink-0 object-cover" />
            ) : (
              <div className="flex h-16 w-14 shrink-0 items-center justify-center bg-muted text-muted-foreground">
                <FileText className="h-5 w-5" />
              </div>
            )}
            <div className="min-w-0 py-1.5">
              <div className="truncate text-xs font-medium">{attachment.name}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">{formatSize(attachment.size)}</div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`移除 ${attachment.name}`}
              onClick={() => onRemove(attachment.id)}
              className="absolute right-1 top-1 h-5 w-5 rounded-full bg-card/90 text-muted-foreground opacity-80 hover:bg-muted hover:text-foreground group-hover:opacity-100"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        );
      })}
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

function createAttachment(file: File): ChatAttachment {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: file.name,
    size: file.size,
    type: file.type || "application/octet-stream",
    url: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
    file,
  };
}

function attachmentKey(attachment: Pick<ChatAttachment, "name" | "size">) {
  return `${attachment.name}:${attachment.size}`;
}

function formatSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
