import React from "react";
import { IconProps, defaultClassName } from "./icons.interface";

export function ArrowLeftLine({ className }: IconProps) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className || defaultClassName}
    >
      <path d="M19 12H5M5 12L12 19M5 12L12 5"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"/>
    </svg>
  );
}
