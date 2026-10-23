export type Hsl = {
  h: number;
  s: number;
  l: number;
};

export type Rgb = {
  r: number;
  g: number;
  b: number;
};

export type ColorRecord = {
  id: string;
  generatedAt: number;
  sequence: number;
  attempt: number;
  hash: string;
  hsl: Hsl;
  hex: string;
};
