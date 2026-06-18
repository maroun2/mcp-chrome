import { createErrorResponse, ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';

interface ResizeWindowToolParams {
  width: number;
  height: number;
  tabId?: number;
  windowId?: number;
}

class ResizeWindowTool extends BaseBrowserToolExecutor {
  name = 'chrome_resize_window';

  async execute(args: ResizeWindowToolParams): Promise<ToolResult> {
    const { width, height } = args;

    if (!width || !height || width <= 0 || height <= 0) {
      return createErrorResponse('Invalid parameters: width and height must be positive numbers');
    }

    try {
      let resolvedWindowId: number;

      if (args.tabId != null) {
        const tab = await this.tryGetTab(args.tabId);
        if (!tab || tab.windowId == null) {
          return createErrorResponse(`Tab not found or has no window: tabId=${args.tabId}`);
        }
        resolvedWindowId = tab.windowId;
      } else if (args.windowId != null) {
        resolvedWindowId = args.windowId;
      } else {
        const tab = await this.getActiveTabOrThrowInWindow();
        if (tab.windowId == null) {
          return createErrorResponse('Active tab has no associated window');
        }
        resolvedWindowId = tab.windowId;
      }

      await chrome.windows.update(resolvedWindowId, { width, height });

      return {
        content: [{ type: 'text', text: `Window resized to ${width}x${height}` }],
        isError: false,
      };
    } catch (error) {
      return createErrorResponse(
        `Error resizing window: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export const resizeWindowTool = new ResizeWindowTool();
