"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
    ArrowDownLeft,
    ArrowUpRight,
    Check,
    CircleDollarSign,
    CreditCard,
    LayoutDashboard,
    Menu,
    PiggyBank,
    ReceiptText,
    Settings,
    Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isValidMonth } from "@/lib/dates";
import { formatMonthLabel, formatMxn, formatMxnWhole } from "@/lib/format";
import { useCategoryName } from "@/i18n/category-name";
import { Button } from "@/components/ui/button";
import {
    Sheet,
    SheetContent,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";
import { LogoutButton } from "@/components/auth/LogoutButton";
import {
    isSidebarLinkActive,
    type SidebarAlert,
    type SidebarModel,
} from "./sidebar-model";
import { nextNavScrollState, type NavScrollState } from "./scroll-header";

const SETTLEMENT_HREF = "/settlement";

type Props = {
    email?: string;
    name?: string;
    model: SidebarModel;
};

function Brand() {
    const t = useTranslations("nav");
    return (
        <Link
            href="/dashboard"
            aria-label={t("home")}
            className="flex shrink-0 items-center gap-2.5 px-2 py-1 text-[15px] font-bold tracking-tight"
        >
            <span
                aria-hidden="true"
                className="flex size-8 items-end justify-center gap-[3px] rounded-[9px] bg-white pb-[8px]"
            >
                <span className="h-[17px] w-1 rounded-sm bg-bucket-essentials" />
                <span className="h-[11px] w-1 rounded-sm bg-bucket-discretionary" />
                <span className="h-2 w-1 rounded-sm bg-positive" />
            </span>
            Fast Expense
        </Link>
    );
}

function SidebarContents({
    email,
    name,
    model,
    pathname,
    savingsHref,
    explicitMonth,
    onNavigate,
}: Props & {
    pathname: string;
    savingsHref: string;
    explicitMonth?: string;
    onNavigate?: () => void;
}) {
    const t = useTranslations("nav");
    const tBuckets = useTranslations("common.buckets");
    const locale = useLocale();
    const categoryName = useCategoryName();
    const groups = [
        {
            title: t("groups.overview"),
            links: [
                {
                    href: "/dashboard",
                    label: t("links.dashboard"),
                    Icon: LayoutDashboard,
                },
                {
                    href: "/expenses",
                    label: t("links.expenses"),
                    Icon: ReceiptText,
                },
            ],
        },
        {
            title: t("groups.money"),
            links: [
                { href: "/income", label: t("links.income"), Icon: Wallet },
                ...(model.settlement
                    ? [
                          {
                              href: SETTLEMENT_HREF,
                              label: t("links.settlement"),
                              Icon: CircleDollarSign,
                          },
                      ]
                    : []),
                {
                    href: "/cards",
                    label: t("links.cards"),
                    Icon: CreditCard,
                },
                {
                    href: savingsHref,
                    label: t("links.savings"),
                    Icon: PiggyBank,
                },
            ],
        },
        {
            title: t("groups.setup"),
            links: [
                {
                    href: "/settings",
                    label: t("links.settings"),
                    Icon: Settings,
                },
            ],
        },
    ];
    const monthLabel = formatMonthLabel(model.period.month, locale);
    const settlement = model.settlement;
    const settlementStatus =
        settlement?.direction === "she_owes"
            ? t("settlement.sheOwes", { partner: settlement.partnerName })
            : settlement?.direction === "you_owe"
              ? t("settlement.youOwe", { partner: settlement.partnerName })
              : t("settlement.settled");
    const alertName = (alert: SidebarAlert) =>
        alert.kind === "bucket"
            ? tBuckets(alert.bucket)
            : categoryName(alert.name);
    const SettlementIcon =
        settlement?.direction === "she_owes"
            ? ArrowUpRight
            : settlement?.direction === "you_owe"
              ? ArrowDownLeft
              : Check;
    return (
        <div className="flex min-h-full flex-col px-[14px] py-[18px]">
            <div onClick={onNavigate}>
                <Brand />
            </div>
            <nav aria-label={t("mainNavigation")} className="mt-5">
                {groups.map((group) => (
                    <div key={group.title} className="mb-4">
                        <p className="mb-2 px-3 text-[10px] font-semibold tracking-[0.12em] text-sidebar-muted uppercase">
                            {group.title}
                        </p>
                        <div className="space-y-[3px]">
                            {group.links.map(({ href, label, Icon }) => (
                                <Link
                                    key={href}
                                    href={
                                        explicitMonth &&
                                        href !== "/settings" &&
                                        !href.includes("?")
                                            ? `${href}?month=${explicitMonth}`
                                            : href
                                    }
                                    onClick={onNavigate}
                                    aria-current={
                                        isSidebarLinkActive(pathname, href)
                                            ? "page"
                                            : undefined
                                    }
                                    aria-label={
                                        href === SETTLEMENT_HREF && settlement
                                            ? t("settlement.linkLabel", {
                                                  status: settlementStatus,
                                                  amount: formatMxn(
                                                      settlement.amount,
                                                  ),
                                              })
                                            : undefined
                                    }
                                    className={cn(
                                        "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[9px] px-3 py-[9px] text-sm font-medium text-sidebar-muted transition-colors hover:bg-sidebar-panel hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
                                        isSidebarLinkActive(pathname, href) &&
                                            "bg-sidebar-panel font-semibold text-white",
                                    )}
                                >
                                    <span className="flex items-center gap-[11px]">
                                        <Icon
                                            aria-hidden="true"
                                            className="size-[18px] shrink-0"
                                        />
                                        {label}
                                    </span>
                                    {href === SETTLEMENT_HREF && settlement && (
                                        <span
                                            className={cn(
                                                "ml-auto flex shrink-0 items-center gap-1 rounded-full px-1.5 py-1 text-[10px] leading-tight",
                                                settlement.direction ===
                                                    "she_owes"
                                                    ? "bg-sidebar-positive-tint text-sidebar-positive"
                                                    : settlement.direction ===
                                                        "you_owe"
                                                      ? "bg-sidebar-owed-tint text-sidebar-owed"
                                                      : "bg-sidebar-neutral text-sidebar-muted",
                                            )}
                                        >
                                            <SettlementIcon
                                                aria-hidden="true"
                                                className="size-3 shrink-0"
                                            />
                                            <span>
                                                {settlement.direction ===
                                                "settled"
                                                    ? t("settlement.settled")
                                                    : formatMxn(
                                                          settlement.amount,
                                                      )}
                                            </span>
                                        </span>
                                    )}
                                </Link>
                            ))}
                        </div>
                    </div>
                ))}
            </nav>
            <section
                aria-label={t("thisMonth")}
                className="rounded-[11px] bg-sidebar-panel p-[14px]"
            >
                <div className="flex items-center justify-between text-[10px] text-sidebar-muted">
                    <span className="font-semibold uppercase">
                        {t("thisMonth")}
                    </span>
                    <span>
                        {t("dayProgress", {
                            day: model.period.day,
                            days: model.period.daysInMonth,
                        })}
                    </span>
                </div>
                <p className="mt-1 text-[10px] text-sidebar-muted">
                    {monthLabel}
                </p>
                <div
                    aria-hidden="true"
                    className="mt-[7px] mb-[13px] h-[3px] overflow-hidden rounded-full bg-sidebar-neutral"
                >
                    <div
                        className="h-full bg-sidebar-progress"
                        style={{ width: `${model.period.progress}%` }}
                    />
                </div>
                <dl className="space-y-[9px] text-xs">
                    <div className="flex justify-between gap-2">
                        <dt className="text-sidebar-muted">
                            {t("totals.spent")}
                        </dt>
                        <dd className="font-semibold tabular-nums text-sidebar-spent">
                            {formatMxnWhole(model.totals.spent)}
                        </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                        <dt className="text-sidebar-muted">
                            {t("totals.saved")}
                        </dt>
                        <dd className="font-semibold tabular-nums text-sidebar-saved">
                            {formatMxnWhole(model.totals.saved)}
                        </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                        <dt className="text-sidebar-muted">
                            {t("totals.net")}
                        </dt>
                        <dd
                            className={cn(
                                "font-semibold tabular-nums",
                                model.totals.net < 0
                                    ? "text-sidebar-danger"
                                    : "text-sidebar-positive",
                            )}
                        >
                            {formatMxnWhole(model.totals.net)}
                        </dd>
                    </div>
                </dl>
                {model.alerts.length > 0 && (
                    <section
                        aria-label={t("overBudget")}
                        className="mt-3 border-t border-sidebar-neutral pt-3"
                    >
                        <div className="mb-2 flex items-center justify-between text-[10px]">
                            <span className="font-semibold text-sidebar-muted uppercase">
                                {t("overBudget")}
                            </span>
                            <span className="rounded bg-sidebar-danger-tint px-1.5 py-0.5 text-sidebar-danger">
                                {model.alerts.length}
                            </span>
                        </div>
                        <ul className="space-y-1.5">
                            {model.alerts.map((alert) => (
                                <li key={`${alert.kind}-${alert.key}`}>
                                    <Link
                                        href={alert.href}
                                        onClick={onNavigate}
                                        aria-label={t("alertLabel", {
                                            name: alertName(alert),
                                            kind: t(`alertKind.${alert.kind}`),
                                            amount: formatMxn(alert.amount),
                                            month: monthLabel,
                                        })}
                                        className="flex items-center gap-1.5 rounded-md bg-sidebar-alert px-2 py-1.5 text-[10px] text-sidebar-alert-text hover:brightness-125"
                                    >
                                        <span
                                            aria-hidden="true"
                                            className="size-1 shrink-0 rounded-full bg-sidebar-danger"
                                        />
                                        <span className="min-w-0 flex-1 truncate">
                                            {alertName(alert)} ·{" "}
                                            {t(`alertKind.${alert.kind}`)}
                                        </span>
                                        <span className="shrink-0 font-semibold tabular-nums text-sidebar-danger">
                                            +{formatMxn(alert.amount)}
                                        </span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}
            </section>
            <div className="mt-auto pt-5">
                <div className="flex items-center gap-2.5 border-t border-sidebar-panel px-1 pt-4">
                    <span
                        aria-hidden="true"
                        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sidebar-neutral text-[10px] font-semibold"
                    >
                        {(name || email || t("account"))
                            .slice(0, 2)
                            .toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">
                            {name || t("account")}
                        </p>
                        {email && (
                            <p
                                className="truncate text-[10px] text-sidebar-muted"
                                title={email}
                            >
                                {email}
                            </p>
                        )}
                    </div>
                    <LogoutButton iconOnly />
                </div>
            </div>
        </div>
    );
}

export function AppNav(props: Props) {
    const t = useTranslations("nav");
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [open, setOpen] = useState(false);
    const [barHidden, setBarHidden] = useState(false);
    const scrollState = useRef<NavScrollState>({ hidden: false, lastY: 0 });
    useEffect(() => {
        scrollState.current = { hidden: false, lastY: window.scrollY };
        function onScroll() {
            const next = nextNavScrollState(
                scrollState.current,
                window.scrollY,
                document.documentElement.scrollHeight - window.innerHeight,
            );
            scrollState.current = next;
            setBarHidden(next.hidden);
        }
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);
    function revealBar() {
        scrollState.current = { ...scrollState.current, hidden: false };
        setBarHidden(false);
    }
    const selectedMonth = searchParams.get("month");
    const contentProps = {
        explicitMonth:
            selectedMonth && isValidMonth(selectedMonth)
                ? selectedMonth
                : undefined,
        ...props,
        pathname,
        savingsHref: "/category/savings",
    };
    return (
        <>
            <aside
                aria-label={t("sidebar")}
                className="sidebar-theme fixed inset-y-0 left-0 z-40 hidden w-[252px] overflow-x-hidden overflow-y-auto bg-sidebar text-sidebar-foreground lg:block"
            >
                <SidebarContents {...contentProps} />
            </aside>
            {/* A keyboard user tabbing into a hidden bar gets it back. */}
            <header
                data-hidden={barHidden}
                onFocusCapture={revealBar}
                className={cn(
                    "sidebar-theme sticky top-0 z-30 flex h-[calc(4rem+env(safe-area-inset-top))] items-center gap-2 bg-sidebar px-3 pt-[env(safe-area-inset-top)] text-sidebar-foreground transition-transform duration-200 motion-reduce:transition-none lg:hidden",
                    barHidden && "-translate-y-full",
                )}
            >
                <Sheet open={open} onOpenChange={setOpen}>
                    <SheetTrigger
                        render={
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                className="text-white hover:bg-sidebar-panel hover:text-white"
                                aria-label={t("openMenu")}
                            >
                                <Menu />
                            </Button>
                        }
                    />
                    <SheetContent
                        className="sidebar-theme w-[252px] max-w-[calc(100vw-2rem)] gap-0 overflow-x-hidden overflow-y-auto border-0 bg-sidebar p-0 text-sidebar-foreground"
                        showCloseButton={false}
                    >
                        <SheetTitle className="sr-only">
                            {t("navigation")}
                        </SheetTitle>
                        <SidebarContents
                            {...contentProps}
                            onNavigate={() => setOpen(false)}
                        />
                    </SheetContent>
                </Sheet>
                <Brand />
            </header>
        </>
    );
}
