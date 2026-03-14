/**
 * browser_select_option tool — Selects options in a <select> element via BiDi.
 */
import type { BiDiConnection } from "../bidi/connection.js";

interface SelectOptionParams {
  ref: string;
  values: string[];
  element: string;
}

interface SelectOptionResult {
  success: boolean;
  selected: string[];
}

export async function browserSelectOption(
  bidi: BiDiConnection,
  params: SelectOptionParams,
): Promise<SelectOptionResult> {
  const match = /^@?e(\d+)$/.exec(params.ref);
  if (!match) throw new Error(`Invalid ref format: ${params.ref}`);
  const nodeId = match[1];
  const valuesJson = JSON.stringify(params.values);

  const response = (await bidi.send("script.evaluate", {
    expression: `(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
      let count = 0; let node = walker.currentNode;
      while (node) {
        count++;
        if (count === ${nodeId}) {
          const select = node;
          if (select.tagName !== 'SELECT') throw new Error('Element is not a SELECT');
          const values = ${valuesJson};
          const matched = [];
          for (let i = 0; i < select.options.length; i++) {
            const option = select.options[i];
            const isMatch = values.indexOf(option.value) !== -1 || values.indexOf(option.textContent.trim()) !== -1;
            option.selected = isMatch;
            if (isMatch) matched.push(option.value);
          }
          select.dispatchEvent(new Event('input', { bubbles: true }));
          select.dispatchEvent(new Event('change', { bubbles: true }));
          return matched;
        }
        node = walker.nextNode();
        if (!node) break;
      }
      throw new Error('Element not found for ref: ${params.ref}');
    })()`,
    awaitPromise: false,
    resultOwnership: "none",
  })) as { result: { value?: string[] } };

  return {
    success: true,
    selected: response.result?.value ?? [],
  };
}
