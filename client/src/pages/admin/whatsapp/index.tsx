/**
 * WhatsApp Notification Centre – Admin Page
 *
 * Layout:
 *  ┌──────────────────────────────────────────────────────────────────┐
 *  │  Header: title + connection badge + refresh                      │
 *  ├──────────────────┬───────────────────────────────────────────────┤
 *  │  Left sidebar    │  Message log (chat-style)                     │
 *  │  • Status card   │  • Each outbound message as a bubble          │
 *  │  • Filter tabs   │  • Delivery status chip                       │
 *  │  • Quick-send    │                                               │
 *  │    actions       │                                               │
 *  └──────────────────┴───────────────────────────────────────────────┘
 */

import { useState } from "react";
import { Layout } from "@/components/layout";
import {
  useWhatsappStatus,
  useWhatsappMessages,
  useWhatsappTemplates,
  type WhatsappMessage,
  type WhatsappMessageStatus,
} from "@/hooks/use-whatsapp";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  MessageCircle,
  CheckCheck,
  Check,
  Clock,
  AlertCircle,
  Eye,
  RefreshCw,
  Wifi,
  WifiOff,
  FileText,
  BookOpen,
  Receipt,
  Bell,
  ChevronRight,
  Phone,
  Filter,
  Inbox,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString("en-PK", { day: "numeric", month: "short" });
}

function formatPhone(raw: string): string {
  // +923001234567 → +92 300 123 4567
  if (raw.startsWith("+92") && raw.length === 13) {
    return `+92 ${raw.slice(3, 6)} ${raw.slice(6, 9)} ${raw.slice(9)}`;
  }
  return raw;
}

// ─────────────────────────────────────────────────────────────────────────────
// Status chip
// ─────────────────────────────────────────────────────────────────────────────

type StatusConfig = {
  icon: React.ReactNode;
  label: string;
  className: string;
};

