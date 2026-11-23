import {
    computeCoupleBalance,
    isBalanceSettled,
    type CoupleBalance,
    type SettlementInputs,
} from "@/lib/domain/settlement";
import type { Locale } from "@/i18n/config";
import { getTodayCdmx } from "@/lib/dates";
import { formatExpenseDate, formatExpenseDay, formatMxn } from "@/lib/format";
import type { SettlementJournalItem } from "@/lib/services/settlement/settlement.service";
import {
    debtTitle,
    type MovementsTranslator,
} from "@/components/movement/movement-display";
import type { SettlementTranslator } from "./balance-display";

type ExpenseRow = Extract<SettlementJournalItem, { kind: "your_expense" }>;
type DebtRow = Extract<SettlementJournalItem, { kind: "partner_debt" }>;
type TransferRow = Extract<SettlementJournalItem, { kind: "transfer" }>;

export type SettlementSummaryScope = "open" | "closed";

export type SettlementSummaryIntl = {
    t: SettlementTranslator;
    tm: MovementsTranslator;
    locale: Locale;
};

type Names = { partner: string; owner: string };
type GroupedRows = {
    expenses: ExpenseRow[];
    owedToYou: DebtRow[];
    youOwe: DebtRow[];
    transfers: TransferRow[];
    inputs: Required<SettlementInputs>;
};

const MINUS = "−";
const DIVIDER = "────────────────────";
const ZERO = formatMxn(0);

const bullet = (text: string): string => `    • ${text}`;
const amountBullet = (label: string, amount: number): string =>
    bullet(`${label}: ${formatMxn(amount)}`);
const debtBullet = (
    row: DebtRow,
    partnerName: string,
    tm: MovementsTranslator,
): string =>
    amountBullet(
        debtTitle(row.description, row.direction, partnerName, tm),
        row.amount,
    );

