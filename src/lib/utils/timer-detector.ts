interface DetectedTimer {
  minutes: number;
  label: string;
}

const TIME_PATTERNS = [
  /(?:for\s+)?(\d+)\s*(?:-\s*\d+\s*)?(?:minute|min)s?\b/gi,
  /(?:for\s+)?(\d+)\s*(?:-\s*\d+\s*)?(?:hour|hr)s?\b/gi,
  /(?:for\s+)?(\d+)\s*(?:-\s*\d+\s*)?(?:second|sec)s?\b/gi,
];

const ACTION_WORDS = [
  "bake",
  "cook",
  "simmer",
  "boil",
  "roast",
  "grill",
  "fry",
  "sauté",
  "saute",
  "steam",
  "broil",
  "rest",
  "chill",
  "freeze",
  "marinate",
  "proof",
  "rise",
  "set",
  "cool",
  "wait",
  "let sit",
  "microwave",
  "toast",
  "brown",
  "reduce",
  "blanch",
];

export function detectTimer(instruction: string): DetectedTimer | null {
  const lower = instruction.toLowerCase();

  // Try minutes first
  const minMatch = /(?:for\s+)?(\d+)\s*(?:-\s*(\d+)\s*)?(?:minute|min)s?\b/i.exec(lower);
  if (minMatch) {
    const min1 = parseInt(minMatch[1], 10);
    const min2 = minMatch[2] ? parseInt(minMatch[2], 10) : null;
    const minutes = min2 ? Math.round((min1 + min2) / 2) : min1;
    return { minutes, label: findActionWord(lower) };
  }

  // Try hours
  const hrMatch = /(?:for\s+)?(\d+)\s*(?:-\s*(\d+)\s*)?(?:hour|hr)s?\b/i.exec(lower);
  if (hrMatch) {
    const hr1 = parseInt(hrMatch[1], 10);
    const hr2 = hrMatch[2] ? parseInt(hrMatch[2], 10) : null;
    const hours = hr2 ? Math.round((hr1 + hr2) / 2) : hr1;
    return { minutes: hours * 60, label: findActionWord(lower) };
  }

  // Try seconds
  const secMatch = /(?:for\s+)?(\d+)\s*(?:-\s*(\d+)\s*)?(?:second|sec)s?\b/i.exec(lower);
  if (secMatch) {
    const sec1 = parseInt(secMatch[1], 10);
    const sec2 = secMatch[2] ? parseInt(secMatch[2], 10) : null;
    const seconds = sec2 ? Math.round((sec1 + sec2) / 2) : sec1;
    return { minutes: Math.max(1, Math.round(seconds / 60)), label: findActionWord(lower) };
  }

  return null;
}

function findActionWord(text: string): string {
  for (const action of ACTION_WORDS) {
    if (text.includes(action)) {
      return action.charAt(0).toUpperCase() + action.slice(1);
    }
  }
  return "Timer";
}
