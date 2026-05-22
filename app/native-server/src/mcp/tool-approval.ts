const COMPUTER_WRITE_ACTIONS = new Set([
  'type',
  'fill_form',
  'key',
  'scroll',
  'scroll_to',
  'hover',
]);

const WRITE_TOOLS = new Set([
  'chrome_click_element',
  'chrome_fill_or_select',
  'chrome_keyboard',
  'chrome_javascript',
  'chrome_close_tabs',
  'chrome_handle_dialog',
]);

export function requiresApproval(name: string, args: any): boolean {
  if (WRITE_TOOLS.has(name)) return true;

  if (name === 'chrome_navigate') {
    if (args?.refresh === true) return false;
    return typeof args?.url === 'string' && args.url.trim().length > 0;
  }

  if (name === 'chrome_computer') {
    return COMPUTER_WRITE_ACTIONS.has(String(args?.action || '').toLowerCase());
  }

  return false;
}
