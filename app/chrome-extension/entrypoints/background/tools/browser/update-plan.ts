import { createErrorResponse, ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';

interface UpdatePlanToolParams {
  domains: string[];
  approach: string[];
}

class UpdatePlanTool extends BaseBrowserToolExecutor {
  name = 'chrome_update_plan';

  async execute(args: UpdatePlanToolParams): Promise<ToolResult> {
    const { domains, approach } = args;

    if (!Array.isArray(domains)) {
      return createErrorResponse('Invalid parameters: domains must be an array');
    }
    if (!Array.isArray(approach)) {
      return createErrorResponse('Invalid parameters: approach must be an array');
    }

    const domainsLine = domains.length > 0 ? domains.join(', ') : '(none)';
    const approachLines = approach.map((step, i) => `${i + 1}. ${step}`).join('\n');

    const text = `Plan approved.\n\nDomains: ${domainsLine}\nApproach:\n${approachLines}`;

    return {
      content: [{ type: 'text', text }],
      isError: false,
    };
  }
}

export const updatePlanTool = new UpdatePlanTool();
