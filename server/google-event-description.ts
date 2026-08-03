const managedDescriptionPatterns = [
  /^Typ:\s*(?:Zápas|Tréning|Team building)\s*$/i,
  /^Súper:\s*.*$/i,
  /^Strana:\s*(?:Domáci|Vypravení)\s*$/i,
  /^Účasť:\s*Idú\s+\d+,\s*Možno\s+\d+,\s*Neidú\s+\d+\s*$/i,
  /^(?:Idú|Možno|Neidú):\s*.*$/i,
];

export function getUserEventDescription(description?: string | null) {
  if (!description) return null;

  const lines = description
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter(line => !managedDescriptionPatterns.some(pattern => pattern.test(line.trim())));

  while (lines[0]?.trim() === "") lines.shift();
  while (lines.at(-1)?.trim() === "") lines.pop();

  const userDescription = lines.join("\n").trim();
  return userDescription || null;
}