// Same-day rows keep the journal's order, reversed, which is not entry order:
// the service groups debts by direction before a date-only sort, and the
// journal carries no entry time to do better.
function oldestFirst(
    journal: SettlementJournalItem[],
): SettlementJournalItem[] {
    return [...journal]
        .reverse()
        .sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** Exhaustive: a new row kind is a type error here until it is sorted. */
function groupRows(rows: SettlementJournalItem[]): GroupedRows {
    const grouped: GroupedRows = {
        expenses: [],
        owedToYou: [],
        youOwe: [],
        transfers: [],
        inputs: {
            partnerShareOfYourExpenses: 0,
            partnerDebtToYou: 0,
            yourDebtToPartner: 0,
            moneyPartnerPaidYou: 0,
            moneyYouPaidPartner: 0,
        },
    };
    const { inputs } = grouped;
    for (const row of rows) {
        switch (row.kind) {
            case "your_expense":
                grouped.expenses.push(row);
                inputs.partnerShareOfYourExpenses += row.partnerShare;
                break;
            case "partner_debt":
                if (row.direction === "partner_debt") {
                    grouped.owedToYou.push(row);
                    inputs.partnerDebtToYou += row.amount;
                } else {
                    grouped.youOwe.push(row);
                    inputs.yourDebtToPartner += row.amount;
                }
                break;
            case "transfer":
                grouped.transfers.push(row);
                if (row.direction === "gf_received") {
                    inputs.moneyPartnerPaidYou += row.amount;
                } else {
                    inputs.moneyYouPaidPartner += row.amount;
                }
                break;
            default: {
                const unknown: never = row;
                throw new Error(
                    `Unhandled settlement row: ${JSON.stringify(unknown)}`,
                );
            }
        }
    }
    return grouped;
}

function header(
    rows: SettlementJournalItem[],
    scope: SettlementSummaryScope,
    { t, locale }: SettlementSummaryIntl,
    now: Date,
): string {
    const oldest = rows[0];
    const newest = rows.at(-1);
    if (!oldest || !newest) return t("summaryText.header");
    const first = formatExpenseDate(oldest.date, locale);
    const last =
        scope === "open"
            ? t("summaryText.today", {
                  date: formatExpenseDate(new Date(getTodayCdmx(now)), locale),
              })
            : formatExpenseDate(newest.date, locale);
    return first === last
        ? t("summaryText.headerOne", { date: first })
        : t("summaryText.headerRange", { first, last });
}

function expenseSection(
    rows: ExpenseRow[],
    { t, locale }: SettlementSummaryIntl,
): string[] {
    const gross = rows.reduce((total, row) => total + row.gross, 0);
    return [
        t("summaryText.sharedExpenses"),
        ...rows.map((row) =>
            amountBullet(
                `(${formatExpenseDay(row.date, locale)}) ${row.description}`,
                row.gross,
            ),
        ),
        "",
        t("summaryText.subtotal", { amount: formatMxn(gross) }),
    ];
}

function partnerSection(
    { expenses, owedToYou, inputs }: GroupedRows,
    names: Names,
    { t, tm }: SettlementSummaryIntl,
): string[] {
    const { partnerShareOfYourExpenses: share, partnerDebtToYou: debt } =
        inputs;
    const lines = [t("summaryText.partnerOwesYou", names)];
    if (expenses.length > 0) {
        lines.push(
            ...expenses.map((row) =>
                bullet(`${row.description}: *${formatMxn(row.partnerShare)}*`),
            ),
            "",
            t("summaryText.shareOfShared", {
                ...names,
                amount: formatMxn(share),
            }),
        );
    }
    if (owedToYou.length > 0) {
        if (expenses.length > 0) lines.push("");
        lines.push(
            t("summaryText.additionalDebts"),
            ...owedToYou.map((row) => debtBullet(row, names.partner, tm)),
        );
    }
    const amounts = {
        ...names,
        share: formatMxn(share),
        debt: formatMxn(debt),
        amount: formatMxn(share + debt),
    };
    lines.push(
        "",
        expenses.length > 0 && owedToYou.length > 0
            ? t("summaryText.partnerSubtotalWithAddends", amounts)
            : t("summaryText.partnerSubtotal", amounts),
    );
    return lines;
}

function paymentLine(
    row: TransferRow,
    names: Names,
    t: SettlementTranslator,
): string {
    const line = amountBullet(
        row.direction === "gf_paid"
            ? t("summaryText.youPaid", names)
            : t("summaryText.partnerPaid", names),
        row.amount,
    );
    return row.note ? `${line} (${row.note})` : line;
}

type SummaryTerm = {
    sign: "+" | typeof MINUS;
    amount: number;
    entry: string;
    label: string;
};

function signedExpression(
    terms: SummaryTerm[],
    values: (term: SummaryTerm) => string,
): string {
    return terms
        .map((term, index) => {
            const value = values(term);
            if (index > 0) return `${term.sign} ${value}`;
            return term.sign === MINUS && value !== ZERO
                ? `${MINUS}${value}`
                : value;
        })
        .join(" ");
}

function summarySection(
    terms: SummaryTerm[],
    balance: CoupleBalance,
    names: Names,
    t: SettlementTranslator,
): string[] {
    const result = formatMxn(balance.amount);
    const finalKey = isBalanceSettled(balance)
        ? "summaryText.finalSettled"
        : balance.direction === "she_owes"
          ? "summaryText.finalOwes"
          : "summaryText.finalReceives";
    const final = t(finalKey, { ...names, amount: result });
    if (terms.length === 0) return [final];

    const signedResult =
        balance.direction === "you_owe" ? `${MINUS}${result}` : result;
    return [
        t("summaryText.summary"),
        ...terms.map((term) => bullet(term.entry)),
        "",
        t("summaryText.formula"),
        t("summaryText.formulaWords", {
            expression: signedExpression(terms, (term) => term.label),
        }),
        t("summaryText.formulaAmounts", {
            expression: signedExpression(terms, (term) =>
                formatMxn(term.amount),
            ),
            result: signedResult,
        }),
        "",
        final,
    ];
}

export function buildSettlementSummaryText(
    journal: SettlementJournalItem[],
    { partner, owner }: { partner: string; owner?: string | null },
    scope: SettlementSummaryScope,
    intl: SettlementSummaryIntl,
    now: Date,
): string {
    const { t, tm } = intl;
    const names = {
        partner,
        owner: owner?.trim() || t("summaryText.ownerFallback"),
    };
    const rows = oldestFirst(journal);
    const grouped = groupRows(rows);
    const { expenses, owedToYou, youOwe, transfers, inputs } = grouped;
    const balance = computeCoupleBalance(inputs);

    const sections: string[][] = [];
    const terms: SummaryTerm[] = [];

    if (expenses.length > 0) sections.push(expenseSection(expenses, intl));

    if (expenses.length > 0 || owedToYou.length > 0) {
        sections.push(partnerSection(grouped, names, intl));
        const amount =
            inputs.partnerShareOfYourExpenses + inputs.partnerDebtToYou;
        const entryKey =
            owedToYou.length === 0
                ? "summaryText.summaryPartnerShare"
                : expenses.length === 0
                  ? "summaryText.summaryPartnerDebt"
                  : "summaryText.summaryPartnerSubtotal";
        terms.push({
            sign: "+",
            amount,
            entry: t(entryKey, { ...names, amount: formatMxn(amount) }),
            label: t("summaryText.formulaPartnerSubtotal", names),
        });
    }

    if (youOwe.length > 0) {
        const amount = inputs.yourDebtToPartner;
        const values = { ...names, amount: formatMxn(amount) };
        sections.push([
            t("summaryText.youOwePartner", names),
            ...youOwe.map((row) => debtBullet(row, partner, tm)),
            "",
            t("summaryText.ownerSubtotal", values),
        ]);
        terms.push({
            sign: MINUS,
            amount,
            entry: t("summaryText.summaryOwnerDebt", values),
            label: t("summaryText.formulaOwnerDebt", names),
        });
    }

    if (transfers.length > 0) {
        const lines = [
            t("summaryText.payments"),
            ...transfers.map((row) => paymentLine(row, names, t)),
            "",
        ];
        if (transfers.some((row) => row.direction === "gf_received")) {
            const amount = inputs.moneyPartnerPaidYou;
            const values = { ...names, amount: formatMxn(amount) };
            lines.push(t("summaryText.partnerPaidTotal", values));
            terms.push({
                sign: MINUS,
                amount,
                entry: t("summaryText.summaryPartnerPaid", values),
                label: t("summaryText.formulaPartnerPaid", names),
            });
        }
        if (transfers.some((row) => row.direction === "gf_paid")) {
            const amount = inputs.moneyYouPaidPartner;
            const values = { ...names, amount: formatMxn(amount) };
            lines.push(t("summaryText.youPaidTotal", values));
            terms.push({
                sign: "+",
                amount,
                entry: t("summaryText.summaryYouPaid", values),
                label: t("summaryText.formulaYouPaid", names),
            });
        }
        sections.push(lines);
    }

    sections.push(summarySection(terms, balance, names, t));
    const body = sections
        .map((section) => section.join("\n"))
        .join(`\n\n${DIVIDER}\n\n`);
    return `${header(rows, scope, intl, now)}\n\n${body}`;
}
