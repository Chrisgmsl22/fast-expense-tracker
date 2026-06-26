# Phase 4: Dashboard — RETIRED (absorbed into Phase 2)

> **This phase no longer exists in the roadmap.** The Dashboard and its charts
> were re-sliced into the design-driven **Phase 2** screen build-out when the
> `Confirmed designs V1` handoff landed. See [ADR-0013](../decisions/0013-screen-driven-reslice.md).

The original Phase 4 decomposed the dashboard into widget slices (50/25/25
widget, by-category **donut**, by-card bar, month picker, subcategory drilldown).
The designs superseded that:

- **Dashboard** is now [`phase-2-screens.md` §2.4](./phase-2-screens.md) — and the
  by-category chart is a **radar** ("where the money went"), not a donut.
- **Subcategory drilldown** became its own screen, **Category detail**
  ([`phase-2-screens.md` §2.5](./phase-2-screens.md)).

The full per-screen spec is [`ui-build-plan.md`](./ui-build-plan.md). The
chart-library question once parked here is resolved there (**Recharts** for the
radar; CSS/divs for bars/progress).
