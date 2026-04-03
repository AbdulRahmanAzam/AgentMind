/**
 * ANSI terminal formatting utilities for rich pseudoterminal output.
 *
 * All AgentPseudoterminal output goes through these helpers
 * to ensure consistent, colourful, scannable agent logs.
 */

// ─── ANSI codes ─────────────────────────────────────────────────

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const ITALIC = '\x1b[3m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const MAGENTA = '\x1b[35m';
const CYAN = '\x1b[36m';
const WHITE = '\x1b[37m';
const BG_BLUE = '\x1b[44m';

const MAX_LEN = 200;

function truncate(text: string, max = MAX_LEN): string {
  if (text.length <= max) {
    return text;
  }
  return text.slice(0, max) + '...';
}

export class TerminalFormatter {
  /** Bold white-on-blue full-width header. */
  static header(text: string): string {
    return `${BG_BLUE}${BOLD}${WHITE} ${text} ${RESET}`;
  }

  /** Dimmed italic "thinking" line. */
  static thinking(text: string): string {
    return `${DIM}${ITALIC}💭 ${truncate(text)}${RESET}`;
  }

  /** Cyan tool-call line. */
  static toolCall(toolName: string, input: string): string {
    return `${CYAN}🔧 [${toolName}] ${truncate(input, 150)}${RESET}`;
  }

  /** Green ✓ or red ✗ tool result. */
  static toolResult(success: boolean, output: string): string {
    if (success) {
      return `${GREEN}  ✓ ${truncate(output)}${RESET}`;
    }
    return `${RED}  ✗ ${truncate(output)}${RESET}`;
  }

  /** Yellow inter-agent message. */
  static message(from: string, content: string): string {
    return `${YELLOW}💬 [${from}]: ${truncate(content)}${RESET}`;
  }

  /** Magenta task status update. */
  static taskUpdate(taskId: string, status: string): string {
    return `${MAGENTA}📋 [${taskId}] → ${status}${RESET}`;
  }

  /** Bold red error. */
  static error(text: string): string {
    return `${RED}${BOLD}❌ ${truncate(text)}${RESET}`;
  }

  /** Bold green success. */
  static success(text: string): string {
    return `${GREEN}${BOLD}✅ ${truncate(text)}${RESET}`;
  }

  /** White info. */
  static info(text: string): string {
    return `${WHITE}ℹ️  ${truncate(text)}${RESET}`;
  }

  /** Dimmed horizontal rule. */
  static separator(): string {
    return `${DIM}${'─'.repeat(60)}${RESET}`;
  }

  /** Formatted agent identity banner. */
  static agentHeader(
    agentId: string,
    roleName: string,
    icon: string,
  ): string {
    return [
      '',
      TerminalFormatter.header(`${icon}  ${roleName}`),
      `${DIM}Agent ID: ${agentId}${RESET}`,
      TerminalFormatter.separator(),
      '',
    ].join('\r\n');
  }

  /** Simple text progress bar. */
  static progress(
    completed: number,
    total: number,
    label: string,
  ): string {
    const width = 20;
    const filled = total > 0 ? Math.round((completed / total) * width) : 0;
    const empty = width - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    return `${BLUE}[${bar}] ${completed}/${total} ${label}${RESET}`;
  }

  /** Dimmed timestamp [HH:MM:SS]. */
  static timestamp(): string {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    return `${DIM}[${h}:${m}:${s}]${RESET}`;
  }
}
