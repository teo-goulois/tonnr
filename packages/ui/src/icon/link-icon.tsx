import type { IconProps } from "./icon-types";

export function LinkOutlineIcon({
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
      <path
        d="m11,6l-1.9645-1.9645c-1.3807-1.3807-3.6193-1.3807-5,0h0c-1.3807,1.3807-1.3807,3.6193,0,5l1.9645,1.9645"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      ></path>
      <path
        d="m9,14l1.9645,1.9645c1.3807,1.3807,3.6193,1.3807,5,0h0c1.3807-1.3807,1.3807-3.6193,0-5l-1.9645-1.9645"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      ></path>
      <line
        x1="12"
        y1="12"
        x2="8"
        y2="8"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      ></line>
    </svg>
  );
}
