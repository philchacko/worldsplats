import React from "react";
import { IconProps, defaultClassName } from "./icons.interface";

export function ChevronDownLine({ className }: IconProps) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className || defaultClassName}
    >
      <path
        d="M6 9L12 15L18 9"
        // stroke="black"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
