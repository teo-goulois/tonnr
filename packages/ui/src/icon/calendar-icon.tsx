import type { IconProps } from "./icon-types";

export function CalendarOutlineIcon({
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
      <path
        d="m17,8v-1c0-1.6569-1.3431-3-3-3H6c-1.6569,0-3,1.3431-3,3v1h14Z"
        fill="currentColor"
      ></path>
      <line
        x1="6"
        y1="4"
        x2="6"
        y2="2"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      ></line>
      <line
        x1="14"
        y1="4"
        x2="14"
        y2="2"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      ></line>
    </svg>
  );
}
export function CalendarFillIcon({ height, size = "1em", title, width, ...props }: IconProps) {
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
        d="m5.75,4c-.4141,0-.75-.3359-.75-.75V1.25c0-.4141.3359-.75.75-.75s.75.3359.75.75v2c0,.4141-.3359.75-.75.75Z"
        fill="currentColor"
        data-color="color-2"
      ></path>
      <path
        d="m12.25,4c-.4141,0-.75-.3359-.75-.75V1.25c0-.4141.3359-.75.75-.75s.75.3359.75.75v2c0,.4141-.3359.75-.75.75Z"
        fill="currentColor"
        data-color="color-2"
      ></path>
      <path
        d="m13.75,2.5H4.25c-1.5166,0-2.75,1.2334-2.75,2.75v8.5c0,1.5166,1.2334,2.75,2.75,2.75h9.5c1.5166,0,2.75-1.2334,2.75-2.75V5.25c0-1.5166-1.2334-2.75-2.75-2.75Zm0,12.5H4.25c-.6895,0-1.25-.5605-1.25-1.25v-6.25h12v6.25c0,.6895-.5605,1.25-1.25,1.25Z"
        fill="currentColor"
      ></path>
    </svg>
  );
}
