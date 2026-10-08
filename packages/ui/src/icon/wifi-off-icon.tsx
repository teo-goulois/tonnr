import type { IconProps } from "./icon-types";

export function WifiOffIcon({
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
        d="m11.8075,13.1428c.1234.2598.1925.5505.1925.8572,0,1.1046-.8954,2-2,2-.3068,0-.5974-.0691-.8572-.1925"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        data-color="color-2"
      ></path>
      <path
        d="m5.7574,9.7574c2.3431-2.3431,6.1421-2.3431,8.4853,0"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      ></path>
      <path
        d="m2.9289,6.9289c3.9052-3.9052,10.2369-3.9052,14.1421,0"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      ></path>
      <line
        x1="3"
        y1="17"
        x2="17"
        y2="3"
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
