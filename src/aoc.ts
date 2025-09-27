export async function fetchInput(
  session: string,
  year: number,
  day: number,
): Promise<string> {
  const url = `https://adventofcode.com/${year}/day/${day}/input`;
  const res = await fetch(url, {
    headers: {
      cookie: `session=${session}`,
      "user-agent": `wassail/0.0.1 (+https://github.com/snally-labs/wassail)`,
    },
  });
  if (res.status === 429)
    throw new Error("Rate limited (429). Try again later.");
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  return (await res.text()).trimEnd();
}
