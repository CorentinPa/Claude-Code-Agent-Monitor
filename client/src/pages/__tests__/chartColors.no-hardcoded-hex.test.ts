/**
 * @file chartColors.no-hardcoded-hex.test.ts
 * @description Guards the theme migration (Tasks 8-19): asserts the 12
 * chart/visualization files no longer contain the specific canvas-dependent
 * hex/rgba literals that were replaced with CSS-variable references. Reads
 * raw source via Vite's `?raw` import (same technique as
 * Settings.sections.test.ts) rather than importing the modules, since these
 * are React components with heavy runtime dependencies unsuited to a plain
 * unit test - this is a structural source check, not a rendering test
 * (deliberate: there is no automated visual-regression tooling in this repo,
 * per the design spec).
 *
 * Also guards a distinct, more severe regression than a leftover hex
 * literal: Tasks 8-10 originally wrote tooltip `className`s as
 * `` bg-[${CHART_TOOLTIP_BG}] ``, a JS template-literal interpolation inside
 * a Tailwind arbitrary-value class. Tailwind's JIT compiler statically scans
 * raw source text for class-name patterns and cannot resolve that
 * interpolation, so it generated zero CSS - tooltips were transparent in
 * both themes despite the source "looking" migrated. This was fixed by
 * writing the CSS var reference as literal static text
 * (`bg-[var(--chart-tooltip-bg)]`) instead. The `CHART_TOOLTIP` interpolation
 * check below asserts that pattern never comes back in any of the 12 files.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect } from "vitest";
import analytics from "../Analytics.tsx?raw";
import workflows from "../Workflows.tsx?raw";
import agentCollaborationNetwork from "../../components/workflows/AgentCollaborationNetwork.tsx?raw";
import subagentEffectiveness from "../../components/workflows/SubagentEffectiveness.tsx?raw";
import modelDelegationFlow from "../../components/workflows/ModelDelegationFlow.tsx?raw";
import concurrencyTimeline from "../../components/workflows/ConcurrencyTimeline.tsx?raw";
import errorPropagationMap from "../../components/workflows/ErrorPropagationMap.tsx?raw";
import sessionComplexityScatter from "../../components/workflows/SessionComplexityScatter.tsx?raw";
import compactionImpact from "../../components/workflows/CompactionImpact.tsx?raw";
import orchestrationDAG from "../../components/workflows/OrchestrationDAG.tsx?raw";
import toolExecutionFlow from "../../components/workflows/ToolExecutionFlow.tsx?raw";
import workflowStats from "../../components/workflows/WorkflowStats.tsx?raw";

const CASES: Array<{ name: string; source: string; forbidden: string[] }> = [
  { name: "Analytics.tsx", source: analytics, forbidden: ["#1e1e2e", "#161625", "bg-[#12121f]"] },
  { name: "Workflows.tsx", source: workflows, forbidden: ["bg-[#12121f]", "border-[#2a2a4a]"] },
  {
    name: "AgentCollaborationNetwork.tsx",
    source: agentCollaborationNetwork,
    forbidden: ["bg-[#12121f]", "#94a3b8", "#cbd5e1"],
  },
  {
    name: "SubagentEffectiveness.tsx",
    source: subagentEffectiveness,
    forbidden: ["#2a2a3d", "#e4e4ed", "bg-[#12121f]"],
  },
  {
    name: "ModelDelegationFlow.tsx",
    source: modelDelegationFlow,
    forbidden: ['"#12121f"', "#e2e8f0", "#64748b"],
  },
  {
    name: "ConcurrencyTimeline.tsx",
    source: concurrencyTimeline,
    forbidden: ["--color-gray-400", '"#12121f"'],
  },
  { name: "ErrorPropagationMap.tsx", source: errorPropagationMap, forbidden: ['"#9ca3af"'] },
  {
    name: "SessionComplexityScatter.tsx",
    source: sessionComplexityScatter,
    forbidden: ["bg-[#12121f]", "#363650"],
  },
  {
    name: "CompactionImpact.tsx",
    source: compactionImpact,
    forbidden: ["bg-[#12121f]", '"#2a2a3d"'],
  },
  {
    name: "OrchestrationDAG.tsx",
    source: orchestrationDAG,
    forbidden: ["#052e16", "#1f0808", "#1c1a04", "bg-[#12121f]"],
  },
  {
    name: "ToolExecutionFlow.tsx",
    source: toolExecutionFlow,
    forbidden: ['"#e2e8f0"', '"#12121f"'],
  },
  { name: "WorkflowStats.tsx", source: workflowStats, forbidden: ["bg-[#12121f]"] },
];

describe("chart color migration", () => {
  for (const { name, source, forbidden } of CASES) {
    it(`${name} no longer hardcodes its old canvas-dependent colors`, () => {
      for (const literal of forbidden) {
        expect(source, `${name} should no longer contain ${literal}`).not.toContain(literal);
      }
    });
  }

  it("no migrated file reintroduces the Tailwind arbitrary-value interpolation bug", () => {
    // `bg-[${CHART_TOOLTIP_BG}]`-style interpolation inside a Tailwind arbitrary
    // value (a bracket immediately followed by a `${CHART_TOOLTIP...}` JS
    // interpolation) is invisible to Tailwind's JIT scanner and silently
    // produces no CSS (see file header). This deliberately does NOT flag
    // `${CHART_TOOLTIP...}` used inside plain JS template literals such as
    // `style.cssText` strings (e.g. `color:${CHART_TOOLTIP_VALUE}`) - those
    // are ordinary JS string interpolation, not Tailwind class scanning, and
    // are the correct, intended pattern in these files.
    for (const { name, source } of CASES) {
      expect(
        source,
        `${name} should not interpolate a CHART_TOOLTIP constant into a Tailwind arbitrary-value class`
      ).not.toMatch(/\[\$\{CHART_TOOLTIP/);
    }
  });
});
