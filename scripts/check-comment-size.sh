#!/usr/bin/env bash
#
# Non-blocking comment-size warning (pre-commit).
#
# Warns when a commit ADDS a comment block longer than the cap in
# docs/conventions/coding-conventions.md §Comments. Never blocks: a long comment
# is allowed, it just has to be worth defending. Always exits 0.
#
# Only added lines are counted. Editing a file that already carries long blocks
# stays silent — a check that fires on code you did not write is a check that
# gets ignored, which is how the cap came to be ignored in the first place.
#
# Markdown and other prose are exempt; check-doc-size.sh governs those.

set -uo pipefail

CAP=3

staged=$(git diff --cached --name-only --diff-filter=ACM -- '*.ts' '*.tsx' 2>/dev/null)
[ -z "$staged" ] && exit 0

report=$(git diff --cached -U0 -- '*.ts' '*.tsx' | awk -v cap="$CAP" '
    function flush() {
        if (run > cap) print "  " file ":" start " — " run " lines"
        run = 0
    }
    /^\+\+\+ b\// { flush(); file = substr($0, 7); next }
    # Hunk header: @@ -a,b +c,d @@ — c is the first new-file line in the hunk.
    /^@@ / {
        flush()
        split($3, h, ",")
        line = substr(h[1], 2) + 0
        next
    }
    /^\+/ {
        body = substr($0, 2)
        if (body ~ /^[[:space:]]*(\/\/|\/\*|\*\/|\*([^\/]|$))/) {
            if (run == 0) start = line
            run++
        } else {
            flush()
        }
        line++
        next
    }
    { flush() }
    END { flush() }
')

[ -z "$report" ] && exit 0

echo "⚠ comment-size: this commit adds comment blocks over the ${CAP}-line cap:"
echo "$report"
echo "  Default is no comment. ${CAP} lines is the cap when one is earned."
echo "  Keeping a longer block is fine — state what a reader loses if it were cut"
echo "  to ${CAP}. \"It explains the design\" is not a reason."
echo "  (docs/conventions/coding-conventions.md §Comments)"

exit 0
