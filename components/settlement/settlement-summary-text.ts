import {
    computeCoupleBalance,
    isBalanceSettled,
    type CoupleBalance,
    type SettlementInputs,
} from "@/lib/domain/settlement";
import { formatExpenseDate, formatMxn } from "@/lib/format";
import type { SettlementJournalItem } from "@/lib/services/settlement/settlement.service";

type ExpenseRow = Extract<SettlementJournalItem, { kind: "your_expense" }>;
type DebtRow = Extract<SettlementJournalItem, { kind: "partner_debt" }>;
type TransferRow = Extract<SettlementJournalItem, { kind: "transfer" }>;

/**
 * Which settlement the text describes. The open one is still running, so its
 * header ends in "present"; a closed one ends on its latest row.
 */
export type SettlementSummaryScope = "open" | "closed";

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
const percentOf = (row: ExpenseRow): number =>
    Math.round((row.partnerShare / row.gross) * 100);

/**
 * Oldest first by date. Rows that share a date keep the journal's order,
 * reversed, and that order is not entry order: the service appends rows line by
 * line (every "I owe" debt before every "owes me" debt) and then sorts by date
 * alone. The journal carries no entry time, so nothing here can do better.
 */
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
): string {
    const oldest = rows[0];
    const newest = rows.at(-1);
    if (!oldest || !newest) return "🧾 *Settlement*";
    const first = formatExpenseDate(oldest.date);
    const last = scope === "open" ? "present" : formatExpenseDate(newest.date);
    return first === last
        ? `🧾 *Settlement ${first}*`
        : `🧾 *Settlement ${first} – ${last}*`;
}

/**
 * The one whole percent every row shares, or null when they differ or when that
 * percent does not reproduce the summed share to the cent.
 */
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
): string[] {
    // Mixed percents put each row's split on the row itself.
    const rowLines =
        percent === null
            ? rows.map(
                  (r) =>
                      `${bullet(r.description, r.gross)} (${partnerName}'s ${percentOf(r)}%: ${formatMxn(r.partnerShare)})`,
              )
            : rows.map((r) => bullet(r.description, r.gross));
    return [
        "*Shared expenses*",
        ...rowLines,
        "",
        `*Subtotal: ${formatMxn(sum(rows.map((r) => r.gross)))}*`,
    ];
}

function debtSection(title: string, lines: string[], subtotal: number) {
    return [title, ...lines, "", `*Subtotal: ${formatMxn(subtotal)}*`];
}

function paymentLine(row: TransferRow, partnerName: string): string {
    const line = bullet(
        row.direction === "gf_paid"
            ? `You paid ${partnerName}`
            : `${partnerName} paid you`,
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

function finalLine(balance: CoupleBalance, partnerName: string): string {
    if (isBalanceSettled(balance)) {
        return `✅ *Final outcome: settled, ${formatMxn(0)} MXN*`;
    }
    const amount = formatMxn(balance.amount);
    return balance.direction === "she_owes"
        ? `✅ *Final outcome: ${partnerName} owes ${amount} MXN*`
        : `✅ *Final outcome: ${partnerName} receives ${amount} MXN*`;
}

/**
 * A WhatsApp-formatted overview of one settlement, to paste to the partner.
 * The figures come from `computeCoupleBalance` over the rows it lists, so the
 * outcome matches the on-screen balance and never quotes money it does not show.
 */
export function buildSettlementSummaryText(
    journal: SettlementJournalItem[],
    partnerName: string,
    scope: SettlementSummaryScope,
): string {
    const rows = oldestFirst(journal);
    const { expenses, owedToYou, youOwe, transfers, inputs } = groupRows(rows);
    const balance = computeCoupleBalance(inputs);
    const share = inputs.partnerShareOfYourExpenses;
    const percent = uniformPercent(expenses, share);

    const sections: Part[] = [[header(rows, scope)]];
    const terms: { sign: "+" | "−"; amount: number }[] = [];

    if (expenses.length > 0) {
        // The 🌸 section always follows, since it lists this share.
        sections.push(expenseSection(expenses, percent, partnerName), DIVIDER);
    }

    const owedLines = [
        ...(expenses.length > 0
            ? [
                  bullet(
                      percent === null
                          ? `${partnerName}'s share of shared expenses`
                          : `${partnerName}'s ${percent}% of shared expenses`,
                      share,
                  ),
              ]
            : []),
        ...owedToYou.map((r) => bullet(r.description, r.amount)),
    ];
    if (owedLines.length > 0) {
        const subtotal = share + inputs.partnerDebtToYou;
        sections.push(
            debtSection(`🌸 *${partnerName} owes you*`, owedLines, subtotal),
        );
        terms.push({ sign: "+", amount: subtotal });
    }

    if (youOwe.length > 0) {
        sections.push(
            debtSection(
                `🍔 *You owe ${partnerName}*`,
                youOwe.map((r) => bullet(r.description, r.amount)),
                inputs.yourDebtToPartner,
            ),
        );
        terms.push({ sign: MINUS, amount: inputs.yourDebtToPartner });
    }

    if (transfers.length > 0) {
        sections.push([
            "💸 *Payments*",
            ...transfers.map((r) => paymentLine(r, partnerName)),
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
    sections.push([finalLine(balance, partnerName)]);

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
