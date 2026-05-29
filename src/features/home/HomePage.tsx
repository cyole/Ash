import {
  Bot,
  Clock3,
  GraduationCap,
  Plus,
  RefreshCw,
  SendHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const modelChips = ["DeepSeek V4 Pro", "GPT Image 2", "Seedance 2.0"];

const recommendedTasks = [
  {
    title: "行业研究周报",
    description: "告诉我你研究的赛道，每周一给你一份市场动态、融资、新玩家、监管变化汇总",
    action: "添加任务",
  },
  {
    title: "每日学习料",
    description: "每天给你一条 15 分钟能看完的学习内容（文章 / 视频 / 播客）",
    action: "添加任务",
  },
  {
    title: "ArXiv 精选",
    description: "每天早上帮你筛 5 篇最值得读的论文，并给出摘要、亮点和时间省一半的阅读顺序",
    action: "添加任务",
  },
];

export function HomePage() {
  return (
    <div className="h-full min-h-0 overflow-auto bg-card">
      <div className="mx-auto flex min-h-full w-full max-w-[920px] flex-col px-6 pb-10 pt-16">
        <section className="mb-8">
          <div className="mb-6 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[radial-gradient(circle_at_35%_25%,#7dd3fc,#2563eb_48%,#111827)] text-white shadow-sm">
              <Bot className="h-4 w-4" />
            </span>
            <span className="text-[16px] font-semibold text-foreground">Hermes</span>
          </div>
          <h1 className="text-[22px] font-semibold leading-8 tracking-normal text-foreground">
            欢迎回来
            <br />
            准备开始了吗
          </h1>
        </section>

        <section className="mb-3 rounded-[18px] border border-border bg-card shadow-[0_18px_50px_hsl(0_0%_0%/0.08)]">
          <Textarea
            aria-label="首页提问输入框"
            className="min-h-[118px] resize-none border-0 bg-transparent px-4 py-4 text-[14px] leading-6 shadow-none focus-visible:ring-0"
            placeholder="提问、创建或开始任务。使用 @ 分配任务给其他智能体。"
          />
          <div className="flex items-center justify-between gap-3 border-t border-border/80 px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 rounded-full bg-muted/70 px-3 text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Sparkles className="h-3.5 w-3.5" />
                智能
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="添加"
                className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 rounded-full px-3 text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                默认模型
              </Button>
              <Button asChild size="icon" aria-label="发送" className="h-9 w-9 rounded-full">
                <Link to="/chat">
                  <SendHorizontal className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-border/60 px-4 py-3 text-[13px] text-muted-foreground">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              <span>创建你自己的消息频道</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="关闭消息频道提示"
              className="h-7 w-7 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </section>

        <div className="mb-14 flex flex-wrap items-center justify-center gap-2">
          <Badge className="border-0 bg-muted text-muted-foreground">上新</Badge>
          {modelChips.map((chip) => (
            <Button
              key={chip}
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-full bg-card px-4 text-[13px] font-medium shadow-sm"
            >
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              {chip}
            </Button>
          ))}
        </div>

        <section>
          <div className="mb-5 flex items-center justify-between gap-4">
            <p className="text-[13px] text-muted-foreground">为你推荐的一些功能</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 rounded-lg text-[13px] text-foreground hover:bg-muted"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              换一批
            </Button>
          </div>

          <div className="space-y-3">
            {recommendedTasks.map((task) => (
              <article key={task.title} className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
                <div className="flex items-start justify-between gap-4 border-b border-dashed border-border pb-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <GraduationCap className="h-4 w-4" />
                    </span>
                    <h2 className="truncate text-[15px] font-semibold text-foreground">{task.title}</h2>
                    <Clock3 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`关闭 ${task.title}`}
                    className="h-7 w-7 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="flex items-end justify-between gap-4 pt-4">
                  <div className="min-w-0">
                    <p className="text-[14px] leading-6 text-foreground">{task.description}</p>
                    <Badge className="mt-4 rounded-md bg-muted/70 text-muted-foreground">模板</Badge>
                  </div>
                  <Button type="button" variant="outline" className="h-9 shrink-0 rounded-full px-4 shadow-sm">
                    {task.action}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
