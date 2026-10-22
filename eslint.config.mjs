import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Hard-coded UI text gate. react/jsx-no-literals covers plain JSX text; these
// selectors cover what it misses: text-like props, and text reached through a
// ternary, `&&`/`||`/`??`, `+` or a template. Only direct children are walked,
// so the key in t("key") never counts. A string with no letter ("0.00") passes.
const UI_TEXT_PROP =
    "^(aria-(label|description|valuetext|roledescription)|placeholder|alt|title|subtitle|caption|tooltip|hint|label|description|heading|message|text|tagline|prompt|desktop|phone|[a-z][A-Za-z0-9]*(Label|Title|Description|Text|Message|Heading))$";
const UI_TEXT_TARGETS = [
    `JSXAttribute[name.name=/${UI_TEXT_PROP}/]`,
    `JSXOpeningElement[name.name="input"]:has(JSXAttribute[name.name="type"][value.value=/^(submit|button)$/]) > JSXAttribute[name.name="value"]`,
];
const LETTERED = [
    "Literal[value=/\\p{L}/u]",
    "TemplateLiteral > TemplateElement[value.raw=/\\p{L}/u]",
];
const WRAPPER =
    ':matches(ConditionalExpression, LogicalExpression, BinaryExpression[operator="+"])';
// Lettered text under 0..3 wrappers, e.g. `ok ? "Saving " + n : "Save"`.
const textChains = (minDepth) =>
    [0, 1, 2, 3]
        .filter((depth) => depth >= minDepth)
        .flatMap((depth) =>
            LETTERED.map((text) =>
                [...Array(depth).fill(WRAPPER), text].join(" > "),
            ),
        );
const UI_TEXT_SELECTORS = [
    ...UI_TEXT_TARGETS.flatMap((target) => [
        `${target} > ${LETTERED[0]}`,
        ...textChains(0).map(
            (chain) => `${target} > JSXExpressionContainer > ${chain}`,
        ),
    ]),
    // Depth 0 children belong to react/jsx-no-literals.
    ...textChains(1).map(
        (chain) =>
            `:matches(JSXElement, JSXFragment) > JSXExpressionContainer > ${chain}`,
    ),
];
const UI_TEXT_MESSAGE =
    "User-visible text comes from messages/<locale>/<namespace>.json through useTranslations or getTranslations.";

const eslintConfig = defineConfig([
    ...nextVitals,
    ...nextTs,
    {
        files: ["app/**/*.tsx", "components/**/*.tsx"],
        rules: {
            // Only pure symbols may sit in JSX as literal text, wrapped in {} or not. Props are governed below.
            "react/jsx-no-literals": [
                "error",
                {
                    noStrings: true,
                    ignoreProps: true,
                    allowedStrings: [
                        "·",
                        "%",
                        "/",
                        "+",
                        "−",
                        "—",
                        "=",
                        "$",
                        "→",
                        "(",
                        ")",
                    ],
                },
            ],
            "no-restricted-syntax": [
                "error",
                ...UI_TEXT_SELECTORS.map((selector) => ({
                    selector,
                    message: UI_TEXT_MESSAGE,
                })),
            ],
        },
    },
    // Override default ignores of eslint-config-next.
    globalIgnores([
        // Default ignores of eslint-config-next:
        ".next/**",
        "out/**",
        "build/**",
        "next-env.d.ts",
        // Generated test-coverage report (gitignored).
        "coverage/**",
        // understand-anything working dir: generated graphs + its own .trash-*
        // scratch scripts (gitignored). Not our source; regenerated per run.
        ".ua/**",
    ]),
]);

export default eslintConfig;
