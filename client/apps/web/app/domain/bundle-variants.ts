// The variant rules of a bundle's stylesheet (docs/web.md, 「Screens a unit brings」): every rule for a utility under a
// variant — a class whose name carries a variant's separator, alone or inside a condition of its own — in the order
// the stylesheet holds them, read from inside its layers. The function stands alone, with nothing it reaches outside
// itself, so a browser test hands the same text to a page.

/** Every variant rule of a parsed stylesheet, as text, in its order. */
export function variantRules(sheet: CSSStyleSheet): string[] {
  const found: string[] = [];
  const variant = (rule: CSSRule): boolean => {
    if (rule instanceof CSSStyleRule) return rule.selectorText.includes("\\:");
    if (rule instanceof CSSGroupingRule) return [...rule.cssRules].some(variant);

    return false;
  };
  const walk = (rules: CSSRuleList): void => {
    for (const rule of rules) {
      if (typeof CSSLayerBlockRule !== "undefined" && rule instanceof CSSLayerBlockRule) walk(rule.cssRules);
      else if (variant(rule)) found.push(rule.cssText);
    }
  };

  walk(sheet.cssRules);

  return found;
}
