import type { IconProps } from "./icon-types";

export function PaintRollerOutlineIcon({
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
      <rect
        x="5"
        y="3"
        width="10"
        height="3"
        rx="1"
        ry="1"
        fill="currentColor"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      ></rect>
      <path
        d="m2,4.5v1c0,2.2091,1.7909,4,4,4h2c1.1046,0,2,.8954,2,2v3.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      ></path>
      <rect
        x="9"
        y="12.5"
        width="2"
        height="4.5"
        rx=".5"
        ry=".5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        fill="currentColor"
      ></rect>
    </svg>
  );
}
