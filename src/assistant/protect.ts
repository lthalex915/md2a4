/** Stash fenced code and existing ::: containers so later passes do not wrap them. */

const CODE = (i: number) => `@@CODE${i}@@`;
const BOX = (i: number) => `@@BOX${i}@@`;

export function protectRegions(src: string): { text: string; restore: (s: string) => string } {
  const held: string[] = [];
  const stash = (m: string, kind: "code" | "box") => {
    const i = held.length;
    held.push(m);
    return kind === "code" ? CODE(i) : BOX(i);
  };
  let text = src.replace(/```[\s\S]*?```/g, (m) => stash(m, "code"));
  text = text.replace(/^:::[\w-]+[^\n]*\r?\n[\s\S]*?^:::/gm, (m) => stash(m, "box"));
  text = text.replace(/`[^`\n]+`/g, (m) => stash(m, "code"));
  return {
    text,
    restore: (s: string) =>
      s
        .replace(/@@BOX(\d+)@@/g, (_, n) => held[Number(n)] ?? "")
        .replace(/@@CODE(\d+)@@/g, (_, n) => held[Number(n)] ?? ""),
  };
}
