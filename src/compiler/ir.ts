export type ThemeId = "classic" | "navy" | "palatino";

export type TermItem = { name: string; def: string };

export type Block =
  | { type: "section"; id: string; number: string | null; title: string; html: string }
  | { type: "subsection"; id: string; number: string | null; title: string; html: string }
  | { type: "para"; html: string; text: string }
  | { type: "list"; ordered: boolean; title: string | null; items: string[]; steps?: boolean }
  | { type: "terms"; title: string | null; items: TermItem[] }
  | { type: "example"; title: string | null; name: string | null; blocks: Block[] }
  | { type: "code"; text: string; lang: string | null }
  | { type: "equation"; tex: string; number: string | null; name: string | null; id: string | null }
  | { type: "table"; caption: string | null; headers: string[]; rows: string[][] }
  | { type: "note"; html: string; text: string }
  | {
      type: "aside";
      anchor: string | null;
      kind: string | null;
      title: string | null;
      items: string[] | null;
      html: string | null;
      text: string | null;
    };

export type IR = {
  theme: ThemeId;
  lang: string;
  title: string | null;
  chapter: string | null;
  header_left: string | null;
  header_right: string | null;
  footer_left: string | null;
  folio: string | null;
  blocks: Block[];
};

export const THEME_IDS: ThemeId[] = ["classic", "navy", "palatino"];

export function isThemeId(value: string): value is ThemeId {
  return THEME_IDS.includes(value as ThemeId);
}

export function emptyIR(theme: ThemeId = "classic"): IR {
  return {
    theme,
    lang: "en",
    title: null,
    chapter: null,
    header_left: null,
    header_right: null,
    footer_left: null,
    folio: null,
    blocks: [],
  };
}
