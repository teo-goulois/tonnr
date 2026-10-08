import type { IconProps } from "./icon-types";

export function VolumeOffOutlineIcon({
  height,
  size = "1em",
  strokeWidth = 1.5,
  title,
  width,
  ...props
}: IconProps) {
  return (
    <svg
      height={height ?? size}
      width={width ?? size}
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <path
        d="M13.75 5.14301V2.664C13.75 2.269 13.313 2.03 12.98 2.243L7.5 5.75101H3.75C2.922 5.75101 2.25 6.42301 2.25 7.25101V10.751C2.25 11.579 2.922 12.251 3.75 12.251H6.38"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      ></path>
      <path
        d="M9.42419 13.4815L12.981 15.758C13.314 15.971 13.751 15.732 13.751 15.337V9.3092"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      ></path>
      <path
        d="M2.75 15.75L16.75 2.25"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        data-color="color-2"
        fill="none"
      ></path>
    </svg>
  );
}
