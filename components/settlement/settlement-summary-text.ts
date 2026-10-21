import {
    computeCoupleBalance,
    isBalanceSettled,
    type CoupleBalance,
    type SettlementInputs,
} from "@/lib/domain/settlement";
import type { Locale } from "@/i18n/config";
import { formatExpenseDate, formatMxn } from "@/lib/format";
import type { SettlementJournalItem } from "@/lib/services/settlement/settlement.service";
import {
    debtTitle,
    type MovementsTranslator,
} from "@/components/movement/movement-display";
import type { SettlementTranslator } from "./balance-display";

type ExpenseRow = Extract<SettlementJournalItem, { kind: "your_expense" }>;
type DebtRow = Extract<SettlementJournalItem, { kind: "partner_debt" }>;
type TransferRow = Extract<SettlementJournalItem, { kind: "transfer" }>;

/** The open settlement is still running, so its header ends in "present". */
export type SettlementSummaryScope = "open" | "closed";

/** The copied text is read by the partner, so it follows the active locale. */
export type SettlementSummaryIntl = {
    t: SettlementTranslator;
    tm: MovementsTranslator;
    locale: Locale;
};

type GroupedRows = {
    expenses: ExpenseRow[];
    /** Debts the partner owes you (`partner_debt`). */
    owedToYou: DebtRow[];
    /** Debts you owe the partner (`gf_fronted`). */
    youOwe: DebtRow[];
    transfers: TransferRow[];
    inputs: Required<SettlementInputs>;
};

/** The minus sign the journal renders, not a hyphen. */
const MINUS = "−";
const INDENT = "    ";
/** 11 em dashes. It sits flush against the lines on both sides. */
const DIVIDER = "—".repeat(11);

/** A section's lines, or the divider string between sections. */
type Part = string[] | typeof DIVIDER;

const roundCents = (n: number): number => Math.round(n * 100) / 100;
const sum = (values: number[]): number => values.reduce((a, b) => a + b, 0);
const bullet = (label: string, amount: number): string =>
    `${INDENT}• ${label}: ${formatMxn(amount)}`;
const debtBullet = (
    row: DebtRow,
    partnerName: string,
    tm: MovementsTranslator,
): string =>
    bullet(
        debtTitle(row.description, row.direction, partnerName, tm),
        row.amount,
    );
const percentOf = (row: ExpenseRow): number =>
    Math.round((row.partnerShare / row.gross) * 100);

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
): string {
    const oldest = rows[0];
    const newest = rows.at(-1);
    if (!oldest || !newest) return t("summaryText.header");
    const first = formatExpenseDate(oldest.date, locale);
    const last =
        scope === "open"
            ? t("summaryText.present")
            : formatExpenseDate(newest.date, locale);
    return first === last
        ? t("summaryText.headerOne", { date: first })
        : t("summaryText.headerRange", { first, last });
}

// Null when the rows differ, or when the shared percent does not reproduce the
// summed share to the cent.
function uniformPercent(rows: ExpenseRow[], totalShare: number): number | null {
    const percents = new Set(rows.map(percentOf));
    const [percent] = percents;
    if (percents.size !== 1 || percent === undefined) return null;
    const totalGross = sum(rows.map((r) => r.gross));
    return roundCents((totalGross * percent) / 100) === roundCents(totalShare)
        ? percent
        : null;
}

/** Ends on the gross subtotal only: the share opens the 🌸 section. */
function expenseSection(
    rows: ExpenseRow[],
    percent: number | null,
    partnerName: string,
    t: SettlementTranslator,
): string[] {
    // Mixed percents put each row's split on the row itself.
    const rowLines =
        percent === null
            ? rows.map((r) =>
                  t("summaryText.rowSplit", {
                      line: bullet(r.description, r.gross),
                      partner: partnerName,
                      percent: percentOf(r),
                      share: formatMxn(r.partnerShare),
                  }),
              )
            : rows.map((r) => bullet(r.description, r.gross));
    return [
        t("summaryText.sharedExpenses"),
        ...rowLines,
        "",
        subtotalLine(sum(rows.map((r) => r.gross)), t),
    ];
}

const subtotalLine = (amount: number, t: SettlementTranslator): string =>
    t("summaryText.subtotal", { amount: formatMxn(amount) });

function debtSection(
    title: string,
    lines: string[],
    subtotal: number,
    t: SettlementTranslator,
) {
    return [title, ...lines, "", subtotalLine(subtotal, t)];
}

function paymentLine(
    row: TransferRow,
    partnerName: string,
    t: SettlementTranslator,
): string {
    const line = bullet(
        row.direction === "gf_paid"
            ? t("summaryText.youPaid", { partner: partnerName })
            : t("summaryText.partnerPaid", { partner: partnerName }),
        row.amount,
    );
    return row.note ? `${line} (${row.note})` : line;
}

