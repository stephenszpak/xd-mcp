export interface XDColor {
  r: number;
  g: number;
  b: number;
  a?: number;
}

export interface XDFill {
  type: 'solid' | 'gradient' | 'none';
  color?: XDColor;
  gradient?: {
    type: string;
    stops: Array<{ color: XDColor; position: number }>;
  };
}

export interface XDStroke {
  color: XDColor;
  width: number;
  position: 'inside' | 'outside' | 'center';
  dash?: number[];
}

export interface XDShadow {
  color: XDColor;
  x: number;
  y: number;
  blur: number;
  spread?: number;
}

export interface XDTextStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: number | string;
  fontStyle?: string;
  lineHeight?: number;
  letterSpacing?: number;
  textAlign?: string;
  color?: XDColor;
  textTransform?: string;
  textDecoration?: string;
}

export interface XDElement {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  fills?: XDFill[];
  strokes?: XDStroke[];
  shadows?: XDShadow[];
  opacity?: number;
  borderRadius?: number | number[];
  textStyle?: XDTextStyle;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  children?: XDElement[];
}

export interface XDArtboard {
  id: string;
  name: string;
  width: number;
  height: number;
  background?: XDFill;
  children: XDElement[];
}

export interface XDDesignToken {
  name: string;
  value: string;
  type: 'color' | 'typography' | 'spacing' | 'shadow' | 'border-radius';
  raw: unknown;
}

export interface ArtboardSpecs {
  name: string;
  dimensions: { width: number; height: number };
  colors: ColorSpec[];
  typography: TypographySpec[];
  spacing: SpacingSpec[];
  borders: BorderSpec[];
  shadows: ShadowSpec[];
  elements: ElementSpec[];
}

export interface ColorSpec {
  elementName: string;
  role: 'fill' | 'stroke' | 'text';
  hex: string;
  rgba: string;
  opacity: number;
}

export interface TypographySpec {
  elementName: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number | string;
  lineHeight?: number;
  letterSpacing?: number;
  textAlign?: string;
  color?: string;
  textTransform?: string;
}

export interface SpacingSpec {
  elementName: string;
  x: number;
  y: number;
  width: number;
  height: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
}

export interface BorderSpec {
  elementName: string;
  color: string;
  width: number;
  position: string;
  borderRadius?: string;
}

export interface ShadowSpec {
  elementName: string;
  cssValue: string;
}

export interface ElementSpec {
  name: string;
  type: string;
  dimensions: { width: number; height: number };
  position: { x: number; y: number };
  fills: string[];
  opacity: number;
  borderRadius?: string;
}

export interface GlobalTokens {
  colors: Record<string, string>;
  typography: Record<string, Partial<TypographySpec>>;
  spacing: number[];
  shadows: Record<string, string>;
}

export interface TokenDiff {
  added: Record<string, string>;
  changed: Record<string, { existing: string; new: string }>;
  unchanged: Record<string, string>;
  removedFromScss: Record<string, string>;
}
