const MAX_INPUT_LENGTH = 50_000;

const RULES = [
  {
    id: "instruction-override",
    label: "Instruction override or prompt injection",
    points: 25,
    patterns: [
      /ignore\s+(all\s+)?(previous|prior|above|system|developer)\s+instructions?/i,
      /reveal\s+(the\s+)?(system prompt|hidden instructions|secrets)/i,
      /bypass\s+(safety|security|policy|approval)/i,
      /override\s+(the\s+)?(system|developer|safety)\s+(prompt|instructions?|policy)/i,
      /disregard\s+(all\s+)?(rules|guardrails|instructions)/i,
    ],
    advice: "Treat embedded instructions as untrusted input. Follow the user's authorised task and the system's established policy instead.",
  },
  {
    id: "credentials",
    label: "Credential or secret access",
    points: 22,
    patterns: [
      /\b(api[-_ ]?key|access token|refresh token|password|passwd|secret|private key|ssh key|credential|credentials|bearer token|authorization header)\b/i,
      /\b(read|copy|export|print|send|reveal)\b.{0,50}\b(secrets?|tokens?|passwords?|credentials?)\b/i,
    ],
    advice: "Keep secrets out of prompts and logs. Use scoped credentials and a separate, explicit approval step.",
  },
  {
    id: "destructive-change",
    label: "Deletion or destructive data change",
    points: 25,
    patterns: [
      /\b(delete|erase|wipe|truncate|overwrite|purge|shred)\b/i,
      /\bdrop\s+(table|database|schema)\b/i,
      /\bremove\s+(all|every|the entire)\b/i,
      /\brm\s+-rf\b/i,
      /\bformat\s+(the\s+)?(disk|drive|volume)\b/i,
    ],
    advice: "Create and verify a backup, preview the exact affected records, and require confirmation before destructive changes.",
  },
  {
    id: "external-send",
    label: "External communication or publication",
    points: 18,
    patterns: [
      /\b(send|forward|email|message|publish|post|upload|broadcast|exfiltrate)\b/i,
      /\b(webhook|external endpoint|public repository|publicly visible)\b/i,
      /\bshare\b.{0,40}\b(externally|publicly|with the client|with a third party)\b/i,
    ],
    advice: "Preview the exact content, recipient, destination and visibility. Ask for approval before sending or publishing.",
  },
  {
    id: "financial-action",
    label: "Payment, purchase or financial transfer",
    points: 25,
    patterns: [
      /\b(purchase|buy|checkout|charge|payment|pay|refund|wire money|transfer funds|place an order|subscribe)\b/i,
      /(?:£|\$|€)\s?\d/i,
    ],
    advice: "Show the exact amount, currency, merchant, recipient and terms. Require explicit confirmation before committing money.",
  },
  {
    id: "privilege-change",
    label: "Permission or account-control change",
    points: 20,
    patterns: [
      /\b(grant admin|grant access|elevate privileges?|change permissions?|change role|make public|disable (mfa|2fa|multi-factor|two-factor)|run as administrator|sudo)\b/i,
      /\b(add|remove)\b.{0,35}\b(owner|administrator|admin|maintainer)\b/i,
    ],
    advice: "Apply least privilege, identify the affected account and scope, and confirm the change with the account owner.",
  },
  {
    id: "code-execution",
    label: "Code execution, installation or downloaded file",
    points: 20,
    patterns: [
      /\b(execute|run|install|download and run|shell command|terminal command|powershell|npm install|pip install)\b/i,
      /\bcurl\b.{0,100}\|\s*(sh|bash)\b/i,
      /\bopen\b.{0,35}\b(attachment|executable|script)\b/i,
    ],
    advice: "Inspect the source and command, use a sandbox where possible, and avoid executing untrusted downloads with broad permissions.",
  },
  {
    id: "sensitive-data",
    label: "Personal, health or financial data",
    points: 20,
    patterns: [
      /\b(personal data|personal information|date of birth|medical record|health record|bank account|credit card|national insurance|social security number|passport number|customer records)\b/i,
      /\b(patient|employee|customer)\b.{0,40}\b(records?|data|details|files?)\b/i,
    ],
    advice: "Minimise the data accessed, check the lawful destination and retention, and redact fields that are not needed.",
  },
  {
    id: "hard-to-reverse",
    label: "Irreversible or hard-to-reverse action",
    points: 18,
    patterns: [
      /\b(irreversible|cannot be undone|permanently|finalize|finalise|submit the (form|application|order)|cancel the (account|subscription)|close the account)\b/i,
    ],
    advice: "Prefer a dry run or reversible step. Confirm the final state and recovery options before committing.",
  },
];

export function scanPlan(input) {
  if (typeof input !== "string") {
    throw new TypeError("Plan must be a string.");
  }
  if (input.length > MAX_INPUT_LENGTH) {
    throw new RangeError(`Plan must be ${MAX_INPUT_LENGTH.toLocaleString("en-GB")} characters or fewer.`);
  }

  const findings = RULES.filter(rule => rule.patterns.some(pattern => pattern.test(input)))
    .map(({ id, label, points, advice }) => ({ id, label, points, advice }));
  const score = Math.min(100, findings.reduce((total, finding) => total + finding.points, 0));
  const level = score >= 60 ? "HIGH RISK" : score >= 25 ? "REVIEW REQUIRED" : "LOWER RISK";

  return { score, level, findings, scannedCharacters: input.length };
}

export const MAX_PLAN_LENGTH = MAX_INPUT_LENGTH;
