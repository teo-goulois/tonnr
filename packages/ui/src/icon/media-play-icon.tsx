import type { IconProps } from "./icon-types";

export function MediaPlayOutlineIcon({
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
        d="m5,5.4826v9.0348c0,1.122,1.198,1.8376,2.1859,1.3056l8.3894-4.5174c1.0398-.5599,1.0398-2.0513,0-2.6112L7.1859,4.177c-.9879-.532-2.1859.1836-2.1859,1.3056Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      ></path>
    </svg>
  );
}
