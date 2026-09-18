export type ChangeKind = "import" | "front-matter" | "structure" | "math";

export type Change = {
  id: string;
  kind: ChangeKind;
  summary: string;
};

export type PrepareResult = {
  source: string;
  markdown: string;
  changes: Change[];
  via: "local" | "ai";
};

