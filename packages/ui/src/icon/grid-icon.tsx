import type { IconProps } from "./icon-types";

export function GridOutlineIcon({
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
        x="3"
        y="3"
        width="5"
        height="5"
        rx="1.5"
        ry="1.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      ></rect>
      <rect
        x="12"
        y="3"
        width="5"
        height="5"
        rx="1.5"
        ry="1.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      ></rect>
      <rect
        x="3"
        y="12"
        width="5"
        height="5"
        rx="1.5"
        ry="1.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      ></rect>
      <rect
        x="12"
        y="12"
        width="5"
        height="5"
        rx="1.5"
        ry="1.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      ></rect>
    </svg>
  );
}
