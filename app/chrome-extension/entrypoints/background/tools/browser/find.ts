import { createErrorResponse, ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';

interface FindToolParams {
  query: string;
  tabId?: number;
  windowId?: number;
}

class FindTool extends BaseBrowserToolExecutor {
  name = 'chrome_find';

  async execute(args: FindToolParams): Promise<ToolResult> {
    const { query } = args;

    if (!query || typeof query !== 'string') {
      return createErrorResponse('Invalid parameters: query must be a non-empty string');
    }

    try {
      const explicit = await this.tryGetTab(args.tabId);
      const tab = explicit || (await this.getActiveTabOrThrowInWindow(args.windowId));
      if (!tab.id) {
        return createErrorResponse('Tab not found: Active tab has no ID');
      }

      const tabId = tab.id;

      const scriptResults = await chrome.scripting.executeScript({
        target: { tabId },
        func: (q: string) => {
          const map = (window as Window & { __claudeElementMap?: Map<string, Element> })
            .__claudeElementMap;
          const qLower = q.toLowerCase();
          const results: Array<{
            ref: string | null;
            tag: string;
            role: string | undefined;
            text: string;
            type: string | undefined;
            coords: { x: number; y: number };
          }> = [];
          const seen = new Set<Element>();
          const candidates = document.querySelectorAll<HTMLElement>(
            'a[href], button, input, select, textarea, [role="button"], [role="link"], [role="textbox"], [role="checkbox"], [role="radio"], [role="combobox"], [role="listbox"], [role="menuitem"], [role="tab"], h1, h2, h3, h4, h5, label',
          );
          for (const el of candidates) {
            if (seen.has(el)) continue;
            seen.add(el);
            const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
            const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
            const title = (el.getAttribute('title') || '').toLowerCase();
            const text = (el.textContent || '').trim().toLowerCase().slice(0, 200);
            if (
              !ariaLabel.includes(qLower) &&
              !placeholder.includes(qLower) &&
              !title.includes(qLower) &&
              !text.includes(qLower)
            )
              continue;
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) continue;
            let ref: string | null = null;
            if (map instanceof Map) {
              for (const [k, v] of map.entries()) {
                if (v === el) {
                  ref = k;
                  break;
                }
              }
            }
            results.push({
              ref,
              tag: el.tagName.toLowerCase(),
              role: el.getAttribute('role') || undefined,
              text: (
                el.getAttribute('aria-label') ||
                el.getAttribute('placeholder') ||
                el.textContent?.trim() ||
                ''
              ).slice(0, 100),
              type: el.getAttribute('type') || undefined,
              coords: {
                x: Math.round(rect.left + rect.width / 2),
                y: Math.round(rect.top + rect.height / 2),
              },
            });
            if (results.length >= 20) break;
          }
          return results;
        },
        args: [query],
      });

      const results = scriptResults[0]?.result;

      if (!results || results.length === 0) {
        return {
          content: [{ type: 'text', text: 'No elements found matching query' }],
          isError: false,
        };
      }

      return {
        content: [
          {
            type: 'text',
            text:
              JSON.stringify(results) +
              "\nNote: 'ref' values can be used directly with chrome_click_element, chrome_fill_or_select, and chrome_computer. If ref is null, use coords instead.",
          },
        ],
        isError: false,
      };
    } catch (error) {
      return createErrorResponse(
        `Error finding elements: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export const findTool = new FindTool();