const STATUS_CONFIG: Record<WhatsappMessageStatus, StatusConfig> = {
  pending: {
    icon: <Clock className="h-3 w-3" />,
    label: "Pending",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  sent: {
    icon: <Check className="h-3 w-3" />,
    label: "Sent",
    className: "bg-blue-50 text-blue-700 border-blue-200",
  },
  delivered: {
    icon: <CheckCheck className="h-3 w-3" />,
    label: "Delivered",
    className: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },
  read: {
    icon: <Eye className="h-3 w-3" />,
    label: "Read",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  failed: {
    icon: <AlertCircle className="h-3 w-3" />,
    label: "Failed",
    className: "bg-red-50 text-red-700 border-red-200",
  },
};

function StatusChip({ status }: { status: WhatsappMessageStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
        cfg.className
      )}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Message type icon
// ─────────────────────────────────────────────────────────────────────────────

function MessageTypeIcon({ msg }: { msg: WhatsappMessage }) {
  const meta = msg.metadata as Record<string, unknown> | null;
  if (meta?.voucher_id || meta?.consolidated_voucher_id) {
    return <Receipt className="h-3.5 w-3.5 text-indigo-400" />;
  }
  if (meta?.diary_entry_id || meta?.daily_diary_id) {
    return <BookOpen className="h-3.5 w-3.5 text-blue-400" />;
  }
  if (msg.templateName?.includes("reminder") || msg.templateName?.includes("fee")) {
    return <Bell className="h-3.5 w-3.5 text-amber-400" />;
  }
  if (msg.mediaUrl) {
    return <FileText className="h-3.5 w-3.5 text-slate-400" />;
  }
  return <MessageCircle className="h-3.5 w-3.5 text-slate-400" />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Message bubble
// ─────────────────────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: WhatsappMessage }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = msg.messageBody.length > 180;
  const body = isLong && !expanded ? `${msg.messageBody.slice(0, 180)}…` : msg.messageBody;

  return (
    <div className="group flex gap-3">
      {/* Avatar */}
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200">
        <Phone className="h-3.5 w-3.5" />
      </div>

      <div className="min-w-0 flex-1">
        {/* Meta row */}
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-semibold text-slate-800">
            {formatPhone(msg.recipientNumber)}
          </span>
          <StatusChip status={msg.status as WhatsappMessageStatus} />
          {msg.templateName && (
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
              {msg.templateName}
            </span>
          )}
          <span className="ml-auto flex items-center gap-1 text-[10px] text-slate-400">
            <MessageTypeIcon msg={msg} />
            {formatRelativeTime(msg.createdAt)}
          </span>
        </div>

        {/* Body */}
        <div className="rounded-xl rounded-tl-sm border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] leading-6 text-slate-700 shadow-sm">
          <p className="whitespace-pre-wrap">{body}</p>
          {isLong && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 text-[11px] font-semibold text-indigo-600 hover:underline"
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
        </div>

        {/* Error */}
        {msg.errorMessage && (
          <p className="mt-1 flex items-center gap-1 text-[11px] text-red-500">
            <AlertCircle className="h-3 w-3" />
            {msg.errorMessage}
          </p>
        )}

        {/* Timestamps */}
        {(msg.sentAt || msg.deliveredAt || msg.readAt) && (
          <div className="mt-1 flex flex-wrap gap-3 text-[10px] text-slate-400">
            {msg.sentAt && (
              <span>Sent {formatRelativeTime(msg.sentAt)}</span>
            )}
            {msg.deliveredAt && (
              <span>Delivered {formatRelativeTime(msg.deliveredAt)}</span>
            )}
            {msg.readAt && (
              <span className="text-emerald-500">Read {formatRelativeTime(msg.readAt)}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Filter tabs
// ─────────────────────────────────────────────────────────────────────────────

const FILTER_TABS: { label: string; value: WhatsappMessageStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Sent", value: "sent" },
  { label: "Delivered", value: "delivered" },
  { label: "Read", value: "read" },
  { label: "Failed", value: "failed" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Connection status card
// ─────────────────────────────────────────────────────────────────────────────

function ConnectionCard() {
  const { data, isLoading } = useWhatsappStatus();

  if (isLoading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <Skeleton className="h-4 w-24 mb-2" />
        <Skeleton className="h-3 w-32" />
      </div>
    );
  }

  const configured = data?.configured ?? false;

  return (
    <div
      className={cn(
        "rounded-xl border p-4 shadow-sm",
        configured
          ? "border-emerald-200 bg-emerald-50"
          : "border-red-200 bg-red-50"
      )}
    >
      <div className="flex items-center gap-2">
        {configured ? (
          <Wifi className="h-4 w-4 text-emerald-600" />
        ) : (
          <WifiOff className="h-4 w-4 text-red-500" />
        )}
        <span
          className={cn(
            "text-[12px] font-bold uppercase tracking-wide",
            configured ? "text-emerald-700" : "text-red-600"
          )}
        >
          {configured ? "Connected" : "Not Configured"}
        </span>
      </div>
      {configured ? (
        <p className="mt-1 text-[11px] text-emerald-600">
          Meta Cloud API · {data?.apiVersion}
        </p>
      ) : (
        <p className="mt-1 text-[11px] text-red-500">
          Set WHATSAPP_PHONE_NUMBER_ID &amp; WHATSAPP_ACCESS_TOKEN in .env.local
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stats row
// ─────────────────────────────────────────────────────────────────────────────

function StatsRow({ messages }: { messages: WhatsappMessage[] }) {
  const counts = messages.reduce(
    (acc, m) => {
      acc[m.status as WhatsappMessageStatus] =
        (acc[m.status as WhatsappMessageStatus] ?? 0) + 1;
      return acc;
    },
    {} as Record<WhatsappMessageStatus, number>
  );

  const stats: { label: string; value: number; color: string }[] = [
    { label: "Total", value: messages.length, color: "text-slate-700" },
    { label: "Sent", value: counts.sent ?? 0, color: "text-blue-600" },
    { label: "Delivered", value: counts.delivered ?? 0, color: "text-indigo-600" },
    { label: "Read", value: counts.read ?? 0, color: "text-emerald-600" },
    { label: "Failed", value: counts.failed ?? 0, color: "text-red-600" },
  ];

  return (
    <div className="grid grid-cols-5 gap-2">
      {stats.map((s) => (
        <div
          key={s.label}
          className="rounded-lg border border-slate-100 bg-white p-2.5 text-center shadow-sm"
        >
          <p className={cn("text-lg font-bold leading-none", s.color)}>
            {s.value}
          </p>
          <p className="mt-0.5 text-[10px] font-medium text-slate-400">
            {s.label}
          </p>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Quick-action card
// ─────────────────────────────────────────────────────────────────────────────

function QuickActionCard({
  icon,
  title,
  description,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="group flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm transition-all hover:border-indigo-200 hover:bg-indigo-50"
    >
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold text-slate-800 group-hover:text-indigo-700">
          {title}
        </p>
        <p className="text-[11px] text-slate-400">{description}</p>
      </div>
      <ChevronRight className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-300 group-hover:text-indigo-400" />
    </a>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Templates panel
// ─────────────────────────────────────────────────────────────────────────────

function TemplatesPanel() {
  const { data: templates, isLoading } = useWhatsappTemplates();

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">
        Active Templates
      </p>
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>
      ) : !templates?.length ? (
        <p className="text-[12px] text-slate-400">No templates found.</p>
      ) : (
        <div className="space-y-1.5">
          {templates.map((t) => (
            <div
              key={t.id}
              className="rounded-lg border border-slate-100 bg-white px-3 py-2 shadow-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-semibold text-slate-700">
                  {t.name}
                </span>
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                  {t.category}
                </span>
              </div>
              <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-400">
                {t.bodyText}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function WhatsappPage() {
  const [activeFilter, setActiveFilter] = useState<
    WhatsappMessageStatus | "all"
  >("all");

  const { data, isLoading, refetch, isFetching } = useWhatsappMessages({
    status: activeFilter === "all" ? undefined : activeFilter,
    limit: 100,
  });

  const messages = data?.messages ?? [];

  return (
    <Layout>
      <div className="flex min-h-[calc(100vh-8.5rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="border-b border-slate-100 bg-white px-4 py-4 md:px-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-md shadow-emerald-100">
                {/* WhatsApp logo-style icon */}
                <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-emerald-600">
                  Schooliee Messaging
                </p>
                <h1 className="text-xl font-bold tracking-tight text-slate-950">
                  WhatsApp Notifications
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="w-fit border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600"
              >
                <Inbox className="mr-1.5 h-3.5 w-3.5" />
                {data?.total ?? 0} messages
              </Badge>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-lg border-slate-200"
                    onClick={() => refetch()}
                    disabled={isFetching}
                  >
                    <RefreshCw
                      className={cn("h-3.5 w-3.5", isFetching && "animate-spin")}
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Refresh messages</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>

        {/* ── Body ────────────────────────────────────────────────────── */}
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[17rem_1fr]">

          {/* ── Left sidebar ──────────────────────────────────────────── */}
          <aside className="flex flex-col gap-4 border-b border-slate-100 bg-slate-50/70 p-4 lg:border-b-0 lg:border-r">

            {/* Connection status */}
            <ConnectionCard />

            <Separator className="bg-slate-100" />

            {/* Filter tabs */}
            <div className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">
                <Filter className="h-3 w-3" />
                Filter by Status
              </p>
              <div className="flex flex-col gap-0.5">
                {FILTER_TABS.map((tab) => (
                  <button
                    key={tab.value}
                    onClick={() => setActiveFilter(tab.value)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-medium transition-all",
                      activeFilter === tab.value
                        ? "bg-white text-indigo-700 shadow-sm border border-indigo-100"
                        : "text-slate-600 hover:bg-white hover:text-slate-900"
                    )}
                  >
                    {tab.value !== "all" && (
                      <span
                        className={cn(
                          "h-2 w-2 rounded-full",
                          tab.value === "pending" && "bg-amber-400",
                          tab.value === "sent" && "bg-blue-400",
                          tab.value === "delivered" && "bg-indigo-400",
                          tab.value === "read" && "bg-emerald-400",
                          tab.value === "failed" && "bg-red-400"
                        )}
                      />
                    )}
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <Separator className="bg-slate-100" />

            {/* Quick actions */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">
                Quick Actions
              </p>
              <div className="space-y-1.5">
                <QuickActionCard
                  icon={<BookOpen className="h-4 w-4" />}
                  title="Homework Diary"
                  description="Send diary notifications to parents"
                  href="/admin/homework-diary"
                />
                <QuickActionCard
                  icon={<Receipt className="h-4 w-4" />}
                  title="Fee Vouchers"
                  description="Send vouchers via WhatsApp"
                  href="/admin/finance"
                />
                <QuickActionCard
                  icon={<Bell className="h-4 w-4" />}
                  title="Fee Reminders"
                  description="Remind parents of overdue fees"
                  href="/admin/finance"
                />
              </div>
            </div>

            <Separator className="bg-slate-100" />

            {/* Templates */}
            <TemplatesPanel />
          </aside>

          {/* ── Message log ───────────────────────────────────────────── */}
          <div className="flex min-h-0 flex-col">

            {/* Stats bar */}
            {!isLoading && messages.length > 0 && (
              <div className="border-b border-slate-100 bg-white px-4 py-3">
                <StatsRow messages={messages} />
              </div>
            )}

            <ScrollArea className="min-h-0 flex-1 px-4 py-5 md:px-5">
              <div className="mx-auto flex max-w-3xl flex-col gap-4">

                {/* Loading skeletons */}
                {isLoading && (
                  <>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="flex gap-3">
                        <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-3 w-40" />
                          <Skeleton className="h-16 w-full rounded-xl" />
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {/* Empty state */}
                {!isLoading && messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                      <MessageCircle className="h-8 w-8" />
                    </div>
                    <h3 className="mt-4 text-base font-semibold text-slate-700">
                      No messages yet
                    </h3>
                    <p className="mt-1 max-w-xs text-sm text-slate-400">
                      {activeFilter === "all"
                        ? "WhatsApp notifications will appear here once you send them from the Homework Diary or Finance pages."
                        : `No ${activeFilter} messages found. Try a different filter.`}
                    </p>
                    {activeFilter !== "all" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-4 rounded-lg"
                        onClick={() => setActiveFilter("all")}
                      >
                        Show all messages
                      </Button>
                    )}
                  </div>
                )}

                {/* Message bubbles */}
                {!isLoading &&
                  messages.map((msg) => (
                    <MessageBubble key={msg.id} msg={msg} />
                  ))}

                {/* Bottom padding anchor */}
                <div className="h-4" />
              </div>
            </ScrollArea>

            {/* Footer info bar */}
            <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-2.5">
              <p className="text-center text-[11px] text-slate-400">
                Messages are sent via{" "}
                <span className="font-semibold text-slate-500">
                  Meta Cloud API (WhatsApp Business Platform)
                </span>
                . Delivery status updates arrive via webhook.
                Auto-refreshes every 15 s.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
