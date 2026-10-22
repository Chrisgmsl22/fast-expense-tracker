// @vitest-environment node
import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

// The real eslint.config.mjs, run on a file path under components/ so the UI-text rules apply.
const PROBE_PATH = "components/ui-text-probe.tsx";

let eslint: ESLint;

beforeAll(() => {
    eslint = new ESLint({ cwd: process.cwd() });
});

async function ruleHits(code: string, filePath = PROBE_PATH) {
    const [result] = await eslint.lintText(code, { filePath });
    const ruleIds = result!.messages
        .filter((message) => message.severity === 2)
        .map((message) => message.ruleId);
    return [...new Set(ruleIds)];
}

function component(jsx: string): string {
    return [
        "function Thing(props: Record<string, unknown>) {",
        "    return <div {...props} />;",
        "}",
        "export function Probe({ t, ok, n, name }: { t: (key: string) => string; ok: boolean; n: number; name?: string }) {",
        `    return <>${jsx}<Thing /></>;`,
        "}",
        "",
    ].join("\n");
}

const TEXT_PROPS = [
    "aria-label",
    "aria-description",
    "aria-valuetext",
    "aria-roledescription",
    "placeholder",
    "title",
    "subtitle",
    "caption",
    "tooltip",
    "hint",
    "alt",
    "label",
    "description",
    "heading",
    "message",
    "text",
    "tagline",
    "prompt",
    "primaryLabel",
    "pendingLabel",
    "cardTitle",
    "stepDescription",
    "helperText",
    "errorMessage",
    "sectionHeading",
    "desktop",
    "phone",
];

const LETTERED_VALUES = [
    '"Close"',
    '{"Close"}',
    "{`Close`}",
    "{`Step ${n} of 8`}",
    '{"Close " + n}',
    '{n + " left"}',
    '{"Step " + n + " of 8"}',
    '{ok ? "Saving now" : t("save")}',
    '{ok ? t("save") : "Save changes"}',
    '{ok && "Only when ok"}',
    '{name || "Unnamed"}',
    '{name ?? "Unnamed"}',
    '{ok ? "Step " + n : t("done")}',
];

describe("UI text lint gate", () => {
    it.each([
        ["<p>Hello there</p>"],
        ['<p>{"Hello there"}</p>'],
        ["<p>{`Hello there`}</p>"],
        ["<p>{`Step ${n} of 8`}</p>"],
    ])("Should fail on hard-coded JSX text in %s", async (jsx) => {
        expect(await ruleHits(component(jsx))).toEqual([
            "react/jsx-no-literals",
        ]);
    });

    it.each([
        ['<p>{ok ? "Saving now" : "Save changes"}</p>'],
        ['<p>{ok ? t("save") : "Save changes"}</p>'],
        ['<p>{ok && "Only when ok"}</p>'],
        ['<p>{name || "Unnamed"}</p>'],
        ['<p>{name ?? "Unnamed"}</p>'],
        ['<p>{"Step " + n}</p>'],
        ['<p>{ok ? `Step ${n}` : t("done")}</p>'],
        ['<>{ok && "In a fragment"}</>'],
    ])(
        "Should fail on hard-coded JSX text behind an operator in %s",
        async (jsx) => {
            expect(await ruleHits(component(jsx))).toContain(
                "no-restricted-syntax",
            );
        },
    );

    it.each(TEXT_PROPS)(
        "Should fail on every lettered value form of %s",
        async (prop) => {
            for (const value of LETTERED_VALUES) {
                expect(
                    await ruleHits(component(`<Thing ${prop}=${value} />`)),
                    `${prop}=${value}`,
                ).toEqual(["no-restricted-syntax"]);
            }
        },
    );

    it.each([
        ['<input type="submit" value="Save" />'],
        ['<input type="button" value={"Save"} />'],
        ['<input type="submit" value={`Save ${n}`} />'],
        ['<input type="button" value={ok ? "Saving" : t("save")} />'],
    ])("Should fail on a hard-coded button input value in %s", async (jsx) => {
        expect(await ruleHits(component(jsx))).toEqual([
            "no-restricted-syntax",
        ]);
    });

    it.each([
        ['<p className="mt-2" id="x" />'],
        ['<p aria-labelledby="name-label" aria-describedby="hint" />'],
        ['<p title={t("x")} aria-label={t("y")}>{t("x")}</p>'],
        ['<p>{t("x")} — {"%"}</p>'],
        ['<p>{ok ? "%" : "—"}</p>'],
        ['<p>{ok ? t("save") : t("saving")}</p>'],
        ['<p>{ok && t("only")}</p>'],
        ['<p>{name ?? t("unnamed")}</p>'],
        ['<p title={ok ? t("close") : t("open")} />'],
        ['<p aria-label={ok && t("close")} />'],
        ['<p aria-label={t(ok ? "hide" : "show")} />'],
        ["<p aria-valuetext={`${n}%`} />"],
        ['<p title={t("x") + " · " + n} />'],
        ['<input placeholder="0.00" alt="" />'],
        ['<Thing label={t("x")} primaryLabel={t("y")} desktop={t("z")} />'],
        ["<Thing message={42} text={n} />"],
        ['<input type="text" value="abc" />'],
        ['<input type="submit" value={t("save")} />'],
    ])("Should pass the allowed form %s", async (jsx) => {
        expect(await ruleHits(component(jsx))).toEqual([]);
    });

    it("Should leave files outside app/ and components/ alone", async () => {
        expect(
            await ruleHits(
                component(
                    '<p aria-label="Close" title={ok ? "A" : "B"}>Hello {ok && "there"}</p>',
                ),
                "tests/unit/ui-text-probe.tsx",
            ),
        ).toEqual([]);
    });
});
