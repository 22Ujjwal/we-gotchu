// A link's repository takes precedence over shorthand in its display label.
export function referencedPRs(text, repository) {
  const numbers = new Set();
  const prose = text.replace(/\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/gi, '$1')
    .replace(/https?:\/\/[^\s<>\])]+/gi, value => {
      try {
        const url = new URL(value);
        const match = url.pathname.match(/^\/([^/]+\/[^/]+)\/pull\/(\d+)(?:\/|$)/);
        if (url.hostname === 'github.com' && !url.username && !url.password && match?.[1].toLowerCase() === repository.toLowerCase()) numbers.add(Number(match[2]));
      } catch { /* Invalid URLs are source text, not local PR references. */ }
      return ' ';
    });
  for (const match of prose.matchAll(/\bPR\s*#(\d+)\b/gi)) numbers.add(Number(match[1]));
  return [...numbers].filter(n => Number.isSafeInteger(n) && n > 0).sort((a, b) => a - b);
}
