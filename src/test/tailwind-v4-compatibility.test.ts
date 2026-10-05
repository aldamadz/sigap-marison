import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postcss, { type Root } from "postcss";
import tailwind from "@tailwindcss/postcss";
import { twMerge } from "tailwind-merge";
import { beforeAll, describe, expect, it } from "vitest";

let compiled: Root;

beforeAll(async () => {
  const from = resolve("src/index.css");
  const result = await postcss([tailwind()]).process(readFileSync(from, "utf8"), { from });
  compiled = result.root;
}, 30000);

const declarationsFor = (selector: string, property: string) => {
  const values: string[] = [];
  compiled.walkRules(selector, (rule) => {
    rule.walkDecls(property, (declaration) => { values.push(declaration.value); });
  });
  return values;
};

describe("Tailwind v4 SIGAP compatibility", () => {
  it("compiles the retained SIGAP color and radius tokens", () => {
    expect(declarationsFor(".bg-card", "background-color")).toContain("hsl(var(--card))");
    expect(declarationsFor(".text-primary", "color")).toContain("hsl(var(--primary))");
    expect(declarationsFor(".rounded-lg", "border-radius")).toContain("var(--radius)");
  });

  it("keeps 44px controls and minimum touch targets", () => {
    expect(declarationsFor(".h-11", "height")).toContain("calc(var(--spacing) * 11)");
    expect(declarationsFor(".min-h-touch", "min-height")).toContain("44px");
    expect(declarationsFor(".min-w-touch", "min-width")).toContain("44px");
  });

  it("preserves spacing after inline labels rather than margins on the preceding label", () => {
    const css = compiled.toString();
    expect(css).toContain("& > :not([hidden]) ~ :not([hidden])");
    expect(css).toContain("margin-block-start: calc(var(--spacing) * 2)");
    expect(css).toContain("margin-block-start: calc(var(--spacing) * 0.5)");
  });

  it("retains container gutters, rounded pills and accessible transparent outlines", () => {
    expect(declarationsFor(".container", "padding-inline")).toContain("2rem");
    expect(declarationsFor(".rounded-full", "border-radius")).toContain("9999px");
    expect(declarationsFor(".outline-none", "outline")).toContain("2px solid transparent");
  });

  it("keeps explicit light/dark mode instead of switching with system preference", () => {
    expect(compiled.toString()).toContain(":is(.dark *)");
    expect(compiled.toString()).not.toContain("prefers-color-scheme");
  });

  it("merges current utility, responsive and conditional control classes correctly", () => {
    expect(twMerge("h-10 h-11", "md:h-10 md:h-11")).toBe("h-11 md:h-11");
    expect(twMerge("ring-1 ring-2", "focus-visible:ring-1 focus-visible:ring-2")).toBe("ring-2 focus-visible:ring-2");
    expect(twMerge("bg-muted", "bg-card", "data-[state=active]:bg-primary")).toBe("bg-card data-[state=active]:bg-primary");
  });
});
