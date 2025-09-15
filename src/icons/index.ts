export * from "./ChevronLeft";
export * from "./ChevronRight";
export * from "./ChevronDown";
export * from "./ArrowLeft";
export * from "./Spinner"

export enum IconColor {
  Primary = "primary",
  Secondary = "secondary",
  Tertiary = "tertiary",
  InvertedPrimary = "inverted-primary"
}

export type IconProps = {
  className?: string;
  color?: IconColor;
};

export const defaultFillClass = "fill-primary";
export const defaultStrokeClass = "stroke-primary";

export const fillClass = (color: IconColor | undefined) =>
  `fill-${color ? color : "primary"}`;
export const strokeClass = (color: IconColor | undefined) =>
  `stroke-${color ? color : "primary"}`;
