import React from "react";
import { IconProps, strokeClass } from "./";
import { defaultStrokeClassName } from "./icons.interface";

export function ChevronRightLine({ className, color }: IconProps) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className || defaultStrokeClassName}
    >
      <path
        d="M9 18L15 12L9 6"
        className={strokeClass(color)}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
