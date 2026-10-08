import type { IconProps } from "./icon-types";

export function SidebarLeftOutlineIcon({
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
        d="m6,4h2v12h-2c-1.656,0-3-1.344-3-3v-6c0-1.656,1.344-3,3-3Z"
        fill="currentColor"
        data-color="color-2"
      ></path>
      <rect
        x="3"
        y="4"
        width="14"
        height="12"
        rx="3"
        ry="3"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      ></rect>
    </svg>
  );
}