/** "−$250.00", "$0.00", "$250.00" — the balance with its sign. */
function signedAmount(balance: CoupleBalance): string {
    if (isBalanceSettled(balance)) return formatMxn(0);
    const amount = formatMxn(balance.amount);
    return balance.direction === "you_owe" ? `${MINUS}${amount}` : amount;
}

/** The whole sum, one signed term per group that exists, or null for one term. */
function calculationLine(
    terms: { sign: "+" | "−"; amount: number }[],
    balance: CoupleBalance,
): string | null {
    if (terms.length < 2) return null;
    const expression = terms
        .map(({ sign, amount }, i) => {
            const figure = formatMxn(amount);
            if (i > 0) return `${sign} ${figure}`;
            return sign === MINUS ? `${MINUS}${figure}` : figure;
        })
        .join(" ");
    return `🟰 *${expression} = ${signedAmount(balance)}*`;
}

function finalLine(
    balance: CoupleBalance,
    partnerName: string,
    t: SettlementTranslator,
): string {
    if (isBalanceSettled(balance)) {
        return t("summaryText.finalSettled", { amount: formatMxn(0) });
    }
    const values = { partner: partnerName, amount: formatMxn(balance.amount) };
    return balance.direction === "she_owes"
        ? t("summaryText.finalOwes", values)
        : t("summaryText.finalReceives", values);
}

// Every figure comes from computeCoupleBalance over the rows the text lists,
// so the outcome matches the on-screen balance.
export function buildSettlementSummaryText(
    journal: SettlementJournalItem[],
    partnerName: string,
    scope: SettlementSummaryScope,
    intl: SettlementSummaryIntl,
): string {
    const { t, tm } = intl;
    const rows = oldestFirst(journal);
    const { expenses, owedToYou, youOwe, transfers, inputs } = groupRows(rows);
    const balance = computeCoupleBalance(inputs);
    const share = inputs.partnerShareOfYourExpenses;
    const percent = uniformPercent(expenses, share);

    const sections: Part[] = [[header(rows, scope, intl)]];
    const terms: { sign: "+" | "−"; amount: number }[] = [];

    if (expenses.length > 0) {
        // The 🌸 section always follows, since it lists this share.
        sections.push(
            expenseSection(expenses, percent, partnerName, t),
            DIVIDER,
        );
    }

    const owedLines = [
        ...(expenses.length > 0
            ? [
                  bullet(
                      percent === null
                          ? t("summaryText.shareOfShared", {
                                partner: partnerName,
                            })
                          : t("summaryText.percentOfShared", {
                                partner: partnerName,
                                percent,
                            }),
                      share,
                  ),
              ]
            : []),
        ...owedToYou.map((r) => debtBullet(r, partnerName, tm)),
    ];
    if (owedLines.length > 0) {
        const subtotal = share + inputs.partnerDebtToYou;
        sections.push(
            debtSection(
                t("summaryText.partnerOwesYou", { partner: partnerName }),
                owedLines,
                subtotal,
                t,
            ),
        );
        terms.push({ sign: "+", amount: subtotal });
    }

    if (youOwe.length > 0) {
        sections.push(
            debtSection(
                t("summaryText.youOwePartner", { partner: partnerName }),
                youOwe.map((r) => debtBullet(r, partnerName, tm)),
                inputs.yourDebtToPartner,
                t,
            ),
        );
        terms.push({ sign: MINUS, amount: inputs.yourDebtToPartner });
    }

    if (transfers.length > 0) {
        sections.push([
            t("summaryText.payments"),
            ...transfers.map((r) => paymentLine(r, partnerName, t)),
        ]);
        if (transfers.some((r) => r.direction === "gf_paid")) {
            terms.push({ sign: "+", amount: inputs.moneyYouPaidPartner });
        }
        if (transfers.some((r) => r.direction === "gf_received")) {
            terms.push({ sign: MINUS, amount: inputs.moneyPartnerPaidYou });
        }
    }

    const calculation = calculationLine(terms, balance);
    if (calculation) sections.push(DIVIDER, [calculation]);
    sections.push([finalLine(balance, partnerName, t)]);

    return joinParts(sections);
}

/** Sections sit a blank line apart; a divider sits flush on both sides. */
function joinParts(parts: Part[]): string {
    return parts
        .map((part, i) => {
            const text = typeof part === "string" ? part : part.join("\n");
            if (i === 0) return text;
            const flush =
                typeof part === "string" || typeof parts[i - 1] === "string";
            return `${flush ? "\n" : "\n\n"}${text}`;
        })
        .join("");
}
