import type { IconProps } from "./icon-types";
import type { SVGProps } from "react";

// Nucleo's "loader" glyph: the spokes fade from full to 13% opacity, so it
// reads as already spinning even when it is standing still.
export function LoaderFillIcon({
  height,
  size = "1em",
  strokeWidth = 2,
  title,
  width,
  ...props
}: IconProps) {
  return (
    <svg
      height={height ?? size}
      width={width ?? size}
      viewBox="0 0 20 20"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <line
        x1="10"
        y1="3"
        x2="10"
        y2="5.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      ></line>
      <line
        x1="14.95"
        y1="5.05"
        x2="13.182"
        y2="6.818"
        fill="none"
        opacity=".88"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      ></line>
      <line
        x1="17"
        y1="10"
        x2="14.5"
        y2="10"
        fill="none"
        opacity=".75"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      ></line>
      <line
        x1="14.95"
        y1="14.95"
        x2="13.182"
        y2="13.182"
        fill="none"
        opacity=".63"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      ></line>
      <line
        x1="10"
        y1="17"
        x2="10"
        y2="14.5"
        fill="none"
        opacity=".5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      ></line>
      <line
        x1="5.05"
        y1="14.95"
        x2="6.818"
        y2="13.182"
        fill="none"
        opacity=".38"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      ></line>
      <line
        x1="3"
        y1="10"
        x2="5.5"
        y2="10"
        fill="none"
        opacity=".25"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      ></line>
      <line
        x1="5.05"
        y1="5.05"
        x2="6.818"
        y2="6.818"
        fill="none"
        opacity=".13"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      ></line>
    </svg>
  );
}

// Lucide's "loader" glyph (ISC), kept as a local icon: it reads better at
// small sizes while spinning than the Nucleo equivalents.
export function LoaderIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M12 2v4" />
      <path d="m16.2 7.8 2.9-2.9" />
      <path d="M18 12h4" />
      <path d="m16.2 16.2 2.9 2.9" />
      <path d="M12 18v4" />
      <path d="m4.9 19.1 2.9-2.9" />
      <path d="M2 12h4" />
      <path d="m4.9 4.9 2.9 2.9" />
    </svg>
  );
}
